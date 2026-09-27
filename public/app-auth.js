import { auth, authReady, db, isFirebaseConfigured } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

if (!isFirebaseConfigured) {
  window.location.replace('auth.html');
} else {
  await authReady;
  onAuthStateChanged(auth, async user => {
    if (!user) return window.location.replace('auth.html');
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));
      if (!snapshot.exists() || !snapshot.data().profileCompleted) return window.location.replace('profile.html');
    } catch {
      window.location.replace('auth.html');
    }
  });
}
document.querySelector('#logoutButton')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.replace('auth.html');
});
