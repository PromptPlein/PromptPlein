import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { installAutoGrowTextareas } from './lib/autoGrowTextareas';
import { installViewportWatch } from './lib/viewportWatch';
import './index.css';

// Vóór de eerste render: zie de uitleg in autoGrowTextareas.
installAutoGrowTextareas();
installViewportWatch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AccessibilityProvider>
        <AuthProvider>
          <App />
          <Toaster
            position="bottom-right"
            // Boven de onderbalk van de telefoon.
            containerStyle={{ bottom: 'calc(var(--onderbalk) + 1rem)' }}
            toastOptions={{
              style: {
                maxWidth: 'calc(100vw - 2rem)',
                borderRadius: '10px',
                fontSize: '0.875rem',
                background: 'var(--toast-bg)',
                color: 'var(--toast-fg)',
              },
            }}
          />
        </AuthProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
