import { auth, authReady, isFirebaseConfigured } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const startLinks = document.querySelectorAll('.nav-cta, .hero-actions .primary, .final-cta .primary');
let currentUser = null;
if (isFirebaseConfigured) {
  await authReady;
  onAuthStateChanged(auth, user => { currentUser = user; });
}
startLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  window.location.href = currentUser ? 'assistant.html' : 'auth.html';
}));
