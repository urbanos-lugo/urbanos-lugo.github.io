import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import type { StorageKey } from './utils/storage';

// A deploy under an open page: every rebuild renames the hashed chunks and the service
// worker drops the old names, so a page opened before a deploy fetched a file that no
// longer exists. Vite raises this event for exactly that case; reload once, not in a loop.
window.addEventListener('vite:preloadError', (event) => {
  const key: StorageKey = 'urbanos-lugo-reloaded-for';
  const target = location.href;
  try {
    if (sessionStorage.getItem(key) === target) return; // already tried; let it surface
    sessionStorage.setItem(key, target);
  } catch {
    // no storage: once is not enforceable, reload anyway
  }
  event.preventDefault();
  location.reload();
});

// Every face of both families now, not when a screen first asks for one: until a face loads,
// its text is laid out in the fallback, so on Chrome 157 the line list and the favourites
// header drew rows a line taller and moved them under the finger once it arrived. Two files,
// the ones the service worker precaches anyway; a failure leaves the fallback, as before.
document.fonts.forEach((face) => void face.load().catch(() => {}));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
