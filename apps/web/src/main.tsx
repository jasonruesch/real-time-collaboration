import './styles/app.css';
import { AppRouter } from '@evolonix/react-router-next/vite-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
