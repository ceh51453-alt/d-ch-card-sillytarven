import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { extractPotentialMvuKeys } from '../utils/mvuSync';
import { Settings, Plus, Trash2, Wand2, Info } from 'lucide-react';

export default function MvuSyncPanel() {
  const { card, translationConfig, setTranslationConfig, locale } = useStore();
  const t = useT();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const { enableMvuSync, mvuDictionary } = translationConfig;

  if (!card) return null;

  const toggleSync = () => setTranslationConfig({ enableMvuSync: !enableMvuSync });

  const addEntry = () => {
    if (newKey.trim() && newValue.trim()) {
      setTranslationConfig({
        mvuDictionary: {
          ...mvuDictionary,
          [newKey.trim()]: newValue.trim(),
        },
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeEntry = (key: string) => {
    const nextDict = { ...mvuDictionary };
    delete nextDict[key];
    setTranslationConfig({ mvuDictionary: nextDict });
  };

  const updateEntry = (key: string, value: string) => {
    setTranslationConfig({
      mvuDictionary: {
        ...mvuDictionary,
        [key]: value,
      },
    });
  };

  const autoExtract = () => {
    const keys = extractPotentialMvuKeys(card);
    if (keys.length === 0) {
      alert(locale === 'vi' ? 'Không tìm thấy key MVU nào.' : 'No MVU keys found.');
      return;
    }
    const nextDict = { ...mvuDictionary };
    let added = 0;
    keys.forEach(k => {
      if (!(k in nextDict)) {
        nextDict[k] = '';
        added++;
      }
    });
    
    if (added > 0) {
      setTranslationConfig({ mvuDictionary: nextDict });
      alert(locale === 'vi' ? `Đã thêm ${added} key mới.` : `Added ${added} new keys.`);
    } else {
      alert(locale === 'vi' ? 'Các key đều đã có sẵn.' : 'Keys already exist.');
    }
  };

  return (
    <div style={{
      marginBottom: '16px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-secondary)',
      overflow: 'hidden'
    }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          background: isExpanded ? 'rgba(0,0,0,0.02)' : 'transparent',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={16} color="var(--accent-primary)" />
          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {locale === 'vi' ? 'Chiến Lược B (Đồng bộ Biến MVU/Zod)' : 'Strategy B (Sync MVU Variables)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
            <input 
              type="checkbox" 
              checked={enableMvuSync} 
              onChange={toggleSync} 
            />
            <span className="slider round"></span>
          </label>
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '12px',
            marginBottom: '16px',
            display: 'flex',
            gap: '6px',
            alignItems: 'flex-start'
          }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              {locale === 'vi' 
                ? 'Đổi tên biến hệ thống để thẻ MVU vẫn hoạt động sau khi dịch (Zod, Regex UI, Lorebook Rules).' 
                : 'Rename system variables to keep MVU cards functional after translation (Zod, Regex UI, Lorebook Rules).'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button className="btn btn-secondary" onClick={autoExtract} style={{ flex: 1, padding: '6px' }}>
              <Wand2 size={14} />
              {locale === 'vi' ? 'Quét Key Tự Động' : 'Auto Extract Keys'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
            {Object.entries(mvuDictionary).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={k}
                  readOnly
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: '0.75rem',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)'
                  }}
                />
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <input
                  type="text"
                  value={v}
                  onChange={(e) => updateEntry(k, e.target.value)}
                  placeholder={locale === 'vi' ? 'Bản dịch (VD: Do_Hao_Cam)' : 'Translation'}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: '0.75rem',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none'
                  }}
                  autoFocus={v === ''}
                />
                <button
                  onClick={() => removeEntry(k)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer', padding: '4px' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '12px', alignItems: 'center' }}>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={locale === 'vi' ? 'Key gốc' : 'Original Key'}
              style={{
                flex: 1, padding: '6px 8px', fontSize: '0.75rem',
                background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)'
              }}
              onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={locale === 'vi' ? 'Dịch' : 'Translated'}
              style={{
                flex: 1, padding: '6px 8px', fontSize: '0.75rem',
                background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)'
              }}
              onKeyDown={(e) => e.key === 'Enter' && addEntry()}
            />
            <button
              onClick={addEntry}
              style={{
                background: 'var(--accent-primary)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)',
                padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              disabled={!newKey.trim() || !newValue.trim()}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
