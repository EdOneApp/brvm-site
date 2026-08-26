#!/usr/bin/env python3
"""
scrape_brvm.py
--------------------------------------------------------------------
Va chercher les données publiques du jour sur brvm.org et renvoie un
dict prêt à être fusionné dans l'historique Drive par
update_drive_history.py.

Pages utilisées :
  /fr/resume              -> date/heure de séance, ticker (cours + variation
                              du jour de chaque action), résumé marché
  /fr/capitalisations/0   -> nb titres, cours, cap. flottante, cap. globale
  /fr/volumes/0           -> volumes échangés, PER, part de marché
  /fr/indices             -> indices principaux, sectoriels, total return
  /fr/cours-obligations/0 -> toutes les lignes obligataires

Aucune donnée n'est écrite ici : ce module ne fait QUE lire brvm.org et
renvoyer des dictionnaires Python. L'écriture Drive est dans
update_drive_history.py, pour garder les deux responsabilités séparées
et testables indépendamment.
--------------------------------------------------------------------
"""
import re
import sys
import datetime
import requests
from bs4 import BeautifulSoup

BASE = "https://www.brvm.org"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; BRVMLiveBot/1.0; +https://github.com)"}
TIMEOUT = 30


def get_soup(path):
    url = f"{BASE}{path}"
    resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def fr_number(text):
    """'20 478 579 465 259 FCFA' / '531,07' / '-0,10' -> float"""
    if text is None:
        return None
    t = text.strip().replace("\xa0", " ").replace("FCFA", "").strip()
    if t in ("", "-", "—"):
        return None
    t = t.replace(" ", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def scrape_resume():
    soup = get_soup("/fr/resume")
    heure_txt = soup.select_one(".header-seance")
    date_str, heure_str = None, None
    if heure_txt:
        # "Mercredi, 26 août, 2026 - 14:10"
        m = re.search(r"(\d{1,2})\s+(\w+),?\s+(\d{4})\s*-\s*(\d{2}:\d{2})", heure_txt.get_text())
        months = {"janvier":1,"février":2,"fevrier":2,"mars":3,"avril":4,"mai":5,"juin":6,"juillet":7,
                  "août":8,"aout":8,"septembre":9,"octobre":10,"novembre":11,"décembre":12,"decembre":12}
        if m:
            d, mo, y, hh = m.groups()
            date_str = f"{int(y):04d}-{months.get(mo.lower(),1):02d}-{int(d):02d}"
            heure_str = hh

    # Ticker : #slide-seance .item -> code, cours, variation%
    ticker = {}
    for item in soup.select("#slide-seance .item"):
        spans = item.find_all("span")
        if len(spans) >= 3:
            code = spans[0].get_text(strip=True)
            cours = fr_number(spans[1].get_text())
            variation = fr_number(spans[2].get_text().replace("%", ""))
            ticker[code] = {"cours": cours, "variation": variation}

    # Résumé Activités du marché
    market = {}
    activity_rows = soup.select("table.activity tbody tr")
    for tr in activity_rows:
        tds = tr.find_all("td")
        if len(tds) >= 2:
            label = tds[0].get_text(strip=True)
            value = fr_number(tds[1].get_text())
            market[label] = value

    return {
        "date": date_str or datetime.date.today().isoformat(),
        "heure": heure_str or "00:00",
        "ticker": ticker,
        "market_raw": market,
    }


def scrape_capitalisations():
    soup = get_soup("/fr/capitalisations/0")
    out = {}
    rows = soup.select("#block-system-main table.table tbody tr")
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        code = tds[0].get_text(strip=True)
        out[code] = {
            "nom": tds[1].get_text(strip=True),
            "nbTitres": fr_number(tds[2].get_text()),
            "cours": fr_number(tds[3].get_text()),
            "capFlott": fr_number(tds[4].get_text()),
            "capGlob": fr_number(tds[5].get_text()),
            "capGlobPct": fr_number(tds[6].get_text()),
        }
    return out


def scrape_volumes():
    soup = get_soup("/fr/volumes/0")
    out = {}
    rows = soup.select("#block-system-main table.table tbody tr")
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue
        code = tds[0].get_text(strip=True)
        out[code] = {
            "volTitres": fr_number(tds[2].get_text()),
            "volValeur": fr_number(tds[3].get_text()),
            "per": fr_number(tds[4].get_text()),
            "volValeurPct": fr_number(tds[5].get_text()),
        }
    return out


# Correspondance nom BRVM -> code stable utilisé par le site (doit rester
# aligné avec SEED_INDICES dans assets/data-seed.js). Ajoutez ici toute
# nouvelle ligne d'indice publiée par la BRVM.
INDEX_CODE_MAP = {
    "BRVM-30": "BRVM30",
    "BRVM - COMPOSITE": "BRVMC",
    "BRVM - PRESTIGE": "BRVMPRESTIGE",
    "BRVM - PRINCIPAL": "BRVMPRINCIPAL",
    "BRVM - CONSOMMATION DE BASE": "SECT_CDB",
    "BRVM - CONSOMMATION DISCRETIONNAIRE": "SECT_CD",
    "BRVM - ENERGIE": "SECT_ENE",
    "BRVM - INDUSTRIELS": "SECT_IND",
    "BRVM - SERVICES FINANCIERS": "SECT_SF",
    "BRVM - SERVICES PUBLICS": "SECT_SP",
    "BRVM - TELECOMMUNICATIONS": "SECT_TEL",
    "BRVM – COMPOSITE TOTAL RETURN": "TR_COMPOSITE",
}


def scrape_indices():
    soup = get_soup("/fr/indices")
    sections = soup.select("#block-system-main > section.block-tools")
    categories = ["principal", "sectoriel", "total-return"]
    out = {}
    for cat, section in zip(categories, sections):
        for tr in section.select("table tbody tr"):
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            nom = tds[0].get_text(strip=True)
            code = INDEX_CODE_MAP.get(nom) or re.sub(r"[^A-Z0-9]", "", nom.upper())[:20]
            out[code] = {
                "nom": nom,
                "categorie": cat,
                "cloturePrec": fr_number(tds[1].get_text()),
                "cloture": fr_number(tds[2].get_text()),
                "variation": fr_number(tds[3].get_text()),
                "ytd": fr_number(tds[4].get_text()),
            }
    return out


def scrape_obligations():
    soup = get_soup("/fr/cours-obligations/0")
    out = {}
    rows = soup.select("#block-system-main table.table tbody tr")
    for tr in rows:
        tds = tr.find_all("td")
        if len(tds) < 7:
            continue
        code = tds[0].get_text(strip=True)
        out[code] = {
            "nom": tds[1].get_text(strip=True),
            "dateEmission": tds[2].get_text(strip=True),
            "cours": fr_number(tds[4].get_text()),
            "couponCouru": fr_number(tds[5].get_text()),
            "dernierPaiement": tds[6].get_text(strip=True),  # "24/04/2026 / 320,48"
        }
    return out


def build_snapshot():
    resume = scrape_resume()
    caps = scrape_capitalisations()
    vols = scrape_volumes()
    obligations = scrape_obligations()

    actions = {}
    for code, cap in caps.items():
        vol = vols.get(code, {})
        tick = resume["ticker"].get(code, {})
        actions[code] = {
            "nom": cap["nom"],
            "cours": tick.get("cours") or cap.get("cours"),
            "variation": tick.get("variation"),
            "nbTitres": cap.get("nbTitres"),
            "capFlott": cap.get("capFlott"),
            "capGlob": cap.get("capGlob"),
            "capGlobPct": cap.get("capGlobPct"),
            "volTitres": vol.get("volTitres"),
            "volValeur": vol.get("volValeur"),
            "per": vol.get("per"),
            "volValeurPct": vol.get("volValeurPct"),
        }

    obligations_out = {}
    for code, o in obligations.items():
        dp_date, dp_val = None, None
        if o.get("dernierPaiement"):
            parts = [p.strip() for p in o["dernierPaiement"].split("/")]
            # format "DD/MM/YYYY / valeur" -> les 3 premiers slash sont la date
            m = re.match(r"(\d{2}/\d{2}/\d{4})\s*/\s*([\d\s,]+)", o["dernierPaiement"])
            if m:
                dp_date = m.group(1)
                dp_val = fr_number(m.group(2))
        obligations_out[code] = {
            "nom": o["nom"],
            "dateEmission": o["dateEmission"],
            "cours": o["cours"],
            "couponCouru": o["couponCouru"],
            "dernierPaiementDate": dp_date,
            "dernierPaiementValeur": dp_val,
        }

    return {
        "date": resume["date"],
        "heure": resume["heure"],
        "actions": actions,
        "obligations": obligations_out,
        "indices": scrape_indices(),
        "market_raw": resume["market_raw"],
    }


if __name__ == "__main__":
    import json
    snap = build_snapshot()
    json.dump(snap, sys.stdout, ensure_ascii=False, indent=2)
