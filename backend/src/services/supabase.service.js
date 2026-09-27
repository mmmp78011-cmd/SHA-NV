import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export async function downloadStudentAttachment(uid, conversationId, attachment) {
  if (!supabase) throw new AppError(503, 'Le stockage Supabase n’est pas configuré.', 'STORAGE_NOT_CONFIGURED');
  const prefix = `${uid}/${conversationId}/`;
  if (!attachment.storagePath.startsWith(prefix) || attachment.storagePath.split('/').length !== 3) throw new AppError(403, 'Ce fichier ne t’appartient pas.', 'FILE_ACCESS_DENIED');
  if (!allowedTypes.has(attachment.fileType)) throw new AppError(400, 'Format de fichier non pris en charge.', 'INVALID_FILE_TYPE');
  const maxBytes = Math.min(20, Number(process.env.MAX_ATTACHMENT_BYTES) / 1048576 || 10) * 1048576;
  if (attachment.fileSize > maxBytes) throw new AppError(413, 'Ce fichier dépasse la taille maximale autorisée pour l’analyse.', 'FILE_TOO_LARGE');
  const { data, error } = await supabase.storage.from('student-files').download(attachment.storagePath);
  if (error || !data) throw new AppError(404, 'Le fichier demandé est introuvable.', 'FILE_NOT_FOUND');
  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new AppError(413, 'Ce fichier dépasse la taille maximale autorisée pour l’analyse.', 'FILE_TOO_LARGE');
  return { buffer, fileType: attachment.fileType, fileName: attachment.fileName };
}

export async function extractPdfText(buffer) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return { text: result.text || '' };
  } catch {
    throw new AppError(422, 'Ce PDF n’a pas pu être lu. Essaie un document PDF textuel.', 'DOCUMENT_UNREADABLE');
  }
}
