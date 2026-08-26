# BRVM Live

Tableau de bord non-officiel de la Bourse Régionale des Valeurs Mobilières
(BRVM) : actions, obligations, indices, fiches détaillées avec historique,
lexique technique et sélection « bons plans » calculée automatiquement.

Site 100% statique (HTML/CSS/JS, aucun build), hébergeable gratuitement sur
**GitHub Pages**. L'historique des cours est stocké sur **Google Drive** et
alimenté chaque jour par un robot **GitHub Actions** gratuit.

- Démo sans configuration : le site fonctionne dès la mise en ligne, avec
  l'instantané du 26/08/2026 comme unique point de départ.
- Historique complet : nécessite ~15 minutes de configuration ci-dessous.

---

## 1. Mettre le site en ligne (GitHub Pages)

1. Créez un dépôt GitHub (public), et poussez tout le contenu de ce dossier
   à la racine du dépôt.
2. Dans **Settings → Pages**, choisissez la branche `main` et le dossier
   `/ (root)`.
3. Votre site est en ligne sur `https://VOTRE-USER.github.io/VOTRE-DEPOT/`.

À ce stade, le site affiche déjà toutes les données du 26/08/2026 (actions,
obligations, indices) grâce à `assets/data-seed.js`. Les graphiques
n'auront qu'un seul point tant que l'étape 2 n'est pas faite.

---

## 2. Activer l'historique réel (Google Drive + robot quotidien)

### 2.1 Créer un projet Google Cloud (gratuit)

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com),
   créez un projet (ex. `brvm-live`).
2. Menu **API et services → Bibliothèque** → activez **Google Drive API**.

### 2.2 Créer un compte de service (écriture automatique, côté robot)

1. **API et services → Identifiants → Créer des identifiants → Compte de
   service**. Nommez-le `brvm-scraper`.
2. Une fois créé, onglet **Clés → Ajouter une clé → JSON** : un fichier
   `.json` se télécharge. **Ne le commitez jamais dans le dépôt.**
3. Notez l'adresse e-mail du compte de service (ex.
   `brvm-scraper@brvm-live.iam.gserviceaccount.com`).

### 2.3 Créer une clé API publique (lecture seule, côté site)

1. **API et services → Identifiants → Créer des identifiants → Clé API**.
2. Cliquez sur la clé créée → **Restreindre la clé** :
   - Restrictions API : **Google Drive API** uniquement.
   - Restrictions relatives aux applications : **Référents HTTP**, ajoutez
     `https://VOTRE-USER.github.io/*`.
3. Cette clé est sûre à exposer publiquement dans `assets/config.js` : elle
   ne permet que de LIRE les 3 fichiers d'historique (partagés en public),
   rien d'autre.

### 2.4 Créer un dossier Drive et le partager avec le compte de service

1. Dans votre Google Drive personnel, créez un dossier (ex. `BRVM Live`).
2. Partagez ce dossier avec l'adresse e-mail du compte de service
   (étape 2.2), rôle **Éditeur**.
3. Copiez l'ID du dossier depuis l'URL
   (`drive.google.com/drive/folders/CET_ID_ICI`).

### 2.5 Configurer les secrets GitHub Actions

Dans votre dépôt GitHub : **Settings → Secrets and variables → Actions →
New repository secret**. Ajoutez :

| Nom du secret | Valeur |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | le **contenu complet** du fichier JSON de l'étape 2.2 |
| `DRIVE_FOLDER_ID` | l'ID du dossier de l'étape 2.4 |

Laissez `DRIVE_FILE_ID_ACTIONS`, `DRIVE_FILE_ID_OBLIGATIONS`,
`DRIVE_FILE_ID_INDICES` vides pour l'instant (créés automatiquement).

### 2.6 Premier lancement manuel

1. Onglet **Actions** de votre dépôt → workflow **« Mise à jour quotidienne
   BRVM → Google Drive »** → **Run workflow**.
2. À la fin de l'exécution, ouvrez les logs : vous verrez 3 lignes du type
   `actions -> file id: 1AbCdEf...`. Notez les 3 IDs.
3. Ajoutez-les comme nouveaux secrets GitHub :
   `DRIVE_FILE_ID_ACTIONS`, `DRIVE_FILE_ID_OBLIGATIONS`,
   `DRIVE_FILE_ID_INDICES` (pour que les exécutions suivantes mettent à
   jour les MÊMES fichiers au lieu d'en recréer).

### 2.7 Connecter le site à Drive

Éditez `assets/config.js` :

```js
window.BRVM_CONFIG = {
  DRIVE_API_KEY: "VOTRE_CLE_API_ETAPE_2.3",
  FILE_ID_ACTIONS: "ID_DU_FICHIER_ACTIONS",
  FILE_ID_OBLIGATIONS: "ID_DU_FICHIER_OBLIGATIONS",
  FILE_ID_INDICES: "ID_DU_FICHIER_INDICES",
  OAUTH_CLIENT_ID: ""  // voir section 3, optionnel
};
```

Commitez et poussez. Le bandeau d'avertissement disparaît du site, et
chaque page charge désormais l'historique réel depuis Drive (mis en cache
10 minutes côté navigateur pour rester rapide).

Le robot (`.github/workflows/daily-brvm-update.yml`) tourne ensuite tout
seul chaque jour ouvré à 17h15 UTC (modifiable), sans aucune action de
votre part — l'historique s'enrichit d'un point par jour.

---

## 3. (Optionnel) Portefeuille personnel via Google Drive

Cette fonctionnalité permet à chaque visiteur de suivre sa propre liste de
titres, stockée dans SON PROPRE Drive (aucune donnée partagée entre
visiteurs, aucune donnée reçue par vous en tant qu'hébergeur).

1. Google Cloud Console → **API et services → Identifiants → Créer des
   identifiants → ID client OAuth** → type **Application Web**.
2. Ajoutez `https://VOTRE-USER.github.io` dans les **origines JavaScript
   autorisées**.
3. Copiez le Client ID dans `assets/config.js` → `OAUTH_CLIENT_ID`.
4. Sur l'écran de consentement OAuth, ajoutez le scope
   `https://www.googleapis.com/auth/drive.appdata`.

Tant que cette étape n'est pas faite, la page « Mon portefeuille » affiche
simplement un message d'information — le reste du site fonctionne
normalement.

---

## Structure du dépôt

```
index.html            Tableau de bord
actions.html           Liste des 47 actions (tri/filtre)
obligations.html       Liste des ~200 lignes obligataires
indices.html           Indices principaux, sectoriels, total return
detail.html             Fiche détail (?type=action|obligation|indice&code=XXX)
bons-plans.html         Score d'opportunité calculé
lexique.html            Glossaire des termes BRVM
portefeuille.html       Portefeuille personnel (Google Drive perso)
assets/
  style.css             Design system
  app.js                Formatage, tri/filtre, graphique canvas, scoring
  data-seed.js           Instantané du 26/08/2026 (repli si Drive non configuré)
  drive-client.js        Charge l'historique réel depuis Drive (lecture publique)
  drive-portfolio.js     Portefeuille personnel (OAuth, appDataFolder)
  glossary.js             Définitions du lexique
  config.js               À REMPLIR : clé API Drive, IDs de fichiers, OAuth Client ID
scripts/
  scrape_brvm.py          Lit brvm.org, produit l'instantané du jour
  update_drive_history.py Fusionne l'instantané dans l'historique Drive
  requirements.txt
.github/workflows/
  daily-brvm-update.yml   Robot quotidien (GitHub Actions, gratuit)
```

## Limites connues

- **Historique** : démarre au jour où vous activez le robot (ou au
  26/08/2026 si vous rejouez le scraper avant). Pas d'historique
  rétroactif : brvm.org ne publie que le jour courant.
- **« Bons plans »** : score indicatif basé sur PER, variation du jour et
  liquidité — **ce n'est pas un conseil en investissement**. Devient plus
  pertinent avec plusieurs semaines d'historique.
- **Type d'obligation** (État / titrisation / institution) déduit du
  préfixe du code, à vérifier sur la notice d'émission officielle.
- Ce site n'est pas affilié à la BRVM. Source des données : brvm.org
  (pages publiques). Le Bulletin Officiel de la Cote reste la seule
  référence légale.
# brvm-site
# brvm-site
