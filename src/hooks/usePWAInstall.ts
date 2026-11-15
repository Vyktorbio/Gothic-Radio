import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Capture the one-use browser prompt before the installation dialog is opened.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let state = { isInstallable: false, isInstalled: false, isInstalling: false, isIOS: false, message: '' };
const listeners = new Set<() => void>();
const update = (patch: Partial<typeof state>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

if (typeof window !== 'undefined') {
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const navigator = window.navigator as Navigator & { standalone?: boolean };
  state.isInstalled = displayMode.matches || navigator.standalone === true;
  state.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    update({ isInstallable: true, message: '' });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    update({ isInstalled: true, isInstallable: false, isInstalling: false, message: '' });
  });
  displayMode.addEventListener('change', () => {
    update({ isInstalled: displayMode.matches || navigator.standalone === true });
  });
}

async function install(): Promise<boolean> {
  if (!deferredPrompt || state.isInstalling) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  update({ isInstallable: false, isInstalling: true, message: '' });
  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (!state.isInstalled) {
      update({ message: outcome === 'accepted'
        ? 'Instalação solicitada. Aguarde a confirmação do navegador.'
        : 'Instalação cancelada. Você pode continuar ouvindo pelo navegador.' });
    }
    return outcome === 'accepted';
  } catch {
    update({ message: 'Não foi possível abrir a instalação. Use as instruções abaixo ou o menu do navegador.' });
    return false;
  } finally {
    update({ isInstalling: false });
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => state;
export function usePWAInstall() {
  return { ...useSyncExternalStore(subscribe, getSnapshot, getSnapshot), install };
}
