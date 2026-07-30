# Easy Replace — Phase 6.2 + 6.3

## Ordre d'installation

1. Exécuter `supabase/migrations/011_subscriptions_sms_quotas.sql` dans le SQL Editor Supabase.
2. Remplacer les fichiers du projet en conservant `.env.local` et `.git`.
3. Exécuter `npm install`, puis `npm run build`.
4. Tester localement puis déployer sur Vercel.

## Variables Vercel nécessaires

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `BREVO_API_KEY`

La fonction `/api/send-sms` exige maintenant le jeton Supabase de l'utilisateur et réserve atomiquement le quota avant de contacter Brevo.

## Fonctionnalités

- page Abonnement ;
- forfait, statut, période et échéance ;
- consommation par segments SMS ;
- alertes à 50 %, 80 % et 100 % ;
- blocage serveur en cas de quota insuffisant ;
- échecs Brevo non décomptés ;
- historique des SMS ;
- historique d'abonnement ;
- tables de préparation des packs SMS et de Stripe.

## Validation

Le build n'a pas pu être exécuté dans l'environnement de génération, car son registre npm interne retourne une erreur 404 pour `yallist@3.1.1`. Les fichiers JavaScript non-JSX ont passé `node --check`. La validation finale doit être faite localement avec `npm install && npm run build`.
