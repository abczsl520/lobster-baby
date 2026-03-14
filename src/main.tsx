import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
