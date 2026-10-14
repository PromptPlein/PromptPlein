import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { installAutoGrowTextareas } from './lib/autoGrowTextareas';
import './index.css';

// Vóór de eerste render: zie de uitleg in autoGrowTextareas.
installAutoGrowTextareas();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                borderRadius: '10px',
                fontSize: '14px',
                background: 'var(--toast-bg)',
                color: 'var(--toast-fg)',
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
