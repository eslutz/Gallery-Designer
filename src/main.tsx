import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DEFAULT_APPLICATION_THEME } from './lib/applicationTheme';
import './styles.css';

document.documentElement.dataset.palette = DEFAULT_APPLICATION_THEME;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
