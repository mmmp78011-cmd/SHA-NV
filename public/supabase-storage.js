import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './supabase-config.js';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export function validateSupportFile(file) {
  if (!file) return 'Aucun fichier sélectionné.';
  if (!ACCEPTED_TYPES.has(file.type)) return 'Format non supporté. Veuillez sélectionner un PDF ou une image.';
  if (file.size > MAX_FILE_SIZE) return 'Le fichier est trop volumineux. La taille maximale autorisée est de 50 MB.';
  return '';
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadStudentFile({ file, conversationId, firebaseToken }) {
  const issue = validateSupportFile(file);
  if (issue) throw new Error(issue);
  if (!isSupabaseConfigured) {
    throw new Error('Supabase n’est pas configuré. Ajoutez l’URL et la clé anonyme dans supabase-config.js.');
  }
  if (!conversationId || !firebaseToken) throw new Error('Votre session ou votre conversation est introuvable. Réessayez.');

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('conversationId', conversationId);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-student-file`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'x-firebase-token': firebaseToken
    },
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'L’envoi du fichier a échoué. Vérifiez votre connexion et réessayez.');
  return result.attachment;
}
