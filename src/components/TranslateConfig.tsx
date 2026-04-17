import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { TARGET_LANGUAGES } from '../utils/cardFields';
import type { TranslationMode, LorebookStrategy, FieldGroupConfig, FieldGroup } from '../types/card';
import { Languages, Settings2 } from 'lucide-react';

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
        {/* Target Language — ALWAYS visible */}
        <div>
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
                  <div style={{ marginTop: '8px' }}>
                    <label className="label">{t.entriesPerBatch}</label>
                    <input
                      className="input"
                      type="number"
                      min={2}
                      max={20}
                      value={translationConfig.lorebookBatchSize}
                      onChange={(e) => setTranslationConfig({ lorebookBatchSize: parseInt(e.target.value) || 5 })}
                    />
                  </div>
                )}
              </div>
            )}
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
