# RoverFamily

Portale sperimentale del **Comune di Rovereto** per famiglie con bambini 0-6 anni.
Aggrega asili nido, scuole dell'infanzia, bonus, eventi e notizie reali dal sito ufficiale,
con assistente AI per le risposte rapide.

## Stack

- **Frontend**: HTML/CSS/JS vanilla (Leaflet per la mappa, Chart.js, FontAwesome)
- **Backend**: Python Flask con scraping live da `comune.rovereto.tn.it`
- **Auth simulata**: SPID / CIE / email + ANPR mock
- **AI Assistant**: rule-based con contesto figli e quartiere
- **Sintesi delibere**: scoring euristico su corpo articolo (no LLM esterno)

## Avvio rapido

```bash
pip install flask requests beautifulsoup4
python server.py
# apri http://127.0.0.1:8080
```

## API live

| Endpoint | Descrizione |
|---|---|
| `GET /` | Frontend |
| `GET /api/data` | Dataset completo + novità live dal Comune |
| `GET /api/notizie` | Notizie scrapeate da `/Novita/Notizie` |
| `GET /api/avvisi` | Avvisi scrapeati da `/Novita/Avvisi` |
| `GET /api/novita-comune` | Notizie+avvisi formato dashboard |
| `GET /api/refresh` | Svuota cache (TTL default: 30 min) |
| `GET /api/health` | Stato server |

## Touchpoint pubblici

Il portale supporta link pre-compilati per QR code stampati su carta,
locandine in ambulatori/asili/biblioteca, messaggi App IO, ecc.

```
/?from=consultorio&q=Borgo+Sacco&kids=1,4
/?from=pediatra&q=Brione&kids=0
/?from=anagrafe&q=Lizzana&kids=2
```

Parametri:
- `from`: `io | consultorio | pediatra | asilo | biblioteca | anagrafe | comune`
- `q`: nome quartiere (case-insensitive, accent-insensitive)
- `kids`: età figli separate da `,` `;` `.` o spazio

## Dati

- `data.json`: dataset elaborato (strutture scolastiche, contributi, eventi, quartieri)
- I CSV grezzi del catalogo open-data Trentino non sono inclusi nel repo (oltre 100 MB);
  rigenerabili eseguendo `process_data.py` dopo averli scaricati da
  [dati.trentino.it](https://dati.trentino.it).

## Note

Progetto sperimentale a scopo didattico. Le sintesi AI delle delibere sono generate
con scoring euristico, non sono testo ufficiale del Comune. Per il testo completo
delle delibere consultare sempre [comune.rovereto.tn.it](https://www.comune.rovereto.tn.it).
