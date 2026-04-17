import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { useT } from '../i18n/useLocale';
import type { FieldGroup } from '../types/card';
import { RotateCcw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const TAB_IDS: (FieldGroup | 'all')[] = [
  'all', 'core', 'messages', 'lorebook', 'lorebook_keys', 'system', 'creator', 'regex', 'depth_prompt',
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
  };
  return map;
}

export default function FieldEditor() {
  const { fields, updateField, phase } = useStore();
  const { retranslateField } = useTranslation();
  const t = useT();
  const tabLabels = useTabLabels();
  const [activeTab, setActiveTab] = useState<FieldGroup | 'all'>('all');

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
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
          {t.fieldEditor}
        </h3>

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

      {/* Table */}
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
                  <div style={{ marginTop: '4px' }}>
                    {field.status === 'done' && (
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                        <CheckCircle2 size={8} /> {t.done}
                      </span>
                    )}
                    {field.status === 'error' && (
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>
                        <AlertTriangle size={8} /> {t.error}
                      </span>
                    )}
                    {field.status === 'pending' && (
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        <Clock size={8} /> Pending
                      </span>
                    )}
                    {field.status === 'translating' && (
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                        Translating...
                      </span>
                    )}
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
                <td>
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
    </div>
  );
}
