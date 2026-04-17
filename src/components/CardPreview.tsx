import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export default function CardPreview() {
  const { card } = useStore();
  const t = useT();
  if (!card) return null;

  return (
    <div className="card fade-in" style={{ padding: '20px' }}>
      <h3
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Eye size={18} style={{ color: 'var(--accent-secondary)' }} />
        {t.cardPreview}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <PreviewField label="Name" value={card.data?.name || card.name} />
        <PreviewField label="Description" value={card.data?.description || card.description} truncate />
        <PreviewField label="Personality" value={card.data?.personality || card.personality} truncate />
        <PreviewField label="Scenario" value={card.data?.scenario || card.scenario} truncate />
        <PreviewField label="First Message" value={card.data?.first_mes || card.first_mes} truncate />
        {card.data?.system_prompt && <PreviewField label="System Prompt" value={card.data.system_prompt} truncate />}
        {card.data?.alternate_greetings && card.data.alternate_greetings.length > 0 && (
          <PreviewField
            label={`Alt Greetings (${card.data.alternate_greetings.length})`}
            value={card.data.alternate_greetings[0]}
            truncate
          />
        )}
      </div>
    </div>
  );
}

function PreviewField({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value?: string;
  truncate?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!value || value.trim() === '') return null;

  const isLong = truncate && value.length > 200;
  const displayText = isLong && !expanded ? value.slice(0, 200) + '...' : value;

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--bg-primary)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--accent-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {label}
        {isLong && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: '0.65rem', padding: '1px 4px' }}
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            {expanded ? 'Less' : 'More'}
          </button>
        )}
      </div>
      <div
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          maxHeight: expanded ? 'none' : '120px',
          overflow: 'hidden',
        }}
      >
        {displayText}
      </div>
    </div>
  );
}
