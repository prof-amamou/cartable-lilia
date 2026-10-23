# Cartable du professeur d'informatique — guide de mise en ligne

Le site est composé de deux parties :

- **un site statique** (le dossier que vous déposez sur un hébergeur) ;
- **un projet Supabase** (base de données, comptes, fonction pour l'espace élèves).

Comptez 20 à 30 minutes pour tout mettre en place. Suivez les étapes dans l'ordre.

## Contenu du dossier

```
cartable-site/
├── index.html                 Page unique du site
├── 404.html                   Page « introuvable »
├── robots.txt                 Demande aux moteurs de recherche de ne pas indexer
├── _headers                   En-têtes de sécurité (Cloudflare Pages)
├── vercel.json                En-têtes de sécurité (Vercel)
├── .nojekyll                  Pour GitHub Pages
├── assets/
│   ├── css/app.css            Design
│   ├── img/favicon.svg        Icône
│   ├── vendor/supabase.js     Bibliothèque Supabase (copie locale, aucun CDN)
│   └── js/
│       ├── config.js          ← SEUL FICHIER À MODIFIER (adresses et clés)
│       ├── theme.js           Thème clair / sombre
│       ├── core.js            Outils communs
│       ├── wm.js              Gestionnaire de fenêtres
│       ├── teacher.js         Espace professeur (toutes les commandes)
│       ├── student.js         Espace élèves
│       └── app.js             Pages et connexion
└── supabase/
    ├── schema.sql             Tables, élèves, appel et règles de sécurité (étape 1)
    ├── config.toml            Réglage de la fonction (étape 3, option B)
    └── functions/student-access/index.ts   Fonction de l'espace élèves (étape 3)
```

Le dossier `supabase/` sert uniquement à configurer Supabase : vous pouvez ne pas le déposer sur l'hébergeur.

---

## Étape 1 — Créer les tables

1. Ouvrez votre projet sur [supabase.com/dashboard](https://supabase.com/dashboard).
2. Menu **SQL Editor** → **New query**.
3. Collez tout le contenu de `supabase/schema.sql`, puis cliquez sur **Run**.
4. Le message « Success. No rows returned » confirme que tout est prêt.

Ce script peut être relancé sans risque. Si vous utilisiez déjà une version précédente, relancez-le : il ajoute ce qui manque et **conserve vos données**. Il apporte notamment :

- la **liste des élèves**, créée en même temps que la classe (fonction `create_class`) ;
- le **journal d'appel en tableau** : le statut de chaque élève est conservé pour chaque séance (table `attendance_marks`, fonction `save_attendance`). Les anciens appels enregistrés sous forme de texte sont convertis automatiquement pour les élèves retrouvés dans la liste de la classe ;
- la date limite des devoirs.

## Étape 2 — Créer votre compte professeur

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Saisissez votre e-mail et un mot de passe de 10 caractères minimum. Cochez **Auto Confirm User**.
3. Désactivez ensuite les inscriptions libres : **Authentication** → **Sign In / Providers** (ou **Settings**) → décochez **Allow new users to sign up**. Sans cela, n'importe qui pourrait créer un compte sur votre projet.

Le bouton « Créer un compte » est déjà masqué sur le site (`ALLOW_SIGNUP: false` dans `config.js`).

## Étape 3 — Déployer la fonction de l'espace élèves

Les élèves n'ont pas de compte : la fonction `student-access` vérifie le code de leur classe. **« Verify JWT » doit être désactivé**, car la clé publique `sb_publishable_…` n'est pas un jeton JWT. Sinon les élèves verront une erreur.

**Option A — depuis le tableau de bord**

1. **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nom : `student-access` (exactement).
3. Remplacez le code par le contenu de `supabase/functions/student-access/index.ts`, puis **Deploy**.
4. Ouvrez la fonction → **Details** (ou **Settings**) → désactivez **Verify JWT**.

**Option B — avec la CLI Supabase**

```
npx supabase login
npx supabase link --project-ref gdacywogvudswedlnzre
npx supabase functions deploy student-access --no-verify-jwt
```

*(Remplacez `gdacywogvudswedlnzre` par l'identifiant de votre projet si vous changez de projet : c'est la première partie de l'adresse `https://IDENTIFIANT.supabase.co`.)*

**Recommandé : limiter les appels à votre site.** Dans **Edge Functions** → **Secrets**, ajoutez `ALLOWED_ORIGIN` avec l'**origine** de votre site (par exemple `https://VOTRE-NOM.github.io`, sans chemin ni `/` final). Faites-le après l'étape 5, quand vous connaissez l'adresse.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement à la fonction. **Ne copiez jamais la clé `service_role` dans le site.**

## Étape 4 — Vérifier `assets/js/config.js`

Le fichier contient déjà l'adresse et la clé publique de votre projet. Contrôlez-les dans **Project Settings** → **API** :

- `SUPABASE_URL` : `https://IDENTIFIANT.supabase.co`
- `SUPABASE_ANON_KEY` : la clé **publishable** (ou **anon**). Jamais la `service_role`.

## Étape 5 — Mettre le site en ligne (sans Netlify)

Le site est un simple dossier de fichiers : n'importe quel hébergeur de sites statiques convient. Il doit être servi en **HTTPS** (le chiffrement des codes de classe l'exige). Ne l'ouvrez pas par double-clic sur `index.html`. Pour un essai sur votre ordinateur : `python3 -m http.server 8080` dans le dossier, puis `http://localhost:8080`.

Trois hébergeurs gratuits, à essayer dans cet ordre (si l'un n'est pas accessible depuis votre connexion, passez au suivant) :

### Option A — GitHub Pages (la plus simple, aucune carte bancaire)

1. Créez un compte sur [github.com](https://github.com), puis un dépôt **public** (bouton *New*), par exemple `cartable`.
2. Dans le dépôt : **Add file** → **Upload files**. Glissez **le contenu** du dossier `cartable-site` (index.html, le dossier `assets`, `404.html`, etc., pas le dossier lui-même), puis **Commit changes**.
3. **Settings** → **Pages** → *Build and deployment* : source **Deploy from a branch**, branche **main**, dossier **/ (root)** → **Save**.
4. Après une à deux minutes, le site est disponible à l'adresse `https://VOTRE-NOM.github.io/cartable/`.

Le dépôt étant public, tout le monde peut lire `config.js` : ce n'est pas un problème, il ne contient que des clés publiques (jamais la clé `service_role`). Les en-têtes de sécurité (`_headers`, `vercel.json`) ne s'appliquent pas sur GitHub Pages ; la protection des données repose sur les règles de la base (étape 1).

### Option B — Cloudflare Pages

1. Créez un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
3. Donnez un nom au projet, glissez le dossier `cartable-site`, puis **Deploy**.
4. Adresse obtenue : `https://NOM-DU-PROJET.pages.dev`. Le fichier `_headers` est pris en compte.

### Option C — Vercel

1. Créez un compte gratuit sur [vercel.com](https://vercel.com) (connexion possible avec GitHub).
2. **Add New** → **Project** → importez le dépôt GitHub de l'option A (ou utilisez la CLI : `npx vercel` dans le dossier).
3. *Framework Preset* : **Other**, aucune commande de build, dossier de sortie : racine. **Deploy**.
4. Adresse obtenue : `https://NOM-DU-PROJET.vercel.app`. Le fichier `vercel.json` est pris en compte.

**Notez deux informations sur l'adresse obtenue**, elles servent aux étapes 3, 6 et 7 :

- l'**adresse complète** du site, par exemple `https://VOTRE-NOM.github.io/cartable/` ;
- son **origine**, c'est-à-dire l'adresse sans le chemin, par exemple `https://VOTRE-NOM.github.io`.

## Étape 6 — Déclarer l'adresse dans Supabase

**Authentication** → **URL Configuration** :

- **Site URL** : l'adresse complète de votre site (avec le chemin, par exemple `https://VOTRE-NOM.github.io/cartable/`) ;
- **Redirect URLs** : ajoutez la même adresse.

Cela permet au lien « Mot de passe oublié ? » de revenir sur votre site.

## Étape 7 — Google Drive (facultatif)

Sans cette étape, tout fonctionne, sauf le bouton « Ajouter depuis Google Drive ». Vous pouvez toujours coller un lien Drive à la main dans le champ « Lien ».

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com) et créez un projet.
2. **APIs & Services** → **Library** : activez **Google Picker API** et **Google Drive API**.
3. **OAuth consent screen** : type *External*, renseignez le nom de l'application, ajoutez votre adresse comme utilisateur de test. Le site demande uniquement l'autorisation `drive.file` (accès aux seuls fichiers que vous choisissez).
4. **Credentials** → **Create credentials** :
   - **API key** : limitez-la aux sites web (HTTP referrers) en saisissant l'adresse complète de votre site suivie de `*`, et à l'API Picker ;
   - **OAuth client ID** de type *Web application*, avec dans *Authorized JavaScript origins* l'**origine** de votre site (sans chemin ni `/` final).
5. Sur la page d'accueil du projet, relevez le **Project number**.
6. Dans `assets/js/config.js`, remplacez :
   - `GOOGLE_API_KEY` par la clé API ;
   - `GOOGLE_CLIENT_ID` par l'identifiant client ;
   - `GOOGLE_APP_ID` par le numéro de projet.
7. Redéposez le site. Pour que les élèves ouvrent un fichier, son partage Drive doit être réglé sur « Toute personne disposant du lien ».

## Étape 8 — Tester avant de donner le code aux élèves

1. Ouvrez le site → **Espace professeur** → connectez-vous.
2. **Classes** : créez une classe en collant la liste des élèves (un nom par ligne). Le code s'affiche **une seule fois** : copiez-le.
3. **Élèves** : vérifiez la liste ; vous pouvez y ajouter ou retirer des élèves plus tard.
4. **Appel** : pointez quelques élèves, enregistrez, puis vérifiez la nouvelle colonne dans le tableau « Journal d'appel ». Cliquez sur une date pour rouvrir la séance.
5. **Cours** : publiez un cours avec un lien.
6. Dans un autre navigateur (ou en navigation privée), ouvrez l'**Espace élèves**, saisissez le code et votre nom : le cours doit apparaître.
7. Posez une question et rendez un travail depuis l'espace élèves, puis consultez-les dans **Questions** et **Travaux rendus**.

## Utilisation des fenêtres

- Chaque outil s'ouvre dans **sa propre fenêtre**. Faites-la glisser par la barre de titre, redimensionnez-la par ses bords, double-cliquez sur la barre pour l'agrandir.
- **Maj + clic** (ou Ctrl + clic) sur un outil ouvre une **seconde fenêtre** du même outil : pratique pour comparer deux classes. Chaque fenêtre a son propre sélecteur de classe.
- La barre du bas liste les fenêtres ouvertes ; un clic réduit ou rétablit la fenêtre.
- Le bouton 🖨 imprime uniquement la fenêtre concernée.
- La position et la taille de chaque fenêtre sont mémorisées sur votre ordinateur.
- Sur téléphone, une seule fenêtre est affichée à la fois, en plein écran ; la barre du bas permet de passer de l'une à l'autre.

## Sécurité et données personnelles

- Les données de chaque professeur sont isolées par des règles de sécurité (RLS) : un compte ne voit que ses propres classes.
- Les codes de classe ne sont jamais stockés en clair, seulement leur empreinte SHA-256. Un code oublié ne peut pas être retrouvé : utilisez **Classes** → **Nouveau code** (l'ancien code cesse alors de fonctionner).
- Les noms et les notes des élèves sont des données personnelles. Vérifiez avec votre établissement les règles applicables (en Tunisie, la loi organique n° 2004-63 sur la protection des données à caractère personnel) et limitez-vous aux informations nécessaires.
- Le code de classe filtre l'accès aux documents mais n'est pas un secret fort : ne publiez rien de confidentiel dans l'espace élèves.
- Faites une copie régulière avec **Sauvegarde** → **Tout télécharger (JSON)**.
- Les projets Supabase gratuits peuvent être mis en pause après une période d'inactivité (environ une semaine). Si le site ne répond plus, ouvrez le tableau de bord Supabase et reprenez le projet.

## Dépannage

| Message ou symptôme | Cause et solution |
|---|---|
| « Configuration nécessaire » | `config.js` n'est pas rempli ou n'a pas été redéposé. |
| « La base n'est pas à jour… » | Relancez `supabase/schema.sql` (étape 1). |
| « La fonction student-access refuse la requête… » | « Verify JWT » est encore activé (étape 3). |
| « La fonction student-access est introuvable » | La fonction n'est pas déployée, ou son nom est différent de `student-access`. |
| « Code inconnu » | Code mal recopié, ou remplacé par « Nouveau code ». |
| « Email not confirmed » | Compte créé sans « Auto Confirm User » : confirmez-le dans **Authentication** → **Users**. |
| « Could not find the function create_class » ou « save_attendance » | `schema.sql` n'a pas été relancé dans sa dernière version (étape 1). |
| Le bouton Google Drive ne répond pas | Vérifiez les trois valeurs Google dans `config.js` et l'adresse dans *Authorized JavaScript origins*. Ouvrez la console du navigateur (F12) pour lire l'erreur. |
| Page blanche ou sans style | Un fichier du dossier `assets/` n'a pas été déposé. Redéposez le dossier complet. |
| Une modification n'apparaît pas | Le navigateur garde les fichiers en mémoire environ une heure : rechargez avec Ctrl + F5. |

## Mettre à jour le site

Remplacez les fichiers sur l'hébergeur (en conservant votre `assets/js/config.js`). Si `schema.sql` a changé, relancez-le dans le SQL Editor ; si `index.ts` a changé, redéployez la fonction.
