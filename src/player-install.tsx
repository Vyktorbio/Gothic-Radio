import { googleSignIn } from './services/auth';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PWAInstallButton, PWAInstallModal } from './components/PWAInstallButton';
import './player-mobile.css';

function PlayerInstall() {
  const [open, setOpen] = useState(false);
  return <><PWAInstallButton onOpenModal={() => setOpen(true)} /><PWAInstallModal isOpen={open} onClose={() => setOpen(false)} /></>;
}
createRoot(document.getElementById('install-control')!).render(<PlayerInstall />);

// Use the existing Firebase provider directly; no AI Studio server is needed.
declare global {
  interface Window {
    gothicRadioSignIn?: (email?: string) => Promise<{ accessToken: string; email: string } | null>;
  }
}
window.gothicRadioSignIn = async (email) => {
  const result = await googleSignIn(email);
  return result ? { accessToken: result.accessToken, email: result.user.email || '' } : null;
};
