# Easy Replace

Application V1 de gestion des remplacements de coachs : répertoire, appels par SMS, historique et suivi.

## Installation

1. Exécuter les migrations du dossier `supabase/migrations` dans l’ordre. La migration `002` met aussi à niveau une base ayant déjà reçu la migration initiale.
2. Dans **Authentication → Providers → Email**, conserver l’inscription par e-mail activée et activer la confirmation des adresses e-mail.
3. Copier `.env.example` vers `.env.local` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. Dans **Authentication → URL Configuration**, renseigner l’URL du site et ajouter `http://localhost:5173`, `http://localhost:5173/reset-password`, ainsi que les URL Vercel équivalentes aux Redirect URLs.
5. Personnaliser si nécessaire les modèles **Confirm signup** et **Reset password** dans **Authentication → Email Templates**.
6. Lancer `npm install`, puis `npm run dev`.

Chaque gérante crée son compte depuis l’application. Son prénom et son nom sont envoyés dans les métadonnées d’inscription ; le trigger `handle_new_user` crée automatiquement sa ligne `profiles`. Tant que son adresse e-mail n’est pas confirmée, aucune session n’est acceptée par l’application.

## SMS

Pour tester la fonction locale Vercel, définir `BREVO_API_KEY` dans l’environnement local puis utiliser `npx vercel dev` (la commande Vite seule ne sert pas les fonctions `/api`). Sans cette variable, la route renvoie une erreur de configuration et aucun envoi n’est simulé.

Pour activer les SMS réels, créer une clé API v3 Brevo, activer/configurer les SMS transactionnels dans Brevo, vérifier que l’expéditeur `EasyReplace` est accepté dans les pays ciblés, puis ajouter `BREVO_API_KEY` uniquement comme variable serveur Vercel. Ne jamais la préfixer par `VITE_`.

La route appelle `POST https://api.brevo.com/v3/transactionalSMS/sms` une fois par coach et renvoie les succès et échecs individuels.
