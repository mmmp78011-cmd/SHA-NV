# Configuration Supabase

L'application utilise Firebase pour l'authentification et Firestore, et Supabase
uniquement pour le stockage privé des PDF et images envoyés dans l'assistant.

1. Dans **Supabase Dashboard > Settings > API**, copiez la clé **anon** ou
   **publishable** (jamais une clé `sb_secret_...` ou `service_role`).
2. Dans [supabase-config.js](./supabase-config.js), remplacez
   `REPLACE_WITH_SUPABASE_ANON_OR_PUBLISHABLE_KEY` par cette clé. L'URL du
   projet est déjà définie pour le projet `ezurspniykrbobfekifn`.
3. Liez le CLI au projet puis appliquez la migration, qui crée le bucket privé :

   ```powershell
   npx supabase login
   npx supabase link --project-ref ezurspniykrbobfekifn
   npx supabase db push
   ```

4. Ajoutez le secret Firebase nécessaire à la fonction Edge, puis déployez-la :

   ```powershell
   npx supabase secrets set FIREBASE_PROJECT_ID=school-helping-ai
   npx supabase functions deploy upload-student-file --no-verify-jwt
   ```

Le client transmet le jeton Firebase à la fonction `upload-student-file`. La
fonction le vérifie, puis utilise sa clé serveur Supabase stockée côté Edge
Function pour écrire dans `student-files`.

## Important

Une clé `sb_secret_...` a été retirée de la configuration navigateur. Révoquez-la
dans **Supabase Dashboard > Settings > API** avant de mettre l'application en
ligne, puis créez une nouvelle clé si elle a été utilisée ailleurs.
