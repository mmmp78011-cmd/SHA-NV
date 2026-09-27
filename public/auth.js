import { auth, authReady, db, isFirebaseConfigured } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const form = document.querySelector('#auth-form');
const fullNameField = document.querySelector('.full-name-field');
const confirmField = document.querySelector('.confirm-password-field');
const fullName = document.querySelector('#fullName');
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const confirmPassword = document.querySelector('#confirmPassword');
const title = document.querySelector('#auth-title');
const subtitle = document.querySelector('#auth-subtitle');
const submit = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const spinner = document.querySelector('.spinner');
const switchMode = document.querySelector('#switch-mode');
const switchText = document.querySelector('#auth-switch');
const message = document.querySelector('#form-message');
let isRegister = false;
let submitting = false;

function showMessage(text) { message.textContent = text; message.hidden = false; }
function clearMessage() { message.hidden = true; message.textContent = ''; }
function setLoading(loading) {
  submitting = loading; submit.disabled = loading; spinner.hidden = !loading;
  submitLabel.textContent = loading ? (isRegister ? 'Création du compte…' : 'Connexion…') : (isRegister ? 'Créer un compte' : 'Se connecter');
}
function setMode(register) {
  isRegister = register; form.reset(); clearMessage();
  fullNameField.hidden = !register; confirmField.hidden = !register;
  fullName.required = register; confirmPassword.required = register;
  password.autocomplete = register ? 'new-password' : 'current-password';
  title.textContent = register ? 'Crée ton compte' : 'Ravi de te revoir';
  subtitle.textContent = register ? 'Commence ton parcours d’apprentissage personnalisé.' : 'Connecte-toi pour reprendre ton apprentissage.';
  submitLabel.textContent = register ? 'Créer un compte' : 'Se connecter';
  switchText.childNodes[0].textContent = register ? 'Tu as déjà un compte ? ' : 'Tu n’as pas de compte ? ';
  switchMode.textContent = register ? 'Se connecter' : 'Créer un compte';
}
function validate() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return 'Saisis une adresse e-mail valide.';
  if (password.value.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (isRegister && !fullName.value.trim()) return 'Saisis ton nom complet.';
  if (isRegister && password.value !== confirmPassword.value) return 'Les mots de passe ne correspondent pas.';
  return '';
}
function firebaseMessage(error) {
  const messages = {
    'auth/email-already-in-use': 'Cette adresse e-mail est déjà utilisée.',
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect.',
    'auth/invalid-email': 'Saisis une adresse e-mail valide.',
    'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard.',
    'auth/operation-not-allowed': 'La connexion par e-mail et mot de passe n’est pas activée dans Firebase Authentication.',
    'auth/network-request-failed': 'Firebase est inaccessible. Vérifie ta connexion ou le blocage du navigateur.',
    'auth/api-key-not-valid': 'La clé API Firebase est invalide. Vérifie firebase-config.js.',
    'permission-denied': 'Firestore a refusé l’accès. Publie les règles de firestore.rules dans la console Firebase.',
    'unavailable': 'Firestore est momentanément indisponible. Réessaie.'
  };
  return messages[error.code] || `Impossible de continuer (${error.code || 'erreur Firebase inconnue'}). Vérifie la console du navigateur.`;
}
async function routeUser(user) {
  const profile = await getDoc(doc(db, 'users', user.uid));
  window.location.replace(profile.exists() && profile.data().profileCompleted ? 'assistant.html' : 'profile.html');
}

switchMode.addEventListener('click', () => setMode(!isRegister));
form.addEventListener('submit', async event => {
  event.preventDefault(); clearMessage();
  const issue = validate(); if (issue) return showMessage(issue);
  if (!isFirebaseConfigured) return showMessage('Firebase n’est pas encore configuré.');
  setLoading(true);
  try {
    let user;
    if (isRegister) {
      const credential = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
      user = credential.user;
      await setDoc(doc(db, 'users', user.uid), {
        fullName: fullName.value.trim(), email: user.email, profileCompleted: false,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      user = (await signInWithEmailAndPassword(auth, email.value.trim(), password.value)).user;
    }
    await routeUser(user);
  } catch (error) {
    console.error('Authentication flow failed:', error);
    showMessage(firebaseMessage(error)); setLoading(false);
  }
});

await authReady;
onAuthStateChanged(auth, user => {
  if (user && !submitting) routeUser(user).catch(() => showMessage('Impossible de charger ton profil. Réessaie.'));
});
