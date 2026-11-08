import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { installAutoGrowTextareas } from './lib/autoGrowTextareas';
import { installViewportWatch } from './lib/viewportWatch';

import '@nldd/design-system/styles';
import '@nldd/design-system/shell';
import './index.css';

// Vóór de eerste render: zie de uitleg in autoGrowTextareas.
installAutoGrowTextareas();
installViewportWatch();

// De app komt in de nldd-shell uit index.html: die staat direct in de body en
// krijgt zo de volle hoogte (de panelen van de chat scrollen zelf).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AccessibilityProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
