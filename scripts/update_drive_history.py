#!/usr/bin/env python3
"""
update_drive_history.py
--------------------------------------------------------------------
Ajoute l'instantané du jour (produit par scrape_brvm.py) à l'historique
stocké sur Google Drive, dans 3 fichiers JSON :
  history_actions.json, history_obligations.json, history_indices.json

Écrit avec un COMPTE DE SERVICE (aucune interaction humaine), dont la
clé est fournie via la variable d'environnement GOOGLE_SERVICE_ACCOUNT_JSON
(un secret GitHub Actions — jamais commité dans le dépôt).

Comportement :
  - Si les IDs de fichiers ne sont pas fournis (première exécution),
    les 3 fichiers sont créés dans le dossier Drive DRIVE_FOLDER_ID,
    partagés en lecture publique ("anyone with link"), et leurs IDs
    sont affichés dans les logs : à copier dans assets/config.js et
    dans les secrets GitHub (DRIVE_FILE_ID_ACTIONS, etc.) pour les
    exécutions suivantes.
  - Si un ID est fourni, le fichier existant est téléchargé, complété
    (une entrée par titre et par date, jamais de doublon de date), puis
    ré-uploadé.
--------------------------------------------------------------------
"""
import io
import os
import sys
import json
import datetime

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

SCOPES = ["https://www.googleapis.com/auth/drive"]

FILES = {
    "actions": {"env": "DRIVE_FILE_ID_ACTIONS", "name": "history_actions.json"},
    "obligations": {"env": "DRIVE_FILE_ID_OBLIGATIONS", "name": "history_obligations.json"},
    "indices": {"env": "DRIVE_FILE_ID_INDICES", "name": "history_indices.json"},
}


def get_service():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        sys.exit("ERREUR : variable d'environnement GOOGLE_SERVICE_ACCOUNT_JSON manquante.")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def download_json(service, file_id):
    request = service.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    buf.seek(0)
    try:
        return json.loads(buf.read().decode("utf-8"))
    except json.JSONDecodeError:
        return {"series": {}}


def upload_json(service, file_id, folder_id, name, payload):
    media = MediaIoBaseUpload(io.BytesIO(json.dumps(payload, ensure_ascii=False).encode("utf-8")),
                               mimetype="application/json")
    if file_id:
        service.files().update(fileId=file_id, media_body=media).execute()
        return file_id
    meta = {"name": name, "parents": [folder_id]} if folder_id else {"name": name}
    created = service.files().create(body=meta, media_body=media, fields="id").execute()
    new_id = created["id"]
    # Partage public en lecture seule (indispensable pour la lecture côté site
    # statique via clé API, sans authentification visiteur).
    service.permissions().create(fileId=new_id, body={"role": "reader", "type": "anyone"}).execute()
    return new_id


def merge_series(existing_series, updates, date_key="date"):
    """updates: dict code -> {nom, ...fields..., <date_key>: date déjà inclus}"""
    series = existing_series or {}
    for code, entry in updates.items():
        point = {k: v for k, v in entry.items() if k not in ("nom",)}
        if code not in series:
            series[code] = {"nom": entry.get("nom", code), "history": []}
        series[code]["nom"] = entry.get("nom", series[code].get("nom", code))
        history = series[code]["history"]
        # Retire un éventuel point du même jour (ré-exécution du job) puis ajoute
        history = [h for h in history if h.get(date_key) != point.get(date_key)]
        history.append(point)
        history.sort(key=lambda h: h.get(date_key, ""))
        series[code]["history"] = history
    return series


def main():
    from scrape_brvm import build_snapshot
    snap = build_snapshot()
    date = snap["date"]

    service = get_service()
    folder_id = os.environ.get("DRIVE_FOLDER_ID")
    now_iso = datetime.datetime.utcnow().isoformat()

    # ---- actions ----
    actions_updates = {
        code: {"nom": a["nom"], "date": date, "cours": a["cours"], "variation": a["variation"],
               "nbTitres": a["nbTitres"], "capFlott": a["capFlott"], "capGlob": a["capGlob"],
               "capGlobPct": a["capGlobPct"], "volTitres": a["volTitres"], "volValeur": a["volValeur"],
               "per": a["per"], "volValeurPct": a["volValeurPct"]}
        for code, a in snap["actions"].items()
    }
    file_id = os.environ.get(FILES["actions"]["env"]) or None
    existing = download_json(service, file_id) if file_id else {"series": {}}
    existing["series"] = merge_series(existing.get("series"), actions_updates)
    existing["updated"] = now_iso
    new_id = upload_json(service, file_id, folder_id, FILES["actions"]["name"], existing)
    print(f"actions -> file id: {new_id} ({len(existing['series'])} titres)")

    # ---- obligations ----
    obligations_updates = {
        code: {"nom": o["nom"], "date": date, "cours": o["cours"], "couponCouru": o["couponCouru"],
               "dernierPaiementDate": o["dernierPaiementDate"], "dernierPaiementValeur": o["dernierPaiementValeur"]}
        for code, o in snap["obligations"].items()
    }
    file_id = os.environ.get(FILES["obligations"]["env"]) or None
    existing = download_json(service, file_id) if file_id else {"series": {}}
    existing["series"] = merge_series(existing.get("series"), obligations_updates)
    existing["updated"] = now_iso
    new_id = upload_json(service, file_id, folder_id, FILES["obligations"]["name"], existing)
    print(f"obligations -> file id: {new_id} ({len(existing['series'])} lignes)")

    # ---- indices ----
    indices_updates = {
        code: {"nom": i["nom"], "categorie": i["categorie"], "date": date,
               "cloturePrec": i["cloturePrec"], "cloture": i["cloture"], "variation": i["variation"], "ytd": i["ytd"]}
        for code, i in snap["indices"].items()
    }
    file_id = os.environ.get(FILES["indices"]["env"]) or None
    existing = download_json(service, file_id) if file_id else {"series": {}}
    existing["series"] = merge_series(existing.get("series"), indices_updates)
    existing["updated"] = now_iso
    new_id = upload_json(service, file_id, folder_id, FILES["indices"]["name"], existing)
    print(f"indices -> file id: {new_id} ({len(existing['series'])} indices)")

    print("\nSi c'était la première exécution, copiez les 3 IDs ci-dessus dans :\n"
          "  - assets/config.js (FILE_ID_ACTIONS, FILE_ID_OBLIGATIONS, FILE_ID_INDICES)\n"
          "  - les secrets GitHub DRIVE_FILE_ID_ACTIONS / _OBLIGATIONS / _INDICES\n"
          "pour que les prochaines exécutions mettent à jour les mêmes fichiers.")


if __name__ == "__main__":
    main()
