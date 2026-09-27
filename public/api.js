import { API_BASE_URL } from './firebase-config.js';

export async function authenticatedFetch(user, path, options = {}) {
  if (!API_BASE_URL) throw new Error('URL du backend de production non configurée.');
  if (!user) throw new Error('Connecte-toi pour continuer.');

  const send = async forceRefresh => {
    const token = await user.getIdToken(forceRefresh);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  };

  const response = await send(false);
  if (response.status !== 401) return response;

  // A cached ID token can occasionally be rejected after a long-lived session.
  // Refresh it once and retry the same request before asking the student to sign in.
  const retriedResponse = await send(true);
  if (retriedResponse.status === 401) {
    const result = await retriedResponse.clone().json().catch(() => ({}));
    console.error('[api] Firebase auth rejected the refreshed session:', result.error?.message || '401 Unauthorized');
  }
  return retriedResponse;
}
