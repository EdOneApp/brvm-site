/**
 * config.js — À REMPLIR (voir README.md, section "Configuration").
 * Rien de secret ne doit être mis ici : la clé API Drive ci-dessous
 * est une clé PUBLIQUE en lecture seule, restreinte à l'API Drive et
 * à votre domaine GitHub Pages. Elle ne permet ni d'écrire, ni de lire
 * autre chose que les 3 fichiers d'historique publics.
 */
window.BRVM_CONFIG = {
  // Clé API Google Cloud (restreinte : API "Google Drive API" uniquement,
  // référents HTTP limités à https://VOTRE-USER.github.io/*)
  DRIVE_API_KEY: "AIzaSyCJmkLUsK-DIdh1EXDkPT-MGIN4-PwdMpo",

  // IDs des 3 fichiers JSON d'historique sur Google Drive (partagés
  // en "Toute personne disposant du lien : Lecteur"). Vide = mode
  // seed uniquement (données du jour, pas d'historique persistant).
  FILE_ID_ACTIONS: "",
  FILE_ID_OBLIGATIONS: "",
  FILE_ID_INDICES: "",

  // Pour la fonctionnalité "Mon portefeuille" (optionnelle, personnelle) :
  // Client ID OAuth 2.0 "Application Web" créé dans Google Cloud Console.
  // Chaque visiteur se connecte avec SON PROPRE compte Google et son
  // portefeuille est écrit dans SON PROPRE Drive (fichier privé,
  // appDataFolder) — vos données de marché ne sont jamais mélangées
  // avec celles des visiteurs.
  OAUTH_CLIENT_ID: "381750769426-i880m899frluukurb4lgv642dq9unnhd.apps.googleusercontent.com"
};
