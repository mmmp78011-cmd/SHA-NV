import { auth, authReady, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const form = document.querySelector('#profile-form');
const message = document.querySelector('#form-message');
const saveButton = document.querySelector('#saveButton');
const saveLabel = document.querySelector('#saveLabel');
const spinner = document.querySelector('.spinner');
const field = document.querySelector('#fieldOfStudy');
const level = document.querySelector('#schoolLevel');
const otherFieldWrap = document.querySelector('#otherFieldWrap');
const otherLevelWrap = document.querySelector('#otherLevelWrap');
let currentUser = null;

function showMessage(text) { message.textContent = text; message.hidden = false; }
function toggleOther(select, wrap) {
  wrap.hidden = select.value !== 'other';
  wrap.querySelector('input').required = select.value === 'other';
}
field.addEventListener('change', () => toggleOther(field, otherFieldWrap));
level.addEventListener('change', () => toggleOther(level, otherLevelWrap));

await authReady;
onAuthStateChanged(auth, user => {
  if (!user) window.location.replace('auth.html');
  else currentUser = user;
});
document.querySelector('#logoutButton').addEventListener('click', async () => {
  await signOut(auth);
  window.location.replace('auth.html');
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  message.hidden = true;
  if (!currentUser) return;
  const firstName = document.querySelector('#firstName').value.trim();
  const lastName = document.querySelector('#lastName').value.trim();
  const age = Number(document.querySelector('#age').value);
  const fieldOfStudy = field.value === 'other' ? document.querySelector('#otherField').value.trim() : field.value;
  const schoolLevel = level.value === 'other' ? document.querySelector('#otherLevel').value.trim() : level.value;
  const schoolName = document.querySelector('#schoolName').value.trim();
  if (!firstName || !lastName || !schoolName || !fieldOfStudy || !schoolLevel || !Number.isInteger(age) || age < 5 || age > 120) {
    return showMessage('Complète tous les champs avec des informations valides.');
  }
  saveButton.disabled = true; spinner.hidden = false; saveLabel.textContent = 'Enregistrement de ton profil…';
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      firstName, lastName, fullName: `${firstName} ${lastName}`, age, fieldOfStudy, schoolName, schoolLevel,
      email: currentUser.email, profileCompleted: true, updatedAt: serverTimestamp(), createdAt: serverTimestamp()
    }, { merge: true });
    await Promise.all([
      setDoc(doc(db, 'users', currentUser.uid, 'memory', 'default'), {
        learningGoals: [], studiedSubjects: [], difficultTopics: [], masteredTopics: [], preferredExplanationStyle: null, lastUpdated: serverTimestamp()
      }, { merge: true }),
      setDoc(doc(db, 'users', currentUser.uid, 'progress', 'overview'), {
        subjects: [], topics: [], completedExercises: [], weakTopics: [], strongTopics: [], lastUpdated: serverTimestamp()
      }, { merge: true })
    ]);
    await updateProfile(currentUser, { displayName: firstName });
    window.location.replace('assistant.html');
  } catch (error) {
    console.error('Profile save failed:', error);
    showMessage(error.code === 'permission-denied'
      ? 'Firestore a refusé l’accès. Publie les règles de firestore.rules dans la console Firebase.'
      : `Impossible d’enregistrer ton profil (${error.code || 'erreur inconnue'}).`);
    saveButton.disabled = false; spinner.hidden = true; saveLabel.textContent = 'Continuer vers mon assistant';
  }
});
