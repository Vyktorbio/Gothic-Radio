import { useRef, useState } from 'react';
import { Check, Download, Monitor, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

type Platform = 'android' | 'ios' | 'desktop';
const platformLabels: Record<Platform, string> = { android: 'Android', ios: 'iPhone / iPad', desktop: 'Computador' };
const instructions: Record<Platform, string[]> = {
  android: [
    'Abra esta página no Chrome ou Samsung Internet.',
    'Toque em “Instalar app”. Se o convite não aparecer, abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”.',
    'Confirme. O ícone da Gothic Rádio ficará disponível na tela inicial ou na lista de aplicativos.',
  ],
  ios: [
    'Abra esta página no Safari.',
    'Toque em Compartilhar e depois em “Adicionar à Tela de Início”.',
    'Se aparecer “Abrir como App”, mantenha ativado. Toque em “Adicionar”.',
  ],
  desktop: [
    'Abra esta página no Chrome ou Microsoft Edge.',
    'Clique em “Instalar app” ou procure a opção de instalação na barra de endereço ou no menu do navegador.',
    'Confirme para abrir a Gothic Rádio em uma janela própria.',
  ],
};

export function InstallPanel() {
  const { isInstallable, isInstalled, isInstalling, isIOS, message, install } = usePWAInstall();
  const [platform, setPlatform] = useState<Platform>(() => isIOS ? 'ios'
    : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop');
  const [showGuide, setShowGuide] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);
  function openGuide() {
    setShowGuide(true);
    requestAnimationFrame(() => guideRef.current?.focus());
  }
  return (
    <div className="install-panel">
      {isInstalled ? (
        <div className="install-success" role="status"><Check size={18} /> O aplicativo já está instalado neste navegador.</div>
      ) : (
        <button type="button" className="install-primary" disabled={isInstalling}
          onClick={() => isInstallable ? void install() : openGuide()}>
          <Download size={19} aria-hidden="true" />
          {isInstalling ? 'Aguardando o navegador…' : isInstallable ? 'Instalar app' : 'Como instalar no meu dispositivo'}
        </button>
      )}
      <p className="install-feedback" role="status" aria-live="polite">{message}</p>
      {!isInstalled && (
        <div className="install-guide">
          <button type="button" className="install-guide-toggle" onClick={() => setShowGuide(!showGuide)}
            aria-expanded={showGuide} aria-controls="installation-guide">
            {showGuide ? 'Ocultar instruções' : 'Ver instruções de instalação'}<span aria-hidden="true">{showGuide ? '−' : '+'}</span>
          </button>
          {showGuide && (
            <div id="installation-guide" ref={guideRef} tabIndex={-1} className="install-guide-content">
              <div className="install-platforms" role="group" aria-label="Seu dispositivo">
                {(Object.keys(platformLabels) as Platform[]).map((key) => (
                  <button key={key} type="button" aria-pressed={platform === key} onClick={() => setPlatform(key)}>
                    {key === 'desktop' ? <Monitor size={14} aria-hidden="true" /> : <Smartphone size={14} aria-hidden="true" />}
                    {platformLabels[key]}
                  </button>
                ))}
              </div>
              <ol>{instructions[platform].map((step) => <li key={step}>{step}</li>)}</ol>
              <p className="install-browser-note">Abriu pelo WhatsApp, Instagram ou ChatGPT? Use “Abrir no navegador” para instalar.</p>
            </div>
          )}
        </div>
      )}
      <p className="install-footnote">Internet necessária para entrar e carregar novas músicas.</p>
    </div>
  );
}
