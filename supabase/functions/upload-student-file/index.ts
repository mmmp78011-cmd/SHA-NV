import { createClient } from 'npm:@supabase/supabase-js@2';
import { importX509, jwtVerify } from 'npm:jose@5';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const corsHeaders = {
  // The browser sends this preflight before the upload because it carries
  // apikey, Authorization and x-firebase-token headers.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-firebase-token, content-type'
};

async function verifyFirebaseToken(token: string) {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  if (!projectId) throw new Error('Firebase project is not configured.');
  const [header] = token.split('.');
  const kid = JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/'))).kid;
  const certificates = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com').then(response => response.json());
  const certificate = certificates[kid];
  if (!certificate) throw new Error('Unknown Firebase signing key.');
  const key = await importX509(certificate, 'RS256');
  const { payload } = await jwtVerify(token, key, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`
  });
  if (!payload.sub) throw new Error('Invalid Firebase user.');
  return payload.sub;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (request.method !== 'POST') throw new Error('Method not allowed.');
    const token = request.headers.get('x-firebase-token');
    if (!token) throw new Error('Missing Firebase session.');
    const uid = await verifyFirebaseToken(token);
    const form = await request.formData();
    const file = form.get('file');
    const conversationId = String(form.get('conversationId') || '');
    if (!(file instanceof File) || !conversationId) throw new Error('File and conversation are required.');
    if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Format non supporté. Veuillez sélectionner un PDF ou une image.');
    if (file.size > MAX_FILE_SIZE) throw new Error('Le fichier est trop volumineux. La taille maximale autorisée est de 50 MB.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${uid}/${conversationId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from('student-files').upload(storagePath, file, {
      contentType: file.type, upsert: false
    });
    if (error) throw new Error('Supabase upload failed.');
    return Response.json({ attachment: {
      fileName: file.name, fileType: file.type, fileSize: file.size,
      storagePath, uploadedTo: 'supabase'
    } }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, {
      status: 400, headers: corsHeaders
    });
  }
});
