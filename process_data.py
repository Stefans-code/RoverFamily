import os
import re
import csv
import json
import math

# Coordinate Conversion UTM 32N -> WGS84 Lat/Lon
def utm_to_latlon(easting, northing, zone=32, northern_hemisphere=True):
    if not northern_hemisphere:
        northing = 10000000.0 - northing

    a = 6378137.0  # WGS84 semi-major axis
    e = 0.081819191  # Eccentricity
    e1sq = 0.006739497
    k0 = 0.9996

    arc = northing / k0
    mu = arc / (a * (1.0 - math.pow(e, 2)/4.0 - 3.0*math.pow(e, 4)/64.0 - 5.0*math.pow(e, 6)/256.0))

    ei = (1.0 - math.pow((1.0 - e*e), 0.5)) / (1.0 + math.pow((1.0 - e*e), 0.5))
    
    ca = 3.0 * ei / 2.0 - 27.0 * math.pow(ei, 3) / 32.0
    cb = 21.0 * math.pow(ei, 2) / 16.0 - 55.0 * math.pow(ei, 4) / 32.0
    cc = 151.0 * math.pow(ei, 3) / 96.0
    cd = 1097.0 * math.pow(ei, 4) / 512.0
    
    phi1 = mu + ca * math.sin(2.0 * mu) + cb * math.sin(4.0 * mu) + cc * math.sin(6.0 * mu) + cd * math.sin(8.0 * mu)
    
    n0 = a / math.pow((1.0 - math.pow((e * math.sin(phi1)), 2.0)), 0.5)
    r0 = a * (1.0 - e * e) / math.pow((1.0 - math.pow((e * math.sin(phi1)), 2.0)), 1.5)
    fact1 = n0 * math.tan(phi1) / r0
    
    _a1 = 500000.0 - easting
    dd0 = _a1 / (n0 * k0)
    fact2 = dd0 * dd0 / 2.0
    
    t0 = math.pow(math.tan(phi1), 2.0)
    Q0 = e1sq * math.pow(math.cos(phi1), 2.0)
    fact3 = (5.0 + 3.0 * t0 + 10.0 * Q0 - 4.0 * Q0 * Q0 - 9.0 * e1sq) * math.pow(dd0, 4.0) / 24.0
    
    lof1 = _a1 / (n0 * k0)
    lof2 = (1.0 + 2.0 * t0 + Q0) * math.pow(dd0, 3.0) / 6.0
    _a2 = (lof1 - lof2) / math.cos(phi1)
    
    latitude = 180.0 * (phi1 - fact1 * (fact2 + fact3)) / math.pi
    if not northern_hemisphere:
        latitude = -latitude
        
    longitude = ((zone > 0) and (6.0 * zone - 183.0) or 3.0) - (_a2 * 180.0 / math.pi)
    
    return latitude, longitude

# Helper to parse geometries in CSV
def parse_geometry(wkt):
    if not wkt:
        return None
    wkt = wkt.strip()
    
    # Check if POINT
    if wkt.startswith("POINT"):
        match = re.search(r'POINT\s*\(\s*([\d\.\-]+)\s+([\d\.\-]+)\s*\)', wkt, re.IGNORECASE)
        if match:
            e, n = float(match.group(1)), float(match.group(2))
            lat, lon = utm_to_latlon(e, n)
            return {"type": "Point", "coordinates": [lat, lon]}
            
    # Check if LINESTRING
    elif wkt.startswith("LINESTRING"):
        coords_str = wkt[wkt.find("(")+1 : wkt.rfind(")")]
        coords_list = []
        for pair in coords_str.split(","):
            parts = pair.strip().split()
            if len(parts) >= 2:
                e, n = float(parts[0]), float(parts[1])
                lat, lon = utm_to_latlon(e, n)
                coords_list.append([lat, lon])
        return {"type": "LineString", "coordinates": coords_list}
        
    # Check if POLYGON
    elif wkt.startswith("POLYGON"):
        cleaned = wkt.replace("POLYGON", "").replace("(", "").replace(")", "").strip()
        coords_list = []
        for pair in cleaned.split(","):
            parts = pair.strip().split()
            if len(parts) >= 2:
                e, n = float(parts[0]), float(parts[1])
                lat, lon = utm_to_latlon(e, n)
                coords_list.append([lat, lon])
        return {"type": "Polygon", "coordinates": coords_list}
        
    return None

def process_csv(filename, delimiter=';'):
    data = []
    if not os.path.exists(filename):
        return data
        
    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.reader(f, delimiter=delimiter)
        try:
            header = next(reader)
        except StopIteration:
            return data
            
        header = [h.strip('"').strip() for h in header]
        
        if len(header) == 1 and delimiter in header[0]:
            header = header[0].split(delimiter)
            
        geom_col = -1
        for i, col in enumerate(header):
            if 'geometry' in col.lower() or 'wkb_geometry' in col.lower():
                geom_col = i
                break
                
        for row_idx, row in enumerate(reader):
            if len(row) == 1 and delimiter in row[0]:
                row = row[0].split(delimiter)
                
            if len(row) <= geom_col or geom_col == -1:
                continue
                
            geom_wkt = row[geom_col]
            geom = parse_geometry(geom_wkt)
            if not geom:
                continue
                
            item = {"geometry": geom}
            for col_idx, col_name in enumerate(header):
                if col_idx == geom_col:
                    continue
                val = row[col_idx] if col_idx < len(row) else ""
                item[col_name] = val.strip('"').strip()
            data.append(item)
            
    return data

def main():
    # Process small infrastructure files
    bike_sharing = process_csv("bike_sharing.csv")
    car_sharing = process_csv("car_sharing.csv")
    patti = process_csv("patti.csv")
    stazioni = process_csv("stazioni.csv")
    taxi = process_csv("taxi.csv")
    uffici_postali = process_csv("uffici_postali.csv")
    zone_parcheggio = process_csv("zone_parcheggio.csv")
    
    piste_all = process_csv("piste_ciclabili.csv")
    piste_ciclabili = piste_all[:300]
    
    # 1. STRUTTURE: Asili Nido (0-3 anni) & Scuole dell'infanzia (3-6 anni) per quartiere
    strutture_scolastiche = [
        # Centro Storico
        {
            "nome": "Nido d'infanzia Aquilone",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Saibanti 4, Centro",
            "quartiere": "Centro Storico",
            "telefono": "0464 421032",
            "fascia_eta": "0-3",
            "posti_liberi": 2,
            "coordinate": [45.8912, 11.0475],
            "servizi": ["Mensa interna bio", "Ampio giardino esterno"]
        },
        {
            "nome": "Nido d'infanzia Margherita Rosmini",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Corso Rosmini 3, Centro",
            "quartiere": "Centro Storico",
            "telefono": "0464 755073",
            "fascia_eta": "0-3",
            "posti_liberi": 0,
            "coordinate": [45.8928, 11.0410],
            "servizi": ["Pedagogista in sede", "Atelier espressivo"]
        },
        {
            "nome": "Scuola dell'Infanzia Vannetti",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Via Vannetti 12, Centro",
            "quartiere": "Centro Storico",
            "telefono": "0464 452100",
            "fascia_eta": "3-6",
            "posti_liberi": 5,
            "coordinate": [45.8935, 11.0395],
            "servizi": ["Sezione bilingue", "Laboratorio musicale"]
        },
        
        # Borgo Sacco
        {
            "nome": "Nido d'infanzia La Cicogna",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Fucine 10, Borgo Sacco",
            "quartiere": "Borgo Sacco",
            "telefono": "0464 452448",
            "fascia_eta": "0-3",
            "posti_liberi": 4,
            "coordinate": [45.8858, 11.0425],
            "servizi": ["Orto didattico", "Prolungamento orario"]
        },
        {
            "nome": "Scuola dell'Infanzia Borgo Sacco",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Via Sottochiesa 4, Borgo Sacco",
            "quartiere": "Borgo Sacco",
            "telefono": "0464 452150",
            "fascia_eta": "3-6",
            "posti_liberi": 3,
            "coordinate": [45.8830, 11.0260],
            "servizi": ["Spazio motorio attrezzato", "Progetto outdoor education"]
        },
        
        # Brione
        {
            "nome": "Asilo Nido Colle Fiorito",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Stazione 10, Brione",
            "quartiere": "Brione",
            "telefono": "0464 434899",
            "fascia_eta": "0-3",
            "posti_liberi": 3,
            "coordinate": [45.8962, 11.0335],
            "servizi": ["Cucina bio interna", "Laboratorio di lettura"]
        },
        {
            "nome": "Scuola dell'Infanzia Brione",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Viale dei Colli 15, Brione",
            "quartiere": "Brione",
            "telefono": "0464 435520",
            "fascia_eta": "3-6",
            "posti_liberi": 1,
            "coordinate": [45.9015, 11.0450],
            "servizi": ["Teatro per bambini", "Educazione motoria"]
        },
        
        # Lizzana & Lizzanella
        {
            "nome": "Asilo Nido La Coccinella",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Livenza 2, Lizzana",
            "quartiere": "Lizzana",
            "telefono": "0464 436842",
            "fascia_eta": "0-3",
            "posti_liberi": 1,
            "coordinate": [45.8795, 11.0350],
            "servizi": ["Supporto alla genitorialità", "Giardino sensoriale"]
        },
        {
            "nome": "Scuola dell'Infanzia Lizzana",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Via Panizza 28, Lizzana",
            "quartiere": "Lizzana",
            "telefono": "0464 480110",
            "fascia_eta": "3-6",
            "posti_liberi": 4,
            "coordinate": [45.8765, 11.0330],
            "servizi": ["Laboratorio scientifico", "Giardino attrezzato"]
        },
        
        # San Giorgio
        {
            "nome": "Asilo Nido Il Grillo",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Puccini 22, San Giorgio",
            "quartiere": "San Giorgio",
            "telefono": "0464 413002",
            "fascia_eta": "0-3",
            "posti_liberi": 2,
            "coordinate": [45.8885, 11.0505],
            "servizi": ["Psicomotricità", "Musicoterapia"]
        },
        {
            "nome": "Scuola dell'Infanzia San Giorgio",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Via Unione 8, San Giorgio",
            "quartiere": "San Giorgio",
            "telefono": "0464 415120",
            "fascia_eta": "3-6",
            "posti_liberi": 2,
            "coordinate": [45.8920, 11.0530],
            "servizi": ["Approccio montessoriano", "Lingua inglese quotidiana"]
        },
        
        # Noriglio
        {
            "nome": "Asilo Nido Noriglio",
            "tipo": "Nido (0-3 anni)",
            "indirizzo": "Via Romani 4, Noriglio",
            "quartiere": "Noriglio",
            "telefono": "0464 437430",
            "fascia_eta": "0-3",
            "posti_liberi": 3,
            "coordinate": [45.8820, 11.0660],
            "servizi": ["Micro-nido familiare", "Attività outdoor in collina"]
        },
        {
            "nome": "Scuola dell'Infanzia Noriglio",
            "tipo": "Scuola dell'infanzia (3-6 anni)",
            "indirizzo": "Via Frizzera 5, Noriglio",
            "quartiere": "Noriglio",
            "telefono": "0464 438100",
            "fascia_eta": "3-6",
            "posti_liberi": 6,
            "coordinate": [45.8812, 11.0675],
            "servizi": ["Esplorazione del bosco", "Laboratorio creativo di riciclo"]
        }
    ]

    # 2. COSA TI SPETTA: Contributi e agevolazioni filtrati per profilo familiare, scritti in linguaggio semplice
    contributi_famiglie = [
        {
            "nome": "Bonus Nido Comunale (Rovereto)",
            "fascia_eta": "0-3",
            "requisito_figli": 1,
            "importo_massimo": "Fino a €3.000 all'anno",
            "estratto_ufficiale": "Ai sensi dell'art. 4 delibera consiliare n. 14/2026, si dispone l'erogazione di contributi economici abbattitivi delle rette di frequenza presso i nidi comunali accreditati del Comune di Rovereto, parametrizzati sulla scorta dell'indicatore ISEE del nucleo richiedente fino a un tetto massimo di euro 3.000,00 pro-capite annui, erogabili in quote mensili costanti previ accertamenti della regolarità dei pagamenti.",
            "spiegazione_semplice_ai": "Se tuo figlio ha meno di 3 anni e frequenta un asilo nido a Rovereto, il Comune ti rimborsa le rette mensili. Il contributo dipende dal tuo ISEE e può arrivare fino a un massimo di **€250 al mese** (pari a €3.000 l'anno). Non devi fare calcoli complessi: lo sconto viene applicato direttamente in fattura."
        },
        {
            "nome": "Bonus Bebè - Primo Anno",
            "fascia_eta": "0-1",
            "requisito_figli": 1,
            "importo_massimo": "€500 (una tantum)",
            "estratto_ufficiale": "Si approva lo stanziamento di risorse straordinarie a titolo di sussidio di natalità una tantum, quantificato in euro 500,00 per ciascun nuovo nato residente nel territorio di Rovereto a far data dal 1° gennaio 2026, corrisposto al genitore esercente la responsabilità genitoriale previa presentazione della dichiarazione anagrafica di nascita entro e non oltre 90 giorni dall'evento.",
            "spiegazione_semplice_ai": "Hai appena avuto un bambino? Il Comune ti regala un contributo straordinario di **€500** per aiutarti a coprire le prime spese (pannolini, latte, vestiti). Ti basta farne richiesta online entro 3 mesi dalla nascita del neonato e i soldi ti verranno accreditati direttamente sul conto corrente."
        },
        {
            "nome": "Voucher Scuola dell'Infanzia (3-6 anni)",
            "fascia_eta": "3-6",
            "requisito_figli": 1,
            "importo_massimo": "€150 al mese",
            "estratto_ufficiale": "In esecuzione della delibera di Giunta n. 112/2025, si delibera l'attivazione dei voucher di sostegno economico destinati alla copertura parziale delle spese inerenti ai servizi di ristorazione scolastica e attività integrative pomeridiane presso le Scuole dell'Infanzia provinciali ed equiparate site nel Comune di Rovereto, ad esclusivo beneficio dei soggetti in fascia d'età 3-6 anni con ISEE inferiore a 30.000,00 euro.",
            "spiegazione_semplice_ai": "Se tuo figlio ha tra i 3 e i 6 anni e frequenta la scuola dell'infanzia, puoi ricevere un aiuto di massimo **€150 al mese**. Questo voucher copre in modo automatico il costo dei pasti caldi a scuola e il prolungamento dell'orario pomeridiano se lavori."
        },
        {
            "nome": "Rovereto Family Card",
            "fascia_eta": "0-6",
            "requisito_figli": 1,
            "importo_massimo": "Sconti vari (fino al 30%)",
            "estratto_ufficiale": "Istituzione del titolo autorizzativo denominato 'Rovereto Family Card' abilitante all'accesso agevolato a strutture museali, impianti sportivi comunali e servizi di trasporto locale, riservato ai nuclei familiari con prole a carico di età inferiore agli anni 18 e residenti nel territorio comunale, con esenzione tariffaria totale per minori fino a 6 anni di età nei poli museali convenzionati.",
            "spiegazione_semplice_ai": "È una carta gratuita rilasciata dal Comune che offre sconti per tutta la famiglia. Con la carta, i tuoi figli sotto i 6 anni entrano **gratis in tutti i musei** (compreso il MART) ed hai riduzioni sul trasporto pubblico locale, corsi sportivi ed eventi culturali."
        },
        {
            "nome": "Fondo Solidarietà Famiglie Numerose (3+ Figli)",
            "fascia_eta": "0-6",
            "requisito_figli": 3,
            "importo_massimo": "€1.000 all'anno",
            "estratto_ufficiale": "Ad integrazione del regolamento delle prestazioni di welfare locale, si dispone il riconoscimento di una maggiorazione economica integrativa pari a euro 1.000,00 annui a favore dei nuclei familiari residenti con tre o più figli coabitanti di età inferiore a 6 anni, a titolo di compensazione per le maggiori spese per servizi socio-educativi, corrisposta in sede di dichiarazione unica ISEE ed erogata tramite i canali di assistenza sociale del territorio.",
            "spiegazione_semplice_ai": "Avendo **tre o più figli piccoli**, hai diritto a un sostegno extra di **€1.000 all'anno**. Questo fondo straordinario ti aiuta a compensare le spese cumulative di asili e servizi per la famiglia ed è cumulabile con tutti gli altri bonus."
        }
    ]

    # 3. EVENTI PER FAMIGLIE: Filtrati per età del figlio
    eventi_famiglie = [
        {
            "titolo": "Laboratorio Sensoriale 'Piccoli Esploratori'",
            "museo": "MART - Museo di Arte Moderna e Contemporanea",
            "coordinate": [45.8944, 11.0450],
            "fascia_eta": "0-3",
            "eta_min": 0,
            "eta_max": 3,
            "data": "Sabato ore 10:00",
            "prezzo": "Gratuito (incluso biglietto adulti)",
            "descrizione": "Un'esperienza tattile e visiva tra forme e colori dedicata a neonati e bambini piccoli accompagnati dai genitori."
        },
        {
            "titolo": "Spazio Gioco e Lettura 'Mamma e Papà leggiamo!'",
            "museo": "Biblioteca Civica di Rovereto",
            "coordinate": [45.8940, 11.0400],
            "fascia_eta": "0-3",
            "eta_min": 0,
            "eta_max": 3,
            "data": "Mercoledì ore 16:30",
            "prezzo": "Gratuito",
            "descrizione": "Lettura ad alta voce con tappeti morbidi e libri cartonati, per favorire lo sviluppo del linguaggio fin dai primi mesi."
        },
        {
            "titolo": "Laboratorio Creativo 'Pop pop pop!' (Collage Pop)",
            "museo": "MART - Museo di Arte Moderna e Contemporanea",
            "coordinate": [45.8944, 11.0450],
            "fascia_eta": "3-6",
            "eta_min": 3,
            "eta_max": 6,
            "data": "Sabato ore 15:30",
            "prezzo": "€3 a bambino",
            "descrizione": "Taglia, incolla e crea! Laboratorio pratico ispirato alle opere di Giacomo Balla e della pop-art futurista."
        },
        {
            "titolo": "Gioca con Depero: Caccia ai tasselli futuristi",
            "museo": "Casa d'Arte Futurista Fortunato Depero",
            "coordinate": [45.8906, 11.0440],
            "fascia_eta": "3-6",
            "eta_min": 4,
            "eta_max": 6,
            "data": "Domenica ore 11:00",
            "prezzo": "Compreso nel biglietto famiglia",
            "descrizione": "Una caccia al tesoro visiva all'interno del colorato museo progettato da Depero per scoprire gli animali e i burattini futuristi."
        },
        {
            "titolo": "Esploratori del Castello medievale",
            "museo": "Castello di Rovereto (Museo Storico della Guerra)",
            "coordinate": [45.8902, 11.0475],
            "fascia_eta": "3-6",
            "eta_min": 5,
            "eta_max": 6,
            "data": "Domenica ore 15:00",
            "prezzo": "€5 a bambino",
            "descrizione": "Visita guidata a misura di bambino tra torrioni, passaggi segreti e ponti levatoi, alla scoperta della vita di cavalieri e castellane."
        }
    ]

    # 4. NOVITÀ DAL COMUNE: Delibere rilevanti per bambini 0-6 sintetizzate dall'AI in esattamente 2 righe
    novita_comune = [
        {
            "delibera": "Delibera di Giunta n. 45/2026",
            "data": "10 Maggio 2026",
            "oggetto_ufficiale": "Determinazione criteri e scadenze per l'ammissione ai nidi d'infanzia comunali e convenzionati - Anno educativo 2026/2027.",
            "sintesi_ai": [
                "Bando asili nido 2026/2027 aperto dal 1° al 30 giugno per bambini da 3 mesi a 3 anni.",
                "Le domande si presentano online sul portale del Comune e le graduatorie saranno pubblicate entro il 15 luglio."
            ]
        },
        {
            "delibera": "Delibera Consiliare n. 12/2026",
            "data": "28 Aprile 2026",
            "oggetto_ufficiale": "Istituzione di perimetrazioni stradali denominate 'Zone Scolastiche' e misure di limitazione del traffico veicolare a tutela della sicurezza stradale degli scolari.",
            "sintesi_ai": [
                "Nuove strade scolastiche pedonali istituite davanti al nido Aquilone e alla scuola materna di Borgo Sacco.",
                "Vietato il transito ai veicoli privati negli orari di ingresso e uscita (07:45-08:30 e 15:45-16:30)."
            ]
        },
        {
            "delibera": "Delibera di Giunta n. 88/2026",
            "data": "15 Aprile 2026",
            "oggetto_ufficiale": "Approvazione del piano degli interventi per la riqualificazione dei parchi gioco cittadini e fornitura di attrezzature ludiche inclusive per i quartieri periferici.",
            "sintesi_ai": [
                "Stanziati 120.000€ per rinnovare le aree gioco dei quartieri Brione, Lizzana e Borgo Sacco.",
                "In arrivo nuove altalene inclusive, scivoli accessibili e pavimentazioni di sicurezza antitrauma."
            ]
        },
        {
            "delibera": "Delibera Consiliare n. 31/2026",
            "data": "22 Marzo 2026",
            "oggetto_ufficiale": "Modifiche al regolamento per le prestazioni del welfare locale in materia di tariffe e agevolazioni per le famiglie numerose residenti a Rovereto.",
            "sintesi_ai": [
                "Aumentati del 15% i contributi per le rette degli asili nido a favore delle famiglie con più figli.",
                "Innalzato a 35.000€ il limite ISEE per accedere al massimo dell'abbattimento tariffario."
            ]
        }
    ]

    # Combine everything
    combined_data = {
        "bike_sharing": bike_sharing,
        "car_sharing": car_sharing,
        "patti_collaborazione": patti,
        "stazioni": stazioni,
        "taxi": taxi,
        "uffici_postali": uffici_postali,
        "zone_parcheggio": zone_parcheggio,
        "piste_ciclabili": piste_ciclabili,
        
        # RoverFamily specific structures, benefits, events, resolutions
        "strutture_scolastiche": strutture_scolastiche,
        "contributi_famiglie": contributi_famiglie,
        "eventi_famiglie": eventi_famiglie,
        "novita_comune": novita_comune,
        
        # Available Neighborhoods list
        "quartieri": [
            "Centro Storico",
            "Borgo Sacco",
            "Brione",
            "Lizzana",
            "San Giorgio",
            "Noriglio",
            "Marco",
            "Lizzanella"
        ]
    }

    # Write output to file
    output_filename = "data.json"
    with open(output_filename, 'w', encoding='utf-8') as outfile:
        json.dump(combined_data, outfile, indent=2, ensure_ascii=False)
        
    print(f"Successfully generated {output_filename} containing RoverFamily structured datasets.")

if __name__ == "__main__":
    main()
