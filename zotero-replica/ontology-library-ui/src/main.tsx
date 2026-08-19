import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './core/App';
import { isVsCodeHost, installVsCodeHost } from './host/vscode';
import { installWebHost } from './host/web';

if (isVsCodeHost()) {
  installVsCodeHost();
} else {
  installWebHost();
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);