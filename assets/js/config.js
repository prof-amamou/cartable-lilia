/*
 * Configuration du Cartable — seul fichier à modifier avant la mise en ligne.
 *
 * SUPABASE_URL et SUPABASE_ANON_KEY : Supabase > Project Settings > API.
 *   Utilisez UNIQUEMENT la clé « publishable » (ou « anon »).
 *   N'écrivez JAMAIS la clé « service_role » ici : ce fichier est public.
 */
window.CARTABLE_CONFIG = {
  SUPABASE_URL: "https://gdacywogvudswedlnzre.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_y9oJu5UXhXg9ltO-303E1A_4F8bSdB3",

  // false = le bouton « Créer un compte » est masqué (recommandé : créez votre
  // compte une fois dans Supabase > Authentication > Users, puis désactivez les inscriptions).
  ALLOW_SIGNUP: false,

  // Google Drive (facultatif — voir DEPLOIEMENT.md, étape 7).
  GOOGLE_API_KEY: "VOTRE_CLE_API_GOOGLE",
  GOOGLE_CLIENT_ID: "VOTRE_CLIENT_ID_GOOGLE.apps.googleusercontent.com",
  GOOGLE_APP_ID: "VOTRE_NUMERO_PROJET_GOOGLE"
};
