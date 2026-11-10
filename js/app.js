import { defineComponents } from './components.js';
import { store } from './store.js';

defineComponents();

// Daily reset check every 30s (also happens on tap/create)
setInterval(() => store.checkDailyReset(), 30_000);

// Prevent context menu on long tap (mobile)
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('giant-emotion-button')) e.preventDefault();
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Install prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
