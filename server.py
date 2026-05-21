"""
RoverFamily Backend Server
==========================
Flask backend che integra dati statici (data.json) con dati LIVE
scrapeati dal sito ufficiale del Comune di Rovereto.

Endpoints:
- GET /api/data           -> data.json + novita live + avvisi live
- GET /api/notizie        -> notizie live dal Comune
- GET /api/avvisi         -> avvisi live dal Comune
- GET /api/novita-comune  -> delibere/novita formato dashboard
- GET /api/refresh        -> forza refresh cache
- GET /                   -> serve index.html (frontend)
- GET /<path>             -> serve file statici (style.css, app.js, data.json)
"""
from flask import Flask, jsonify, send_from_directory, request
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import re
import threading
from urllib.parse import urljoin
from datetime import datetime

# ─── Setup ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROVERETO_BASE = "https://www.comune.rovereto.tn.it"
CACHE_TTL = 60 * 30  # 30 minuti
HTTP_TIMEOUT = 12
USER_AGENT = "Mozilla/5.0 (RoverFamily/1.0; +https://www.comune.rovereto.tn.it)"

app = Flask(__name__, static_folder=None)

# ─── Cache thread-safe ──────────────────────────────────────────────
_cache_lock = threading.Lock()
_cache = {}

def cache_get(key):
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        if time.time() - entry["ts"] > CACHE_TTL:
            return None
        return entry["data"]

def cache_set(key, data):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": time.time()}

def cache_clear():
    with _cache_lock:
        _cache.clear()


# ─── HTTP helper ───────────────────────────────────────────────────
def fetch_html(url):
    """Scarica una pagina HTML del Comune di Rovereto (UTF-8 forzato)."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "it-IT,it;q=0.9"}
    resp = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    # Il sito comune.rovereto.tn.it serve UTF-8 ma a volte requests lo sbaglia
    resp.encoding = "utf-8"
    return resp.text


# ─── Scrapers ──────────────────────────────────────────────────────
def parse_date_it(date_str):
    """Normalizza data tipo '07/05/2026' -> '07 Maggio 2026'."""
    months_it = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                 "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"]
    m = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", date_str)
    if not m:
        return date_str.strip()
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return f"{d:02d} {months_it[mo-1]} {y}"
    except IndexError:
        return date_str.strip()


def extract_items_from_listing(html, base_url):
    """Parsing generico per pagine /Novita/Notizie e /Novita/Avvisi del CMS OpenCity."""
    soup = BeautifulSoup(html, "html.parser")
    items = []

    # Strategia 1: card OpenCity (articoli con h3 + link)
    articles = soup.find_all(["article", "div", "li"], class_=re.compile(r"(card|news|notizia|avviso|item|article|elenco)", re.I))

    for art in articles:
        title_el = art.find(["h2", "h3", "h4"])
        if not title_el:
            continue
        link_el = title_el.find("a") or art.find("a", href=True)
        if not link_el or not link_el.get("href"):
            continue

        title = title_el.get_text(strip=True)
        if len(title) < 8:
            continue
        link = urljoin(base_url, link_el["href"])

        # Data pubblicazione
        date_text = ""
        date_el = art.find(string=re.compile(r"\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}"))
        if date_el:
            m = re.search(r"\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}", date_el)
            if m:
                date_text = m.group(0)

        # Descrizione breve
        desc = ""
        for p in art.find_all("p"):
            t = p.get_text(strip=True)
            if t and "Data di pubblicazione" not in t and len(t) > 20:
                desc = t[:280]
                break

        items.append({
            "titolo": title,
            "link": link,
            "data_raw": date_text,
            "data": parse_date_it(date_text) if date_text else "Recente",
            "descrizione": desc,
        })

    # Dedup per link
    seen = set()
    unique = []
    for it in items:
        if it["link"] in seen:
            continue
        seen.add(it["link"])
        unique.append(it)

    return unique


def scrape_notizie():
    """Scarica le notizie pubbliche del Comune di Rovereto."""
    cached = cache_get("notizie")
    if cached:
        return cached

    url = f"{ROVERETO_BASE}/Novita/Notizie"
    try:
        html = fetch_html(url)
        items = extract_items_from_listing(html, url)
        # Tag tipo
        for i in items:
            i["tipo"] = "notizia"
            i["fonte"] = "Comune di Rovereto"
        cache_set("notizie", items)
        return items
    except Exception as e:
        print(f"[scrape_notizie] errore: {e}")
        return []


def scrape_avvisi():
    """Scarica gli avvisi del Comune di Rovereto."""
    cached = cache_get("avvisi")
    if cached:
        return cached

    url = f"{ROVERETO_BASE}/Novita/Avvisi"
    try:
        html = fetch_html(url)
        items = extract_items_from_listing(html, url)
        for i in items:
            i["tipo"] = "avviso"
            i["fonte"] = "Comune di Rovereto"
        cache_set("avvisi", items)
        return items
    except Exception as e:
        print(f"[scrape_avvisi] errore: {e}")
        return []


# ─── Classificazione + sintesi AI-style ────────────────────────────
CATEGORY_RULES = [
    ("scuole",     ["scuol", "nido", "infanzia", "ammission", "didatt", "asilo", "iscrizione", "famigli"]),
    ("mobilita",   ["mobilit", "traffico", "parcheggi", "ciclabil", "pums", "strad", "trasport", "viabilit", "circonvallazion", "ferrovi", "treno"]),
    ("aree-verdi", ["parco", "parchi", "giardin", "gioco", "ludic", "altalen", "verde"]),
    ("welfare",    ["welfare", "isee", "agevolazion", "contribut", "bonus", "famiglie numerose", "social"]),
]

def classify_news(title, desc):
    """Restituisce 'scuole'|'mobilita'|'aree-verdi'|'welfare'|'altro'."""
    text = (title + " " + (desc or "")).lower()
    for cat, kws in CATEGORY_RULES:
        if any(kw in text for kw in kws):
            return cat
    return "altro"


# ─── Scraping del corpo dell'articolo per riassunti migliori ────────
NOISE_PATTERNS = [
    re.compile(r"^\s*(data di pubblicazione|allegati|ulteriori dettagli|condividi|stampa|torna|argomenti|tipologia di contenuto|tempo di lettura|vedi azioni|invia)", re.I),
    re.compile(r"^\s*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\s*$"),
    re.compile(r"^[\W\d_]+$"),  # solo punteggiatura/cifre
    re.compile(r"^(facebook|twitter|linkedin|whatsapp)\s*$", re.I),
]

# Header tipo "Descrizione", "Riepilogo percorso" da rimuovere dall'inizio
SECTION_HEADER_RX = re.compile(r"^(descrizione|riepilogo[^\.]{0,40}|introduzione|contenuto|sintesi)\s+", re.I)


def scrape_article_body(url, max_chars=3500):
    """Scarica la pagina di dettaglio di un articolo ed estrae il testo principale.
    OpenCity Italia (CMS usato da Rovereto) usa il tag <article> per il contenuto."""
    if not url:
        return ""
    cache_key = f"body::{url}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        html = fetch_html(url)
    except Exception as e:
        print(f"[scrape_article_body] {url}: {e}")
        cache_set(cache_key, "")
        return ""

    soup = BeautifulSoup(html, "html.parser")
    # OpenCity usa <article class="it-page-section"> - prendiamo il PIÙ GRANDE
    articles = soup.find_all("article")
    container = None
    if articles:
        container = max(articles, key=lambda a: len(a.get_text(strip=True)))
    else:
        container = soup.find("main") or soup.find("body") or soup

    # Rimuovi rumore strutturale DENTRO il container scelto
    for tag in container(["script", "style", "noscript", "nav", "header", "footer", "form", "button"]):
        tag.decompose()
    for tag in container.find_all(class_=re.compile(r"\bbreadcrumb\b|\bshare\b|\bsocial-?(share|icons?)?\b|\bcookie\b|\brelated\b", re.I)):
        tag.decompose()

    # Estrai paragrafi significativi
    paragraphs = []
    for p in container.find_all(["p", "li"]):
        t = p.get_text(" ", strip=True)
        if not t or len(t) < 25:
            continue
        if any(rx.search(t) for rx in NOISE_PATTERNS):
            continue
        # Rimuovi header di sezione iniziali tipo "Descrizione Con seduta..."
        t = SECTION_HEADER_RX.sub("", t)
        paragraphs.append(t)

    text = " ".join(paragraphs)
    text = re.sub(r"\s+", " ", text).strip()[:max_chars]
    cache_set(cache_key, text)
    return text


# ─── Sintesi: euristiche di scoring ────────────────────────────────
NOISE_SENT_RX = re.compile(
    r"\bart\.\s*\d|"            # rif. articoli di legge
    r"\bcomma\s*\d|"             # comma X
    r"\bprot\.|"                  # protocollo
    r"\bd\.lgs|"                  # decreto legislativo
    r"\bdpr\b|"
    r"\bdelibera(zione)?\b|"
    r"\bn\.\s*\d+/\d+|"          # tipo "n. 36/2023"
    r"^\s*-\s*$",
    re.I
)

STOPWORD_START_RX = re.compile(r"^(ai sensi|in attuazione|preso atto|considerato|visto|vista|premesso)", re.I)

INFORMATIVE_KW = [
    "comune", "famigli", "scuol", "nido", "infanzia", "bambin", "bonus",
    "contribut", "isee", "ferrovi", "mobilit", "trasport", "parcheggi",
    "parco", "ludic", "asilo", "welfare", "iscrizione", "domanda", "bando",
    "scadenza", "tariff", "agevolazion", "treno", "linea", "stazione",
    "censimento", "rilev", "anagrafic", "sportell", "centro", "rovereto",
]


def _score_sentence(s, idx):
    """Score: più alto = miglior candidato per il riassunto."""
    if NOISE_SENT_RX.search(s):
        return -100
    if STOPWORD_START_RX.search(s):
        return -50
    if len(s) < 30 or len(s) > 260:
        return -10
    score = 0
    # Bonus posizione (le prime 3 frasi del corpo)
    score += max(0, 8 - idx * 2)
    # Bonus parole informative
    sl = s.lower()
    score += sum(2 for kw in INFORMATIVE_KW if kw in sl)
    # Penalità per troppe cifre / sigle
    digit_ratio = sum(c.isdigit() for c in s) / max(len(s), 1)
    if digit_ratio > 0.15:
        score -= 5
    # Bonus se finisce con punto (frase completa)
    if s.rstrip().endswith("."):
        score += 1
    return score


def _split_sentences(text):
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Ý])", text)
    return [p.strip() for p in parts if len(p.strip()) > 15]


def generate_sintesi_ai(title, desc, body=""):
    """
    Genera 2 bullet point informativi dal contenuto reale dell'articolo.
    Strategia: preferisce body (pagina di dettaglio) -> desc -> title.
    Scoring filtra noise burocratico (art./comma/prot./delibera).
    """
    text = body or desc or title
    text = re.sub(r"\s+", " ", text).strip()

    sentences = _split_sentences(text)
    if not sentences:
        return [
            title[:200],
            "Apri il link al sito ufficiale per i dettagli dell'avviso."
        ]

    # Scoring
    scored = [(s, _score_sentence(s, i)) for i, s in enumerate(sentences)]
    scored.sort(key=lambda t: t[1], reverse=True)

    picks = []
    for s, sc in scored:
        if sc < 0:
            continue
        # Evita duplicati e frasi quasi identiche al titolo
        if any(_overlap_ratio(s, p) > 0.6 for p in picks):
            continue
        if _overlap_ratio(s, title) > 0.7:
            continue
        picks.append(s)
        if len(picks) == 2:
            break

    # Fallback: prendi le prime 2 frasi non-noise
    if len(picks) < 2:
        for s in sentences:
            if NOISE_SENT_RX.search(s):
                continue
            if s in picks:
                continue
            picks.append(s)
            if len(picks) == 2:
                break

    while len(picks) < 2:
        picks.append("Consulta il sito del Comune di Rovereto per i dettagli completi.")

    # Trunca pulito a 220 char
    return [_truncate_nice(picks[0], 220), _truncate_nice(picks[1], 220)]


def _overlap_ratio(a, b):
    """Quota di parole significative in comune (rough Jaccard)."""
    wa = set(w for w in re.findall(r"\w+", a.lower()) if len(w) > 3)
    wb = set(w for w in re.findall(r"\w+", b.lower()) if len(w) > 3)
    if not wa or not wb:
        return 0
    return len(wa & wb) / min(len(wa), len(wb))


def _truncate_nice(s, n):
    if len(s) <= n:
        return s
    cut = s[:n]
    last_space = cut.rfind(" ")
    if last_space > n * 0.7:
        cut = cut[:last_space]
    return cut.rstrip(",.;:") + "…"


# ─── Mappatura su formato `novita_comune` del frontend ─────────────
DEEP_FETCH_LIMIT = 12  # quanti articoli scaricare in dettaglio per il riassunto

def map_to_novita_comune(items, prefix="Notizia", deep_fetch=True):
    """
    Converte gli item scrapeati nel formato atteso dal frontend.
    Se deep_fetch=True, scarica la pagina di dettaglio per generare un
    riassunto più ricco. Limitato a DEEP_FETCH_LIMIT articoli per call.
    """
    out = []
    for idx, it in enumerate(items):
        anno = re.search(r"(\d{4})", it.get("data_raw", "")) or re.search(r"(\d{4})", it.get("data", ""))
        anno_str = anno.group(1) if anno else str(datetime.now().year)
        ident = f"{prefix} Comune n. {idx+1}/{anno_str}"

        # Scarica corpo articolo per i primi DEEP_FETCH_LIMIT
        body = ""
        if deep_fetch and idx < DEEP_FETCH_LIMIT and it.get("link"):
            body = scrape_article_body(it["link"])

        # Riclassifica sul body completo se disponibile
        cat = classify_news(it["titolo"], body or it.get("descrizione", ""))
        sintesi = generate_sintesi_ai(it["titolo"], it.get("descrizione", ""), body)

        out.append({
            "delibera": ident,
            "data": it.get("data", "Recente"),
            "oggetto_ufficiale": it["titolo"],
            "sintesi_ai": sintesi,
            "categoria": cat,
            "link": it.get("link", ""),
            "fonte": it.get("fonte", "Comune di Rovereto"),
            "tipo": it.get("tipo", "notizia"),
            "live": True,
        })
    return out


# ─── Caricamento data.json statico ─────────────────────────────────
def load_static_data():
    """Carica data.json - dataset statico di base."""
    path = os.path.join(BASE_DIR, "data.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ─── Link reali sul web per contributi e strutture ─────────────────
# Mappa nome contributo -> pagina ufficiale (Comune di Rovereto / Provincia di Trento / INPS)
CONTRIBUTI_LINKS = {
    "bonus nido": {
        "url": "https://www.comune.rovereto.tn.it/Servizi/(view)/Asili-nido",
        "fonte": "Comune di Rovereto - Servizi educativi",
    },
    "bonus bebè": {
        "url": "https://www.comune.rovereto.tn.it/Vivere-il-Comune/Servizio-attivita-sociali",
        "fonte": "Comune di Rovereto - Attività sociali",
    },
    "voucher scuola": {
        "url": "https://www.provincia.tn.it/Argomenti/Documenti-e-dati/Buono-di-servizio-FSE",
        "fonte": "Provincia Autonoma di Trento",
    },
    "family card": {
        "url": "https://www.comune.rovereto.tn.it/Vivere-il-Comune/Servizio-attivita-sociali/Family-card",
        "fonte": "Comune di Rovereto - Family Card",
    },
    "famiglie numerose": {
        "url": "https://www.provincia.tn.it/Argomenti/Famiglia",
        "fonte": "Provincia di Trento - Politiche familiari",
    },
    "fondo solidarietà": {
        "url": "https://www.provincia.tn.it/Argomenti/Famiglia",
        "fonte": "Provincia di Trento - Politiche familiari",
    },
}

# Eventi -> link al museo / sede
EVENTI_FONTI = {
    "mart": ("https://www.mart.tn.it", "MART - Museo di Arte Moderna"),
    "casa depero": ("https://www.mart.tn.it/it/casa-depero", "Casa d'Arte Futurista Depero"),
    "castello": ("https://www.fondazionemcr.it/castello-di-rovereto", "Castello di Rovereto"),
    "museo civico": ("https://www.fondazionemcr.it", "Fondazione Museo Civico"),
    "scienze": ("https://www.muse.it", "MUSE - Museo delle Scienze"),
    "biblioteca": ("https://www.bibcom.trento.it/Le-Biblioteche/Rovereto", "Biblioteca Civica"),
}


def find_contributo_link(nome):
    """Cerca match parziale del contributo nei link curati."""
    nl = nome.lower()
    for kw, info in CONTRIBUTI_LINKS.items():
        if kw in nl:
            return info
    # Fallback: pagina servizi sociali del Comune
    return {
        "url": "https://www.comune.rovereto.tn.it/Vivere-il-Comune/Servizio-attivita-sociali",
        "fonte": "Comune di Rovereto",
    }


def find_evento_link(museo):
    """Trova URL ufficiale del museo/sede dell'evento."""
    ml = (museo or "").lower()
    for kw, (url, label) in EVENTI_FONTI.items():
        if kw in ml:
            return {"url": url, "fonte": label}
    return {
        "url": "https://www.visitrovereto.it/eventi",
        "fonte": "Visit Rovereto",
    }


def google_maps_link(name, coords):
    """Genera link a Google Maps con nome + coordinate per una struttura."""
    if not coords or len(coords) < 2:
        return ""
    lat, lon = coords[0], coords[1]
    from urllib.parse import quote
    q = quote(f"{name} Rovereto")
    return f"https://www.google.com/maps/search/?api=1&query={q}&query_place_id=&center={lat},{lon}"


def osm_link(coords):
    """Genera link a OpenStreetMap con marker sulle coordinate."""
    if not coords or len(coords) < 2:
        return ""
    lat, lon = coords[0], coords[1]
    return f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=17/{lat}/{lon}"


def enrich_static_data(data):
    """Aggiunge link ufficiali a contributi, eventi e strutture scolastiche."""
    # Contributi famiglie
    for c in data.get("contributi_famiglie", []):
        info = find_contributo_link(c.get("nome", ""))
        c["link_ufficiale"] = info["url"]
        c["fonte"] = info["fonte"]

    # Eventi famiglie -> link sede + visitrovereto fallback
    for ev in data.get("eventi_famiglie", []):
        info = find_evento_link(ev.get("museo", ""))
        ev["link_ufficiale"] = info["url"]
        ev["fonte"] = info["fonte"]

    # Strutture scolastiche -> Google Maps + OSM
    for s in data.get("strutture_scolastiche", []):
        coords = s.get("coordinate") or []
        s["link_mappa"] = google_maps_link(s.get("nome", ""), coords)
        s["link_osm"] = osm_link(coords)

    return data


# ═══════════════════════════════════════════════════════════════════
# ROUTES API
# ═══════════════════════════════════════════════════════════════════
@app.route("/api/data")
def api_data():
    """Endpoint principale: dati statici arricchiti con link ufficiali + novita LIVE dal Comune."""
    data = enrich_static_data(load_static_data())

    # Esegui scraping in modo resiliente
    notizie_live = scrape_notizie()
    avvisi_live = scrape_avvisi()

    novita_live = (
        map_to_novita_comune(avvisi_live, prefix="Avviso") +
        map_to_novita_comune(notizie_live, prefix="Notizia")
    )

    # Strategia: tieni le delibere demo MA mostra prima le live
    data["novita_comune"] = novita_live + data.get("novita_comune", [])

    data["_meta"] = {
        "live_count": len(novita_live),
        "static_count": len(data.get("novita_comune", [])) - len(novita_live),
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
        "source": ROVERETO_BASE,
    }
    return jsonify(data)


@app.route("/api/notizie")
def api_notizie():
    return jsonify({"items": scrape_notizie(), "source": f"{ROVERETO_BASE}/Novita/Notizie"})


@app.route("/api/avvisi")
def api_avvisi():
    return jsonify({"items": scrape_avvisi(), "source": f"{ROVERETO_BASE}/Novita/Avvisi"})


@app.route("/api/novita-comune")
def api_novita_comune():
    """Solo le novità formattate come delibere dashboard."""
    notizie = map_to_novita_comune(scrape_notizie(), prefix="Notizia")
    avvisi = map_to_novita_comune(scrape_avvisi(), prefix="Avviso")
    return jsonify({"items": avvisi + notizie})


@app.route("/api/refresh")
def api_refresh():
    """Forza il refresh della cache (utile dopo aggiornamenti del sito)."""
    cache_clear()
    return jsonify({"ok": True, "cleared_at": datetime.now().isoformat(timespec="seconds")})


@app.route("/api/health")
def api_health():
    return jsonify({
        "ok": True,
        "cache_keys": list(_cache.keys()),
        "cache_ttl_sec": CACHE_TTL,
        "source": ROVERETO_BASE,
    })


# ═══════════════════════════════════════════════════════════════════
# ROUTES STATICHE (servono il frontend)
# ═══════════════════════════════════════════════════════════════════
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    # Blocca path traversal
    if ".." in filename:
        return "Forbidden", 403
    full = os.path.join(BASE_DIR, filename)
    if not os.path.isfile(full):
        return "Not found", 404
    return send_from_directory(BASE_DIR, filename)


# ─── Avvio ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print(" RoverFamily Backend")
    print(f" Sorgente live: {ROVERETO_BASE}")
    print(f" Cache TTL:     {CACHE_TTL}s")
    print(" Apri:          http://127.0.0.1:8080")
    print(" API:           http://127.0.0.1:8080/api/data")
    print("=" * 60)
    app.run(host="127.0.0.1", port=8080, debug=False, threaded=True)
