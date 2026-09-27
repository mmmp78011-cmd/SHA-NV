import { auth, authReady, db } from './firebase-config.js';
import { authenticatedFetch } from './api.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { formatFileSize, uploadStudentFile, validateSupportFile } from './supabase-storage.js';
import { renderMarkdown } from './markdown.js';

const input = document.querySelector('#messageInput');
const send = document.querySelector('#sendBtn');
const messages = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const attach = document.querySelector('#attachBtn');
const attachmentMenu = document.querySelector('#attachmentMenu');
const pdfInput = document.querySelector('#pdfInput');
const imageInput = document.querySelector('#imageInput');
const filePreview = document.querySelector('#filePreview');
const fileName = document.querySelector('#fileName');
const fileIcon = document.querySelector('#fileIcon');
const fileInfo = document.querySelector('#fileInfo');
const fileThumbnail = document.querySelector('#fileThumbnail');
const uploadNotice = document.querySelector('#uploadNotice');
const actionPicker = document.querySelector('#actionPicker');
const newChat = document.querySelector('#newChat');
let support = null, action = null, currentUser = null, profile = null, conversationId = null, isUntitledConversation = false, uploadRequestId = 0;

function updateComposer() {
  send.disabled = (!input.value.trim() && !support) || support?.status === 'uploading';
  input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}
function updateProfileUI(data) {
  const name = data.fullName || data.firstName || 'Student';
  const subtitle = [data.schoolLevel, data.fieldOfStudy].filter(Boolean).join(' · ');
  const welcomeTitle = welcome?.querySelector('.eyebrow');
  if (welcomeTitle) welcomeTitle.textContent = `Bienvenue, ${data.firstName || name}`;
  document.querySelector('.student-card b').textContent = name;
  document.querySelector('.student-card small').textContent = subtitle || 'Profil étudiant';
  document.querySelector('.student-avatar').textContent = (data.firstName?.[0] || 'S') + (data.lastName?.[0] || '');
}
function clearSupport() {
  // Invalidates an in-flight upload so its delayed response cannot restore a
  // support that the student has just cancelled.
  uploadRequestId += 1;
  if (fileThumbnail.src.startsWith('blob:')) URL.revokeObjectURL(fileThumbnail.src);
  support = null; action = null; pdfInput.value = ''; imageInput.value = '';
  filePreview.hidden = true; fileThumbnail.hidden = true; fileThumbnail.removeAttribute('src'); actionPicker.hidden = true;
  document.querySelectorAll('.action-grid button').forEach(button => button.classList.remove('selected'));
  updateComposer();
}
function scrollToLatest() { messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' }); }
function ensureList() {
  if (welcome.parentElement) welcome.remove();
  let list = messages.querySelector('.message-list');
  if (!list) { list = document.createElement('div'); list.className = 'message-list'; messages.append(list); }
  return list;
}
function appendMessage(role, content, meta = {}) {
  const list = ensureList();
  const message = document.createElement('div');
  message.className = 'message-block ' + role;
  const attachment = meta.attachments?.[0];
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  if (attachment) {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    const icon = document.createElement('span'); icon.textContent = '▧';
    const details = document.createElement('div');
    const name = document.createElement('b'); name.textContent = attachment.fileName || attachment.name || 'Support';
    const size = document.createElement('small'); size.textContent = `${formatFileSize(attachment.fileSize || 0)} · fichier importé`;
    details.append(name, size); chip.append(icon, details); bubble.append(chip);
  }
  if (role === 'assistant') bubble.append(renderMarkdown(content));
  else { const plain = document.createElement('p'); plain.className = 'message-plain'; plain.textContent = content; bubble.append(plain); }
  if (meta.mode) {
    const mode = document.createElement('span');
    mode.className = 'mode-chip'; mode.textContent = `MODE: ${String(meta.mode).toUpperCase()}`;
    bubble.append(mode);
  }
  if (role === 'assistant') { const icon = document.createElement('div'); icon.className = 'bot-logo'; icon.textContent = '✦'; message.append(icon); }
  message.append(bubble);
  list.append(message); scrollToLatest(); return message;
}
function appendTyping() {
  const list = ensureList(); const typing = document.createElement('div');
  typing.className = 'message-block assistant typing';
  typing.innerHTML = '<div class="bot-logo">✦</div><div class="message-bubble"><span class="dots"><i></i><i></i><i></i></span></div>';
  list.append(typing); scrollToLatest(); return typing;
}
function titleFromQuestion(text) {
  const cleaned = text.replace(/^(explique|résume|aide-moi|peux-tu|crée-moi)\s*/i, '').trim();
  return (cleaned || 'Nouvelle discussion').slice(0, 48).replace(/\.$/, '');
}
function modeKey(value) {
  return ({ 'Résumé': 'resume', Explication: 'explication', Exercice: 'exercice', 'Contrôle': 'controle' })[value] || 'explication';
}
async function callApi(path, payload) {
  const response = await authenticatedFetch(currentUser, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Le serveur IA est indisponible. Vérifie qu’il est lancé.');
  return result;
}
async function createConversation(title = 'Nouvelle discussion') {
  const ref = await addDoc(collection(db, 'users', currentUser.uid, 'conversations'), {
    title, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  conversationId = ref.id; isUntitledConversation = title === 'Nouvelle discussion'; await loadConversations(); return ref;
}
async function saveMessage(role, content, meta = {}) {
  if (!conversationId) await createConversation(titleFromQuestion(content));
  if (role === 'user' && isUntitledConversation) {
    await updateDoc(doc(db, 'users', currentUser.uid, 'conversations', conversationId), { title: titleFromQuestion(content) });
    isUntitledConversation = false;
  }
  const messageData = {
    role, content, timestamp: serverTimestamp(),
    ...(meta.mode && { mode: meta.mode }),
    ...(meta.attachments?.length && { attachments: meta.attachments })
  };
  await addDoc(collection(db, 'users', currentUser.uid, 'conversations', conversationId, 'messages'), messageData);
  await updateDoc(doc(db, 'users', currentUser.uid, 'conversations', conversationId), { updatedAt: serverTimestamp() });
}
async function loadConversations() {
  if (!currentUser) return;
  const recent = await getDocs(query(collection(db, 'users', currentUser.uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(8)));
  document.querySelectorAll('.recent-row').forEach(row => row.remove());
  const label = document.querySelector('.recent-label');
  let insertionPoint = label;
  recent.forEach(item => {
    const row = document.createElement('div');
    row.className = 'recent-row';
    const button = document.createElement('button');
    button.className = 'recent'; button.dataset.conversationId = item.id;
    button.textContent = item.data().title || 'Nouvelle discussion';
    button.addEventListener('click', () => loadConversation(item.id));
    const remove = document.createElement('button');
    remove.className = 'delete-conversation';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Supprimer la discussion ${button.textContent}`);
    remove.title = 'Supprimer cette discussion';
    remove.textContent = '×';
    remove.addEventListener('click', () => deleteConversation(item.id, button.textContent));
    row.append(button, remove);
    insertionPoint.insertAdjacentElement('afterend', row);
    insertionPoint = row;
  });
}
function showWelcomeConversation() {
  messages.innerHTML = '';
  messages.append(welcome);
  welcome.hidden = false;
  input.value = '';
  clearSupport();
  conversationId = null;
  isUntitledConversation = false;
  updateComposer();
  messages.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteConversation(id, title) {
  if (!currentUser || !window.confirm(`Supprimer définitivement la discussion « ${title} » ?`)) return;
  try {
    const messagesSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'conversations', id, 'messages'));
    await Promise.all(messagesSnapshot.docs.map(message => deleteDoc(message.ref)));
    await deleteDoc(doc(db, 'users', currentUser.uid, 'conversations', id));
    if (conversationId === id) showWelcomeConversation();
    await loadConversations();
  } catch (error) {
    console.error('Impossible de supprimer la discussion.', error);
    window.alert('La discussion n’a pas pu être supprimée. Vérifie ta connexion puis réessaie.');
  }
}
async function loadConversation(id) {
  conversationId = id; isUntitledConversation = false;
  messages.innerHTML = '';
  const list = document.createElement('div'); list.className = 'message-list'; messages.append(list);
  const snapshot = await getDocs(query(collection(db, 'users', currentUser.uid, 'conversations', id, 'messages'), orderBy('timestamp', 'asc')));
  snapshot.forEach(item => {
    const data = item.data();
    appendMessage(data.role === 'assistant' ? 'assistant' : 'user', data.content || '', data);
  });
}
async function resetConversation() {
  showWelcomeConversation();
  await createConversation();
}
function localReply(text, file, mode) {
  const firstName = profile?.firstName || 'toi';
  if (file && mode === 'summary') return `J’ai bien reçu ${file.name}. Je peux t’en présenter les notions essentielles sous forme de résumé structuré.`;
  if (file && mode === 'exercise') return `Parfait ${firstName}, je peux créer des exercices progressifs à partir de ${file.name}.`;
  if (file && mode === 'quiz') return `Je prépare un mini-contrôle basé sur ${file.name}, avec des explications pour chaque réponse.`;
  if (file) return `J’ai reçu ${file.name}. Je vais t’expliquer les idées importantes avec des mots simples.`;
  if (/examen|révis/i.test(text)) return 'Pour préparer ton examen, commençons par les notions prioritaires, puis alternons fiches, exercices et mini-quiz.';
  if (/exercice/i.test(text)) return 'Je peux te proposer des exercices progressifs et t’accompagner dans la correction. Quel chapitre veux-tu travailler ?';
  return 'Bonne question. Je peux décomposer cette leçon étape par étape et l’adapter à ton niveau.';
}
async function submit() {
  const text = input.value.trim(); if (!text && !support || !currentUser) return;
  const currentSupport = support, currentAction = action;
  const content = text || 'Peux-tu m’aider avec ce support ?';
  const meta = {
    mode: modeKey(currentAction),
    attachments: currentSupport?.attachment ? [currentSupport.attachment] : []
  };
  try {
    if (!conversationId) await createConversation(titleFromQuestion(content));
    appendMessage('user', content, meta);
    input.value = ''; clearSupport(); updateComposer();
    const typing = appendTyping();
    try {
      const result = await callApi('/api/assistant/chat', {
        conversationId, message: content, mode: meta.mode,
        attachments: meta.attachments
      });
      conversationId = result.conversationId || conversationId;
      typing.remove(); appendMessage('assistant', result.message.content, { mode: meta.mode });
      await loadConversations();
    } catch (error) {
      typing.remove(); appendMessage('assistant', error.message || 'Le service IA est indisponible.');
    }
  } catch {
    appendMessage('assistant', 'Je n’ai pas pu enregistrer cette discussion. Vérifie ta connexion et les règles Firestore.');
  }
}

input.addEventListener('input', updateComposer);
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
send.addEventListener('click', submit);
attach.addEventListener('click', () => {
  const shown = !attachmentMenu.hidden; attachmentMenu.hidden = shown; attach.setAttribute('aria-expanded', String(!shown));
});
document.querySelectorAll('.attachment-menu button').forEach(button => button.addEventListener('click', () => {
  attachmentMenu.hidden = true; document.querySelector('#' + button.dataset.type + 'Input').click();
}));
document.addEventListener('click', event => { if (!event.target.closest('.attachment-wrap')) attachmentMenu.hidden = true; });
[pdfInput, imageInput].forEach(element => element.addEventListener('change', async () => {
  const file = element.files[0]; if (!file) return;
  let requestId = 0;
  uploadNotice.hidden = true;
  const issue = validateSupportFile(file);
  if (issue) { uploadNotice.textContent = issue; uploadNotice.hidden = false; element.value = ''; return; }
  try {
    if (!currentUser) throw new Error('Utilisateur non connecté. Veuillez vous reconnecter.');
    if (!conversationId) await createConversation();
    requestId = ++uploadRequestId;
    support = { name: file.name, status: 'uploading' };
    fileName.textContent = file.name; fileIcon.textContent = element === pdfInput ? '▧' : '▣';
    fileInfo.textContent = `Upload en cours… ${formatFileSize(file.size)}`;
    filePreview.hidden = false; actionPicker.hidden = true;
    if (file.type.startsWith('image/')) {
      fileThumbnail.src = URL.createObjectURL(file); fileThumbnail.hidden = false;
    } else fileThumbnail.hidden = true;
    updateComposer();
    const attachment = await uploadStudentFile({
      file, conversationId, firebaseToken: await currentUser.getIdToken()
    });
    if (requestId !== uploadRequestId) return;
    support = { name: file.name, status: 'uploaded', attachment };
    fileInfo.textContent = `${formatFileSize(file.size)} · Prêt à être utilisé`;
    actionPicker.hidden = false; updateComposer();
  } catch (error) {
    if (requestId && requestId !== uploadRequestId) return;
    clearSupport(); uploadNotice.textContent = error.message || 'L’envoi du fichier a échoué. Réessayez.';
    uploadNotice.hidden = false;
  }
}));
document.querySelector('#removeFile').addEventListener('click', clearSupport);
document.querySelectorAll('.action-grid button').forEach(button => button.addEventListener('click', () => {
  action = button.dataset.action;
  document.querySelectorAll('.action-grid button').forEach(item => item.classList.toggle('selected', item === button));
  updateComposer();
}));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.prompt; updateComposer(); input.focus();
}));
newChat.addEventListener('click', () => resetConversation().catch(() => { conversationId = null; }));

await authReady;
onAuthStateChanged(auth, async user => {
  if (!user) return;
  currentUser = user;
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  if (snapshot.exists()) { profile = snapshot.data(); updateProfileUI(profile); }
  await loadConversations();
});
updateComposer();
