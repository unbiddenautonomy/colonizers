import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ThemeStyles } from './theme/themes.tsx';
import { LookStyles } from './theme/looks.tsx';
import { MotionStyles } from './ui/motion.tsx';
import { ErrorBoundary } from './ui/ErrorScreen.tsx';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ThemeStyles />
    <LookStyles />
    <MotionStyles />
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// The service worker makes the app installable and work offline. Only in
// real builds, so it never caches files during development.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
