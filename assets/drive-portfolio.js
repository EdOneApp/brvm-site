/**
 * drive-portfolio.js
 * ------------------------------------------------------------------
 * Portefeuille personnel : chaque visiteur se connecte avec SON PROPRE
 * compte Google (OAuth "Google Identity Services", exécuté entièrement
 * dans le navigateur — jamais de mot de passe ni de jeton géré par ce
 * site). Le fichier "portefeuille.json" est stocké dans son Drive
 * personnel, dossier caché appDataFolder (invisible ailleurs, lisible
 * uniquement par cette application). Aucune donnée de portefeuille
 * n'est jamais envoyée à un serveur tiers : uniquement Google <-> navigateur.
 * ------------------------------------------------------------------
 */
const DrivePortfolio = (function () {
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const FILE_NAME = "brvm-live-portefeuille.json";
  let tokenClient = null;
  let accessToken = null;
  let fileId = null;

  function ready() {
    return !!(window.BRVM_CONFIG && window.BRVM_CONFIG.OAUTH_CLIENT_ID) && !!window.google;
  }

  function init(onChange) {
    if (!ready()) return false;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.BRVM_CONFIG.OAUTH_CLIENT_ID,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) { console.error(resp); return; }
        accessToken = resp.access_token;
        await ensureFile();
        onChange(await load());
      }
    });
    return true;
  }

  function signIn() {
    if (!tokenClient) return;
    tokenClient.requestAccessToken();
  }
  function signOut() {
    if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null; fileId = null;
  }
  function isSignedIn() { return !!accessToken; }

  async function api(path, opts = {}) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`Drive API ${path} → HTTP ${res.status}`);
    return res;
  }

  async function ensureFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and 'appDataFolder' in parents`);
    const listRes = await api(`files?spaces=appDataFolder&q=${q}&fields=files(id,name)`);
    const list = await listRes.json();
    if (list.files && list.files.length) { fileId = list.files[0].id; return; }
    // créer le fichier vide
    const metaRes = await api("files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] })
    });
    const meta = await metaRes.json();
    fileId = meta.id;
    await save([]);
  }

  async function load() {
    if (!fileId) return [];
    try {
      const res = await api(`files/${fileId}?alt=media`);
      return await res.json();
    } catch (e) { return []; }
  }

  async function save(list) {
    if (!fileId) return;
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(list)
    });
  }

  async function add(item) {
    const list = await load();
    if (!list.find(i => i.code === item.code)) list.push(item);
    await save(list);
    return list;
  }
  async function remove(code) {
    const list = (await load()).filter(i => i.code !== code);
    await save(list);
    return list;
  }

  return { ready, init, signIn, signOut, isSignedIn, load, add, remove };
})();
