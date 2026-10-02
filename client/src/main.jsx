import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/roboto-flex/wdth.css';
import '@fontsource-variable/martian-mono/standard.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/pages.css';
import './styles/panels.css';
import './styles/features.css';
import './styles/studio.css';
import './styles/legacy.css';
import './store/installStore'; // must listen before Chrome fires beforeinstallprompt
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
