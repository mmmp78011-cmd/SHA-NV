// Frontend statique : sélectionne l’API selon l’hôte qui sert la page.
const localApiHosts = ['localhost', '127.0.0.1'];
const isLocalFrontend = localApiHosts.includes(window.location.hostname);

window.__API_BASE_URL__ = isLocalFrontend
  ? 'http://localhost:3000'
  : 'https://debian-reader-katrina-california.trycloudflare.com';
