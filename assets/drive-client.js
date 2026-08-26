/**
 * drive-client.js
 * ------------------------------------------------------------------
 * Charge l'historique BRVM depuis 3 fichiers JSON publics sur Google
 * Drive (écrits chaque jour par le scraper GitHub Actions, voir
 * /scripts et /.github/workflows). Ne nécessite AUCUNE connexion de
 * l'utilisateur : les fichiers Drive sont partagés en lecture publique
 * et lus via une clé API restreinte.
 *
 * Fournit une promesse globale window.BRVM_DATA_READY qui résout avec
 * un objet { actions, obligations, indices, market, source, updated }.
 * `source` vaut "drive" si l'historique réel a pu être chargé, sinon
 * "seed" (repli sur l'instantané embarqué dans data-seed.js).
 * ------------------------------------------------------------------
 */

(function () {
  const CACHE_KEY = "brvm_history_cache_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min : évite de re-frapper l'API à chaque navigation

  function driveFileUrl(fileId, apiKey) {
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  }

  async function fetchDriveJson(fileId, apiKey) {
    if (!fileId || !apiKey) return null;
    const res = await fetch(driveFileUrl(fileId, apiKey), { cache: "no-store" });
    if (!res.ok) throw new Error(`Drive fetch ${fileId} → HTTP ${res.status}`);
    return res.json();
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
    } catch (e) { /* quota / navigation privée : tant pis, pas bloquant */ }
  }

  // Fusionne un historique Drive (peut être partiel/plus long) avec le seed,
  // en gardant l'union chronologique par titre, sans doublons de date.
  function mergeSeries(driveSeries, seedSeries) {
    const out = {};
    const codes = new Set([...Object.keys(driveSeries || {}), ...Object.keys(seedSeries || {})]);
    codes.forEach(code => {
      const d = (driveSeries && driveSeries[code]) || null;
      const s = seedSeries[code] || null;
      const base = d || s;
      if (!base) return;
      const byDate = {};
      (s ? s.history : []).forEach(pt => byDate[pt.date] = pt);
      (d ? d.history : []).forEach(pt => byDate[pt.date] = pt); // Drive prioritaire si même date
      const history = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
      out[code] = { ...base, history };
    });
    return out;
  }

  async function load() {
    const cfg = window.BRVM_CONFIG || {};
    const seed = window.BRVM_SEED;
    const cached = readCache();
    if (cached) return cached;

    const configured = cfg.DRIVE_API_KEY && cfg.FILE_ID_ACTIONS && cfg.FILE_ID_OBLIGATIONS && cfg.FILE_ID_INDICES;

    if (!configured) {
      const result = { ...seed, source: "seed" };
      writeCache(result);
      return result;
    }

    try {
      const [actionsDoc, obligationsDoc, indicesDoc] = await Promise.all([
        fetchDriveJson(cfg.FILE_ID_ACTIONS, cfg.DRIVE_API_KEY),
        fetchDriveJson(cfg.FILE_ID_OBLIGATIONS, cfg.DRIVE_API_KEY),
        fetchDriveJson(cfg.FILE_ID_INDICES, cfg.DRIVE_API_KEY)
      ]);

      const result = {
        source: "drive",
        updated: [actionsDoc, obligationsDoc, indicesDoc].map(d => d && d.updated).filter(Boolean).sort().pop() || seed.updated,
        actions: mergeSeries(actionsDoc && actionsDoc.series, seed.actions),
        obligations: mergeSeries(obligationsDoc && obligationsDoc.series, seed.obligations),
        indices: mergeSeries(indicesDoc && indicesDoc.series, seed.indices),
        market: seed.market // le résumé marché du jour reste celui du dernier scrape (voir README pour l'étendre)
      };
      writeCache(result);
      return result;
    } catch (err) {
      console.warn("[BRVM] Impossible de charger l'historique Drive, repli sur les données du jour.", err);
      const result = { ...seed, source: "seed", driveError: String(err) };
      writeCache(result);
      return result;
    }
  }

  window.BRVM_DATA_READY = load();
})();
