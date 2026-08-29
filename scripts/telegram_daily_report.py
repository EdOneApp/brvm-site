#!/usr/bin/env python3
"""
telegram_daily_report.py
--------------------------------------------------------------------
Envoie chaque jour ouvré, à la clôture de séance, un message Telegram
récapitulatif : Top 5 hausses, Flop 5 baisses, et Top 5 "Bons plans"
(même méthodologie de score que la page bons-plans.html du site,
réimplémentée ici en Python pour ne dépendre d'aucun serveur).

Fonctionne intégralement depuis un run GitHub Actions : ce script
scrape brvm.org lui-même (via scrape_brvm.py, déjà dans le dépôt),
calcule tout en mémoire, puis envoie le message via l'API HTTP de
Telegram. Aucune dépendance à Google Drive : le rapport reste fiable
même si la synchro Drive a un souci ce jour-là.

Variables d'environnement requises (secrets GitHub) :
  TELEGRAM_BOT_TOKEN   token du bot (via @BotFather)
  TELEGRAM_CHAT_ID     identifiant du chat/canal/groupe destinataire
--------------------------------------------------------------------
"""
import os
import sys
import requests

from scrape_brvm import build_snapshot

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def compute_opportunity_score(a):
    """Même formule que BRVM.computeOpportunityScore() côté site (app.js) :
    50% valorisation (PER), 30% dynamique du jour, 20% liquidité."""
    per = a.get("per")
    score_val = 50.0
    if per is not None and per > 0:
        score_val = max(0.0, min(100.0, 100 - ((per - 5) / (40 - 5)) * 100))

    variation = a.get("variation") or 0.0
    score_momentum = max(0.0, min(100.0, ((variation + 5) / 10) * 100))

    liq = a.get("volValeurPct") or 0.0
    score_liquidite = max(0.0, min(100.0, (liq / 15) * 100))

    score = score_val * 0.5 + score_momentum * 0.3 + score_liquidite * 0.2
    return round(score)


def fmt_num(n, decimals=0):
    if n is None:
        return "n/d"
    return f"{n:,.{decimals}f}".replace(",", " ").replace(".", ",") if decimals else f"{n:,.0f}".replace(",", " ")


def fmt_pct(n):
    if n is None:
        return "n/d"
    sign = "+" if n > 0 else ""
    return f"{sign}{n:.2f}".replace(".", ",") + "%"


def build_message(snap):
    actions = [{"code": code, **a} for code, a in snap["actions"].items() if a.get("cours") is not None]
    with_variation = [a for a in actions if a.get("variation") is not None]

    top5 = sorted(with_variation, key=lambda a: a["variation"], reverse=True)[:5]
    flop5 = sorted(with_variation, key=lambda a: a["variation"])[:5]

    scored = [{"score": compute_opportunity_score(a), **a} for a in actions]
    bons_plans = sorted(scored, key=lambda a: a["score"], reverse=True)[:5]

    lines = []
    lines.append(f"📊 <b>Clôture BRVM — {snap['date']}</b>")
    lines.append(f"Séance du jour, données arrêtées à {snap['heure']}")
    lines.append("")

    lines.append("🏆 <b>Top 5 hausses</b>")
    for i, a in enumerate(top5, 1):
        lines.append(f"{i}. <b>{a['code']}</b> — {a['nom']} — {fmt_num(a['cours'])} FCFA ({fmt_pct(a['variation'])})")
    lines.append("")

    lines.append("📉 <b>Flop 5 baisses</b>")
    for i, a in enumerate(flop5, 1):
        lines.append(f"{i}. <b>{a['code']}</b> — {a['nom']} — {fmt_num(a['cours'])} FCFA ({fmt_pct(a['variation'])})")
    lines.append("")

    lines.append("⭐ <b>Bons plans du jour (score /100)</b>")
    for i, a in enumerate(bons_plans, 1):
        per_txt = fmt_num(a.get("per"), 2) if a.get("per") else "n/d"
        lines.append(
            f"{i}. <b>{a['code']}</b> — score {a['score']}/100 — {fmt_num(a['cours'])} FCFA "
            f"({fmt_pct(a.get('variation'))}) — PER {per_txt}"
        )
    lines.append("")
    lines.append("ℹ️ Score indicatif (PER, dynamique du jour, liquidité) — ceci n'est pas un conseil en investissement.")

    return "\n".join(lines)


def send_telegram_message(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat_id):
        sys.exit("ERREUR : TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants (secrets GitHub).")

    resp = requests.post(
        TELEGRAM_API.format(token=token),
        data={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=30,
    )
    resp.raise_for_status()
    print("Message Telegram envoyé avec succès.")


def main():
    snap = build_snapshot()
    message = build_message(snap)
    print(message)  # visible dans les logs GitHub Actions, utile pour déboguer
    send_telegram_message(message)


if __name__ == "__main__":
    main()