import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { TARGET_LANGUAGES, SOURCE_LANGUAGES } from '../utils/cardFields';
import { getDefaultTranslationPrompt } from '../utils/apiClient';
import type { TranslationMode, LorebookStrategy, FieldGroupConfig, FieldGroup } from '../types/card';
import { Languages, Settings2, FileJson } from 'lucide-react';

/** Map field group IDs to i18n keys */
function useGroupLabels() {
  const t = useT();
  const map: Record<FieldGroup, { label: string; desc: string }> = {
    core: { label: t.groupCore, desc: t.groupCoreDesc },
    messages: { label: t.groupMessages, desc: t.groupMessagesDesc },
    system: { label: t.groupSystem, desc: t.groupSystemDesc },
    creator: { label: t.groupCreator, desc: t.groupCreatorDesc },
    lorebook: { label: t.groupLorebook, desc: t.groupLorebookDesc },
    lorebook_keys: { label: t.groupLorebookKeys, desc: t.groupLorebookKeysDesc },
    regex: { label: t.groupRegex, desc: t.groupRegexDesc },
    depth_prompt: { label: t.groupDepthPrompt, desc: t.groupDepthPromptDesc },
  };
  return map;
}

export default function TranslateConfig() {
  const { translationConfig, setTranslationConfig, toggleFieldGroup, card } = useStore();
  const t = useT();
  const groupLabels = useGroupLabels();

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title">
          <Languages size={16} style={{ color: 'var(--accent-warning)' }} />
          {t.translationSettings}
        </span>
      </div>
      <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Source & Target Languages */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label className="label">Source Language</label>
            <select
              className="input"
              value={translationConfig.sourceLanguage || 'auto'}
              onChange={(e) => setTranslationConfig({ sourceLanguage: e.target.value })}
            >
              {SOURCE_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">{t.targetLanguage}</label>
            <select
              className="input"
              value={translationConfig.targetLanguage}
              onChange={(e) => setTranslationConfig({ targetLanguage: e.target.value })}
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {translationConfig.targetLanguage === 'custom' && (
              <input
                className="input"
                style={{ marginTop: '6px' }}
                placeholder="Enter target language..."
                onChange={(e) => setTranslationConfig({ targetLanguage: e.target.value || 'custom' })}
              />
            )}
          </div>
        </div>

        {/* Skip already translated */}
        <label className="checkbox-wrapper">
          <input
            type="checkbox"
            checked={translationConfig.skipAlreadyTranslated}
            onChange={(e) => setTranslationConfig({ skipAlreadyTranslated: e.target.checked })}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{t.skipAlreadyTranslated}</span>
        </label>

        {/* Fields & mode only shown when a card is loaded */}
        {card && (
          <>
            {/* Field Groups */}
            <div>
              <label className="label" style={{ marginBottom: '8px' }}>{t.fieldsToTranslate}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {translationConfig.fieldGroups.map((group: FieldGroupConfig) => {
                  const labels = groupLabels[group.id];
                  return (
                    <label key={group.id} className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={group.enabled}
                        onChange={() => toggleFieldGroup(group.id)}
                      />
                      <div>
                        <span style={{ color: 'var(--text-primary)' }}>{labels?.label || group.label}</span>
                        <span
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.7rem',
                            marginLeft: '6px',
                          }}
                        >
                          {labels?.desc || group.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Translation Mode */}
            <div>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Settings2 size={12} />
                {t.translationMode}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <RadioOption
                  name="mode"
                  value="field"
                  checked={translationConfig.mode === 'field'}
                  onChange={() => setTranslationConfig({ mode: 'field' as TranslationMode })}
                  label={t.fieldByField}
                  desc={t.fieldByFieldDesc}
                />
                <RadioOption
                  name="mode"
                  value="batch"
                  checked={translationConfig.mode === 'batch'}
                  onChange={() => setTranslationConfig({ mode: 'batch' as TranslationMode })}
                  label={t.batchMode}
                  desc={t.batchModeDesc}
                />
              </div>
            </div>

            {/* Lorebook Strategy */}
            {translationConfig.fieldGroups.find((g: FieldGroupConfig) => g.id === 'lorebook')?.enabled && (
              <div>
                <label className="label" style={{ marginBottom: '6px' }}>{t.lorebookStrategy}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <RadioOption
                    name="lore"
                    value="single"
                    checked={translationConfig.lorebookStrategy === 'single'}
                    onChange={() => setTranslationConfig({ lorebookStrategy: 'single' as LorebookStrategy })}
                    label={t.individualEntries}
                    desc={t.individualEntriesDesc}
                  />
                  <RadioOption
                    name="lore"
                    value="batch"
                    checked={translationConfig.lorebookStrategy === 'batch'}
                    onChange={() => setTranslationConfig({ lorebookStrategy: 'batch' as LorebookStrategy })}
                    label={`${t.batchEntries} (${translationConfig.lorebookBatchSize})`}
                    desc={t.batchEntriesDesc}
                  />
                </div>
                {translationConfig.lorebookStrategy === 'batch' && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <label className="label">{t.entriesPerBatch}</label>
                      <input
                        className="input"
                        type="number"
                        min={2}
                        max={50}
                        value={translationConfig.lorebookBatchSize}
                        onChange={(e) => setTranslationConfig({ lorebookBatchSize: parseInt(e.target.value) || 5 })}
                      />
                    </div>
                    <div>
                      <label className="label">{t.concurrentBatches}</label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={10}
                        value={translationConfig.concurrentBatches}
                        onChange={(e) => setTranslationConfig({ concurrentBatches: parseInt(e.target.value) || 1 })}
                      />
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {t.concurrentBatchesHint}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Custom Schema */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="label" style={{ marginBottom: 0 }}>{t.customSchema || 'Custom Format Schema'}</label>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  <FileJson size={14} />
                  {t.uploadJson || 'Upload JSON'}
                  <input
                    type="file"
                    accept=".json,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        try {
                          const content = evt.target?.result as string;
                          const parsed = JSON.parse(content);
                          setTranslationConfig({ customSchema: JSON.stringify(parsed, null, 2) });
                        } catch (err) {
                          setTranslationConfig({ customSchema: evt.target?.result as string });
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
                placeholder={t.customSchemaDesc || "Optional: Provide a JSON schema, MVU rules, or Zod format. The AI will strictly follow this structure."}
                value={translationConfig.customSchema || ''}
                onChange={(e) => setTranslationConfig({ customSchema: e.target.value })}
              />
            </div>

            {/* Custom Translation Prompt */}
            <div>
              <label className="label" style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>Custom Translation Prompt</span>
                {translationConfig.translationPrompt && (
                  <span 
                    style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', cursor: 'pointer' }}
                    onClick={() => setTranslationConfig({ translationPrompt: '' })}
                  >
                    Reset to Default
                  </span>
                )}
              </label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: '120px', fontFamily: 'monospace', fontSize: '0.75rem', resize: 'vertical', whiteSpace: 'pre-wrap' }}
                placeholder="Leave empty to use the default prompt..."
                value={translationConfig.translationPrompt || getDefaultTranslationPrompt(translationConfig.sourceLanguage, translationConfig.targetLanguage)}
                onChange={(e) => {
                  // Only save if it differs from default
                  const defaultPrompt = getDefaultTranslationPrompt(translationConfig.sourceLanguage, translationConfig.targetLanguage);
                  if (e.target.value === defaultPrompt) {
                    setTranslationConfig({ translationPrompt: '' });
                  } else {
                    setTranslationConfig({ translationPrompt: e.target.value });
                  }
                }}
              />
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                You can fully customize the strict rules. The target language and source language info is already applied. Leave empty to use the built-in default.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
  desc,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  desc: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: checked ? 'rgba(124, 106, 240, 0.08)' : 'transparent',
        border: checked ? '1px solid rgba(124, 106, 240, 0.2)' : '1px solid transparent',
        transition: 'all 0.15s',
        fontSize: '0.85rem',
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ accentColor: 'var(--accent-primary)' }}
      />
      <div>
        <span style={{ color: 'var(--text-primary)' }}>{label}</span>
        <span
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.7rem',
            marginLeft: '6px',
          }}
        >
          — {desc}
        </span>
      </div>
    </label>
  );
}
