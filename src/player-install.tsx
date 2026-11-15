import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PWAInstallButton, PWAInstallModal } from './components/PWAInstallButton';
import './player-mobile.css';

function PlayerInstall() {
  const [open, setOpen] = useState(false);
  return <><PWAInstallButton onOpenModal={() => setOpen(true)} /><PWAInstallModal isOpen={open} onClose={() => setOpen(false)} /></>;
}
createRoot(document.getElementById('install-control')!).render(<PlayerInstall />);
