import React, { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { extractPotentialMvuKeys, aiTranslateMvuKeys } from '../utils/mvuSync';
import { Settings, Plus, Trash2, Wand2, Info, Loader2, Bot } from 'lucide-react';

export default function MvuSyncPanel() {
  const { card, translationConfig, setTranslationConfig, locale, proxy, addToast } = useStore();
  const t = useT();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const isVi = locale === 'vi';

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
      addToast('info', isVi ? 'Không tìm thấy key MVU nào.' : 'No MVU keys found.');
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
      addToast('success', isVi ? `Đã thêm ${added} key mới.` : `Added ${added} new keys.`);
    } else {
      addToast('info', isVi ? 'Các key đều đã có sẵn.' : 'Keys already exist.');
    }
  };

  // Quét key + gọi AI dịch tự động
  const autoExtractAndTranslate = async () => {
    const keys = extractPotentialMvuKeys(card);
    if (keys.length === 0) {
      addToast('info', isVi ? 'Không tìm thấy key MVU nào.' : 'No MVU keys found.');
      return;
    }

    // Lọc keys chưa có hoặc chưa có bản dịch
    const keysNeedTranslation = keys.filter(k => !(k in mvuDictionary) || !mvuDictionary[k]);
    if (keysNeedTranslation.length === 0) {
      addToast('info', isVi ? 'Tất cả key đều đã có bản dịch.' : 'All keys already have translations.');
      return;
    }

    setIsAutoTranslating(true);
    try {
      let schemaContext = translationConfig.customSchema || '';
      if (!schemaContext.trim() && card?.data?.extensions?.tavern_helper?.scripts) {
        schemaContext = card.data.extensions.tavern_helper.scripts.map((s: any) => s.content).join('\n\n');
      }

      const translations = await aiTranslateMvuKeys(
        keysNeedTranslation,
        translationConfig.targetLanguage,
        proxy,
        undefined,
        schemaContext
      );

      const nextDict = { ...mvuDictionary };
      let added = 0;
      for (const [k, v] of Object.entries(translations)) {
        if (v && v.trim() && k !== v) {
          nextDict[k] = v;
          added++;
        }
      }

      // Also add keys that AI couldn't translate (empty value for manual input)
      for (const k of keysNeedTranslation) {
        if (!(k in nextDict)) {
          nextDict[k] = '';
        }
      }

      setTranslationConfig({ mvuDictionary: nextDict });
      addToast('success', isVi
        ? `AI đã dịch ${added}/${keysNeedTranslation.length} tên biến.`
        : `AI translated ${added}/${keysNeedTranslation.length} variable names.`
      );
    } catch (err) {
      addToast('error', isVi
        ? `Lỗi AI: ${err instanceof Error ? err.message : String(err)}`
        : `AI Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsAutoTranslating(false);
    }
  };

  const dictEntries = Object.entries(mvuDictionary);
  const filledCount = dictEntries.filter(([, v]) => v.trim()).length;

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
            {isVi ? 'Chiến Lược B (Đồng bộ Biến MVU/Zod)' : 'Strategy B (Sync MVU Variables)'}
          </span>
          {dictEntries.length > 0 && (
            <span style={{
              padding: '1px 6px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 700,
              background: filledCount === dictEntries.length ? 'rgba(106,240,138,0.1)' : 'rgba(240,196,106,0.1)',
              color: filledCount === dictEntries.length ? 'var(--accent-success)' : 'var(--accent-warning)',
            }}>
              {filledCount}/{dictEntries.length}
            </span>
          )}
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
              {isVi 
                ? 'Đổi tên biến hệ thống để thẻ MVU vẫn hoạt động sau khi dịch. Bật ON → khi dịch, AI sẽ TỰ ĐỘNG quét key và dịch tên biến.' 
                : 'Rename system variables to keep MVU cards functional after translation. ON → AI will AUTO-DETECT keys and translate variable names during translation.'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button className="btn btn-secondary" onClick={autoExtract} style={{ flex: 1, padding: '6px', fontSize: '0.75rem' }}>
              <Wand2 size={14} />
              {isVi ? 'Quét Key' : 'Extract Keys'}
            </button>
            <button
              className="btn btn-primary"
              onClick={autoExtractAndTranslate}
              disabled={isAutoTranslating}
              style={{ flex: 1, padding: '6px', fontSize: '0.75rem' }}
            >
              {isAutoTranslating
                ? <><Loader2 size={14} className="spin" /> {isVi ? 'Đang dịch...' : 'Translating...'}</>
                : <><Bot size={14} /> {isVi ? 'AI Quét + Dịch Key' : 'AI Extract + Translate'}</>
              }
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
            {dictEntries.map(([k, v]) => (
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
                  placeholder={isVi ? 'Bản dịch (VD: Do_Hao_Cam)' : 'Translation'}
                  style={{
                    flex: 1, padding: '6px 8px', fontSize: '0.75rem',
                    background: v ? 'var(--bg-primary)' : 'rgba(240,196,106,0.06)',
                    border: `1px solid ${v ? 'var(--border-subtle)' : 'rgba(240,196,106,0.3)'}`,
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
              placeholder={isVi ? 'Key gốc' : 'Original Key'}
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
              placeholder={isVi ? 'Dịch' : 'Translated'}
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
