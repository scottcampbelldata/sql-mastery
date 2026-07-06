import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './theme/tokens.css';
import './theme/global.css';
import { initTheme } from './theme/theme.js';
import { startSync } from './lib/sync.js';

initTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

// Cross-device progress sync (no-op unless a sync code is set).
startSync();
