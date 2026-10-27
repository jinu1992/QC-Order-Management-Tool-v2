
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PartnerPortal from './components/PartnerPortal';
import { networkInterceptor } from './services/networkInterceptor';

// /partner is the self-ship partner portal (Urvi Ent): its own login and none of the internal app
const isPartnerPortal = window.location.pathname === '/partner' || window.location.pathname.startsWith('/partner/');

// Initialize network interception before rendering (internal app's Logs page)
if (!isPartnerPortal) networkInterceptor.init();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isPartnerPortal ? <PartnerPortal /> : <App />}
  </React.StrictMode>
);
