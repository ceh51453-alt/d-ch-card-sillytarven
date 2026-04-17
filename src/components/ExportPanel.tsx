import { useStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { useT } from '../i18n/useLocale';
import { Download, AlertTriangle } from 'lucide-react';

export default function ExportPanel() {
  const { card, fields, cardFileName, translationConfig, phase } = useStore();
  const { getExportCard } = useTranslation();
  const t = useT();

  if (!card || fields.length === 0) return null;

  const doneCount = fields.filter((f) => f.status === 'done').length;
  const errorCount = fields.filter((f) => f.status === 'error').length;
  const pendingCount = fields.filter((f) => f.status === 'pending').length;
  const hasIssues = errorCount > 0 || pendingCount > 0;

  const handleExport = () => {
    const exportCard = getExportCard();
    if (!exportCard) return;

    const json = JSON.stringify(exportCard, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Generate filename
    const baseName = cardFileName.replace(/\.json$/i, '');
    const langSuffix = translationConfig.targetLanguage === 'Tiếng Việt'
      ? 'vi'
      : translationConfig.targetLanguage === 'English'
        ? 'en'
        : translationConfig.targetLanguage === '日本語'
          ? 'ja'
          : translationConfig.targetLanguage === '한국어'
            ? 'ko'
            : translationConfig.targetLanguage.slice(0, 2).toLowerCase();
    const fileName = `${baseName}_${langSuffix}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t.stepExport}</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {doneCount}/{fields.length} {t.fieldsTranslated}
        </span>
      </div>

      {hasIssues && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            background: 'rgba(240, 196, 106, 0.08)',
            border: '1px solid rgba(240, 196, 106, 0.2)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            fontSize: '0.8rem',
            color: 'var(--accent-warning)',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            {t.exportWarning}
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleExport}
        disabled={phase === 'translating' || doneCount === 0}
        style={{ width: '100%' }}
      >
        <Download size={16} />
        {t.downloadJson}
      </button>
    </div>
  );
}
