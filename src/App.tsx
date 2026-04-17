import { useEffect } from 'react';
import ProxyConfig from './components/ProxyConfig';
import FileUpload from './components/FileUpload';
import TranslateConfig from './components/TranslateConfig';
import CardPreview from './components/CardPreview';
import TranslationProgress from './components/TranslationProgress';
import FieldEditor from './components/FieldEditor';
import ExportPanel from './components/ExportPanel';
import { useStore } from './store';
import { useT } from './i18n/useLocale';
import type { Locale } from './i18n/translations';
import { Languages, X, Globe } from 'lucide-react';

export default function App() {
  const { toasts, removeToast, card, locale, setLocale, loadStateFromIDB } = useStore();
  const t = useT();

  useEffect(() => {
    loadStateFromIDB();
  }, [loadStateFromIDB]);

  return (
    <div className="app-layout">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        {/* Logo + Locale switcher */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Languages size={18} color="white" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em' }}>
              {t.appTitle}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              {t.appSubtitle}
            </div>
          </div>
          {/* Locale switcher */}
          <LocaleSwitcher locale={locale} setLocale={setLocale} />
        </div>

        {/* Sidebar sections */}
        <ProxyConfig />
        <FileUpload />
        <TranslateConfig />
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {!card ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '60vh',
              textAlign: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'var(--bg-secondary)',
                border: '2px dashed var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Languages size={32} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {t.noCardTitle}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '400px' }}>
                {t.noCardDesc}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '24px',
                marginTop: '16px',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <Step num={1} text={t.stepConfigureApi} />
              <Step num={2} text={t.stepUploadCard} />
              <Step num={3} text={t.stepTranslate} />
              <Step num={4} text={t.stepExport} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' }}>
            <CardPreview />
            <TranslationProgress />
            <FieldEditor />
            <ExportPanel />
          </div>
        )}

        {/* Footer */}
        <footer
          style={{
            marginTop: '40px',
            padding: '16px 0',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>{t.appTitle}</span>
          <span>·</span>
          <span>{t.appFooter}</span>
        </footer>
      </main>

      {/* ─── Toasts ─── */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.level}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '0',
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
      >
        {num}
      </div>
      <span>{text}</span>
    </div>
  );
}

function LocaleSwitcher({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <button
        onClick={() => setLocale('en')}
        style={{
          padding: '4px 8px',
          fontSize: '0.65rem',
          fontWeight: locale === 'en' ? 700 : 400,
          background: locale === 'en' ? 'var(--accent-primary)' : 'transparent',
          color: locale === 'en' ? 'white' : 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        EN
      </button>
      <button
        onClick={() => setLocale('vi')}
        style={{
          padding: '4px 8px',
          fontSize: '0.65rem',
          fontWeight: locale === 'vi' ? 700 : 400,
          background: locale === 'vi' ? 'var(--accent-primary)' : 'transparent',
          color: locale === 'vi' ? 'white' : 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        VI
      </button>
    </div>
  );
}
