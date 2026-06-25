import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import {toast} from './components/Toast';
import './index.css';

// ── Global safety net ───────────────────────────────────────────────────────
// Catches any uncaught async error (failed fetches, rejected promises) that an
// individual try/catch might miss, and shows ONE friendly toast instead of
// letting a raw/technical error surface or fail silently.
let lastErrorToast = 0;
function notifyGenericError() {
  const now = Date.now();
  if (now - lastErrorToast < 5000) return; // throttle to avoid spam
  lastErrorToast = now;
  try {
    toast.error('Something went wrong. Please try again.', 'Error');
  } catch {
    /* ignore */
  }
}

const BENIGN = /AbortError|aborted|ResizeObserver|Load failed|NetworkError when attempting|cancell?ed/i;

window.addEventListener('unhandledrejection', (e) => {
  const reason: any = e?.reason;
  const msg = String(reason?.message ?? reason ?? '');
  if (BENIGN.test(msg)) return; // ignore benign/expected rejections
  console.error('Unhandled promise rejection:', reason);
  notifyGenericError();
});

window.addEventListener('error', (e) => {
  const msg = String(e?.message ?? '');
  // React render errors are handled by ErrorBoundary; just hush benign noise.
  if (BENIGN.test(msg)) e.preventDefault?.();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
