import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { useT } from '../i18n/useLocale';
import type { FieldGroup } from '../types/card';
import { RotateCcw, AlertTriangle, CheckCircle2, Clock, ArrowLeftRight, BarChart3, Ban } from 'lucide-react';

const TAB_IDS: (FieldGroup | 'all')[] = [
  'all', 'core', 'messages', 'lorebook', 'lorebook_keys', 'system', 'creator', 'regex', 'depth_prompt', 'tavern_helper',
];

function useTabLabels() {
  const t = useT();
  const map: Record<string, string> = {
    all: t.all,
    core: 'Core',
    messages: t.groupMessages.split(' ')[0],
    lorebook: 'Lorebook',
    lorebook_keys: 'Keys',
    system: 'System',
    creator: 'Creator',
    regex: 'Regex',
    depth_prompt: 'Depth',
    tavern_helper: 'TavernHelper',
  };
  return map;
}

/** Compute char ratio indicator */
function CharRatio({ original, translated }: { original: string; translated: string }) {
  if (!translated) return null;
  const ratio = translated.length / Math.max(original.length, 1);
  const pct = Math.round(ratio * 100);

  // Color based on ratio health
  let color = 'var(--accent-success)';
  let label = 'OK';
  if (ratio < 0.3) { color = 'var(--accent-danger)'; label = 'Short'; }
  else if (ratio < 0.6) { color = 'var(--accent-warning)'; label = 'Low'; }
  else if (ratio > 2.5) { color = 'var(--accent-warning)'; label = 'Long'; }

  return (
    <span
      title={`${translated.length}/${original.length} chars (${pct}%)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.6rem',
        padding: '1px 5px',
        borderRadius: 'var(--radius-sm)',
        background: `${color}15`,
        color,
        fontWeight: 600,
        fontFamily: 'monospace',
      }}
    >
      <BarChart3 size={9} />
      {pct}%
      {ratio < 0.3 && <span style={{ fontSize: '0.55rem' }}>⚠ {label}</span>}
    </span>
  );
}

/** Simple inline diff view — highlights additions/deletions */
function DiffView({ original, translated }: { original: string; translated: string }) {
  if (!translated) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>No translation</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', lineHeight: 1.5 }}>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', top: '-1px', left: 0,
          fontSize: '0.55rem', fontWeight: 700, color: 'var(--accent-danger)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Original
        </span>
        <div
          style={{
            padding: '14px 8px 6px',
            background: 'rgba(255,82,82,0.04)',
            borderLeft: '2px solid var(--accent-danger)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '200px',
            overflowY: 'auto',
            color: 'var(--text-secondary)',
          }}
        >
          {original.length > 800 ? original.slice(0, 800) + '...' : original}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', top: '-1px', left: 0,
          fontSize: '0.55rem', fontWeight: 700, color: 'var(--accent-success)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Translated
        </span>
        <div
          style={{
            padding: '14px 8px 6px',
            background: 'rgba(76,175,80,0.04)',
            borderLeft: '2px solid var(--accent-success)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '200px',
            overflowY: 'auto',
            color: 'var(--text-primary)',
          }}
        >
          {translated.length > 800 ? translated.slice(0, 800) + '...' : translated}
        </div>
      </div>
    </div>
  );
}

export default function FieldEditor() {
  const { fields, updateField, phase } = useStore();
  const { retranslateField } = useTranslation();
  const t = useT();
  const tabLabels = useTabLabels();
  const [activeTab, setActiveTab] = useState<FieldGroup | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'diff'>('table');

  const filteredFields = useMemo(() => {
    if (activeTab === 'all') return fields;
    return fields.filter((f) => f.group === activeTab);
  }, [fields, activeTab]);

  // Count fields per tab
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: fields.length };
    for (const f of fields) {
      counts[f.group] = (counts[f.group] || 0) + 1;
    }
    return counts;
  }, [fields]);

  if (fields.length === 0) return null;

  return (
    <div className="card fade-in" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
            {t.fieldEditor}
          </h3>
          {/* View mode toggle */}
          <div style={{
            display: 'flex', gap: '2px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
            border: '1px solid var(--border-subtle)',
          }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '3px 8px',
                fontSize: '0.7rem',
                fontWeight: viewMode === 'table' ? 600 : 400,
                background: viewMode === 'table' ? 'rgba(124,106,240,0.12)' : 'transparent',
                color: viewMode === 'table' ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('diff')}
              style={{
                padding: '3px 8px',
                fontSize: '0.7rem',
                fontWeight: viewMode === 'diff' ? 600 : 400,
                background: viewMode === 'diff' ? 'rgba(124,106,240,0.12)' : 'transparent',
                color: viewMode === 'diff' ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <ArrowLeftRight size={11} />
              Diff
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ overflowX: 'auto' }}>
          {TAB_IDS.map((tabId) => {
            const count = tabCounts[tabId] || 0;
            if (tabId !== 'all' && count === 0) return null;
            return (
              <button
                key={tabId}
                className={`tab ${activeTab === tabId ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tabId)}
              >
                {tabLabels[tabId] || tabId}
                {count > 0 && (
                  <span style={{ opacity: 0.7, marginLeft: '4px', fontSize: '0.7rem' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Diff View */}
      {viewMode === 'diff' && (
        <div style={{ padding: '12px 20px', maxHeight: '700px', overflowY: 'auto' }}>
          {filteredFields.map((field) => (
            <div
              key={field.path}
              style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${field.status === 'error' ? 'var(--accent-danger)' : 'var(--border-subtle)'}`,
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{field.label}</span>
                  <StatusBadge status={field.status} t={t} />
                  <CharRatio original={field.original} translated={field.translated} />
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn btn-ghost btn-xs tooltip"
                    data-tooltip={t.ignored}
                    onClick={() => updateField(field.path, { status: field.status === 'ignored' ? 'pending' : 'ignored' })}
                    disabled={phase === 'translating'}
                    style={{ padding: '3px 6px' }}
                  >
                    {field.status === 'ignored' ? <RotateCcw size={12} /> : <Ban size={12} />}
                  </button>
                  <button
                    className="btn btn-ghost btn-xs tooltip"
                    data-tooltip={t.retranslate}
                    onClick={() => retranslateField(field.path)}
                    disabled={phase === 'translating'}
                    style={{ padding: '3px 6px' }}
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
              <DiffView original={field.original} translated={field.translated} />
              {field.error && (
                <div style={{ fontSize: '0.65rem', color: 'var(--accent-danger)', marginTop: '6px' }}>
                  {field.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
          <table className="field-table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>{t.field}</th>
                <th style={{ width: '40%' }}>{t.original}</th>
                <th>{t.translated}</th>
                <th style={{ width: '60px' }}>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredFields.map((field) => (
                <tr key={field.path} className={field.status === 'error' ? 'field-error' : ''}>
                  {/* Field name */}
                  <td>
                    <div className="field-name">{field.label}</div>
                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '3px', alignItems: 'center' }}>
                      <StatusBadge status={field.status} t={t} />
                      <CharRatio original={field.original} translated={field.translated} />
                    </div>
                    {field.error && (
                      <div
                        style={{
                          fontSize: '0.65rem',
                          color: 'var(--accent-danger)',
                          marginTop: '4px',
                          wordBreak: 'break-word',
                        }}
                      >
                        {field.error}
                      </div>
                    )}
                  </td>

                  {/* Original */}
                  <td>
                    <div className="field-original">
                      {field.original.length > 500
                        ? field.original.slice(0, 500) + '...'
                        : field.original}
                    </div>
                  </td>

                  {/* Translated */}
                  <td className="field-translated">
                    <textarea
                      value={field.translated}
                      onChange={(e) => updateField(field.path, { translated: e.target.value })}
                      placeholder={field.status === 'pending' ? 'Not translated yet' : ''}
                      rows={Math.min(Math.max(field.original.split('\n').length, 2), 8)}
                    />
                  </td>

                  {/* Actions */}
                  <td style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-ghost btn-xs tooltip"
                      data-tooltip={t.ignored}
                      onClick={() => updateField(field.path, { status: field.status === 'ignored' ? 'pending' : 'ignored' })}
                      disabled={phase === 'translating'}
                      style={{ padding: '4px' }}
                    >
                      {field.status === 'ignored' ? <RotateCcw size={13} /> : <Ban size={13} />}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs tooltip"
                      data-tooltip={t.retranslate}
                      onClick={() => retranslateField(field.path)}
                      disabled={phase === 'translating'}
                      style={{ padding: '4px' }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Status badge mini-component */
function StatusBadge({ status, t }: { status: string; t: Record<string, string> }) {
  if (status === 'done') {
    return (
      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
        <CheckCircle2 size={8} /> {t.done}
      </span>
    );
  }
  if (status === 'skipped') {
    return (
      <span className="badge badge-warning" style={{ fontSize: '0.65rem', background: 'var(--accent-warning)', color: '#fff', border: 'none' }}>
        <CheckCircle2 size={8} /> Bỏ qua
      </span>
    );
  }
  if (status === 'ignored') {
    return (
      <span className="badge badge-neutral" style={{ fontSize: '0.65rem', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
        <Ban size={8} /> {t.ignored || 'Bỏ qua (không dịch)'}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>
        <AlertTriangle size={8} /> {t.error}
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
        <Clock size={8} /> Pending
      </span>
    );
  }
  if (status === 'translating') {
    return (
      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
        Translating...
      </span>
    );
  }
  return null;
}
