import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useCardParser } from '../hooks/useCardParser';
import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { getCardSummary } from '../utils/cardFields';
import {
  Upload,
  FileJson,
  BookOpen,
  MessageSquare,
  Code,
  Layers,
  X,
} from 'lucide-react';

export default function FileUpload() {
  const { parseCardFile } = useCardParser();
  const { card, cardFileName, clearCard } = useStore();
  const t = useT();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        parseCardFile(acceptedFiles[0]);
      }
    },
    [parseCardFile]
  );

  const { getRootProps, getInputProps, isDragActive, isDragAccept } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    multiple: false,
  });

  const summary = card ? getCardSummary(card) : null;

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">
          <FileJson size={16} style={{ color: 'var(--accent-secondary)' }} />
          {t.characterCard}
        </span>
        {card && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={(e) => {
              e.stopPropagation();
              clearCard();
            }}
            title={t.clearCard}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="section-body">
        {!card ? (
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${isDragAccept ? 'dropzone-accepted' : ''}`}
          >
            <input {...getInputProps()} />
            <Upload
              size={32}
              style={{
                color: isDragActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                marginBottom: '8px',
              }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>
              {isDragActive ? '...' : t.dragDropCard}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {t.orClickBrowse}
            </p>
          </div>
        ) : (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Card Name */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: 'white',
                  flexShrink: 0,
                }}
              >
                {(summary?.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summary?.name}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {cardFileName} · {t.specVersion}: {summary?.spec}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
              }}
            >
              <StatItem icon={<BookOpen size={13} />} label={t.lorebookEntries} value={`${summary?.lorebookCount || 0}`} />
              <StatItem icon={<MessageSquare size={13} />} label={t.altGreetings} value={`${summary?.altGreetingsCount || 0}`} />
              <StatItem icon={<Code size={13} />} label={t.regexScripts} value={`${summary?.regexCount || 0}`} />
              <StatItem icon={<Layers size={13} />} label={t.depthPrompt} value={summary?.hasDepthPrompt ? '✓' : '—'} />
            </div>

            {/* Replace */}
            <div {...getRootProps()} style={{ cursor: 'pointer' }}>
              <input {...getInputProps()} />
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: '0.75rem' }}>
                <Upload size={12} /> {t.dragDropCard}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.75rem',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
