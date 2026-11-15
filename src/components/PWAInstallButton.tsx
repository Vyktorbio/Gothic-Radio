import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { InstallPanel } from './InstallPanel';
import '../install.css';

export function PWAInstallButton({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <button type="button" onClick={onOpenModal}
      className="radio-install-button">
      Instalar
    </button>
  );
}

export function PWAInstallModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);
  return (
    <dialog ref={dialogRef} className="install-dialog" aria-labelledby="install-dialog-title" onCancel={onClose} onClose={onClose}>
      <div className="install-dialog-heading">
        <h2 id="install-dialog-title">Instalar Gothic Rádio</h2>
        <button type="button" onClick={onClose} aria-label="Fechar instalação" className="install-close"><X size={22} /></button>
      </div>
      <InstallPanel />
    </dialog>
  );
}

// Retained compatibility for the original React source player.
export function PWAExportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; tracks?: unknown[] }) {
  return <PWAInstallModal isOpen={isOpen} onClose={onClose} />;
}
