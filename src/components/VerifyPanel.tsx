import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { useT } from '../i18n/useLocale';
import { aiVerifyCard, quickVerify, extractSystemReferences, verifyFields, applyAutoFix } from '../utils/aiVerify';
import type { VerifyIssue, VerifyResult, FieldIssue } from '../utils/aiVerify';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Loader2, Zap, Eye, ChevronDown, ChevronUp, Wrench, FileWarning, Code2, Braces, Hash, Type, ArrowLeftRight, CheckCircle2 } from 'lucide-react';

const SEVERITY_CONFIG = {
  error: { color: 'var(--accent-danger)', bg: 'rgba(255,82,82,0.06)', icon: AlertCircle, label: 'Error' },
  warning: { color: 'var(--accent-warning)', bg: 'rgba(240,196,106,0.06)', icon: AlertTriangle, label: 'Warning' },
  info: { color: 'var(--accent-primary)', bg: 'rgba(124,106,240,0.06)', icon: Info, label: 'Info' },
};

/** Map category key to i18n translation key */
const CATEGORY_I18N_KEY: Record<string, string> = {
  residual_source: 'catResidualSource',
  html_broken: 'catHtmlBroken',
  bracket_mismatch: 'catBracketMismatch',
  macro_damaged: 'catMacroDamaged',
  json_broken: 'catJsonBroken',
  mvu_inconsistent: 'catMvuInconsistent',
  length_anomaly: 'catLengthAnomaly',
  empty_translation: 'catEmpty',
};

const CATEGORY_ICON: Record<string, typeof Code2> = {
  residual_source: Type, html_broken: Code2, bracket_mismatch: Braces,
  macro_damaged: Hash, json_broken: FileWarning, mvu_inconsistent: ArrowLeftRight,
  length_anomaly: AlertTriangle, empty_translation: AlertCircle,
};

type VerifyTab = 'field' | 'card';

export default function VerifyPanel() {
  const store = useStore();
  const { card, fields, proxy, translationConfig, locale, addToast, addLog, updateField } = store;
  const { getExportCard } = useTranslation();
  const t = useT() as Record<string, string>;
  const isVi = locale === 'vi';

  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [fieldIssues, setFieldIssues] = useState<FieldIssue[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<VerifyTab>('field');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [refStats, setRefStats] = useState<{ total: number; types: Record<string, number> } | null>(null);

  const doneCount = fields.filter(f => f.status === 'done').length;

  const toggleIssue = (id: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Field-level verify ───
  const handleFieldVerify = useCallback(() => {
    setIsVerifying(true);
    setActiveTab('field');
    try {
      const issues = verifyFields(fields, translationConfig.mvuDictionary, translationConfig.sourceLanguage);
      setFieldIssues(issues);
      addLog('info', `Field verify: ${issues.length} issues (${issues.filter(i => i.severity === 'error').length} errors)`);
      if (issues.length === 0) {
        addToast('success', t.verifyNoIssues);
      }
    } catch (err) {
      addToast('error', `Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsVerifying(false);
    }
  }, [fields, translationConfig, addLog, addToast, isVi]);

  // ─── Card-level quick verify ───
  const handleQuickVerify = useCallback(() => {
    if (!card) return;
    setIsVerifying(true);
    setActiveTab('card');
    try {
      const exportCard = getExportCard();
      if (!exportCard) { addToast('error', isVi ? 'Không thể tạo card xuất' : 'Cannot generate export card'); return; }
      const origRefs = extractSystemReferences(card);
      const types: Record<string, number> = {};
      for (const r of origRefs) types[r.type] = (types[r.type] || 0) + 1;
      setRefStats({ total: origRefs.length, types });
      const issues = quickVerify(card, exportCard);
      setVerifyResult({
        totalIssues: issues.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
        issues,
        summary: issues.length === 0
          ? t.verifyAllRefsValid
          : t.verifyFoundIssues.replace('{count}', String(issues.length)),
      });
    } catch (err) {
      addToast('error', `Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsVerifying(false);
    }
  }, [card, getExportCard, addToast, isVi, addLog]);

  // ─── AI deep verify ───
  const handleAIVerify = useCallback(async () => {
    if (!card) return;
    setIsVerifying(true);
    setActiveTab('card');
    try {
      const exportCard = getExportCard();
      if (!exportCard) { addToast('error', isVi ? 'Không thể tạo card xuất' : 'Cannot generate export card'); return; }
      addLog('active', isVi ? '🔍 Đang gọi AI kiểm tra...' : '🔍 Calling AI for verification...');
      const result = await aiVerifyCard(card, exportCard, proxy, translationConfig.targetLanguage, translationConfig.mvuDictionary);
      setVerifyResult(result);
      addLog(result.errors > 0 ? 'error' : 'success', `AI Verify: ${result.errors} errors, ${result.warnings} warnings`);
    } catch (err) {
      addToast('error', `AI Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsVerifying(false);
    }
  }, [card, getExportCard, proxy, translationConfig, addToast, addLog, isVi]);

  // ─── Auto-fix handler ───
  const handleAutoFix = useCallback((issue: FieldIssue) => {
    const newFields = applyAutoFix(issue, fields);
    const changed = newFields.find(f => f.path === issue.fixPath);
    if (changed) {
      updateField(changed.path, { translated: changed.translated });
      setFieldIssues(prev => prev.filter(i => i.id !== issue.id));
      addLog('success', `🔧 Auto-fixed: ${issue.location} — ${issue.category}`);
      addToast('success', t.verifyFixed.replace('{location}', issue.location));
    }
  }, [fields, updateField, addLog, addToast, isVi]);

  // ─── Fix all auto-fixable ───
  const handleFixAll = useCallback(() => {
    let fixCount = 0;
    const fixable = fieldIssues.filter(i => i.autoFixable);
    for (const issue of fixable) {
      if (issue.fixPath && issue.fixValue) {
        updateField(issue.fixPath, { translated: issue.fixValue });
        fixCount++;
      }
    }
    setFieldIssues(prev => prev.filter(i => !i.autoFixable));
    addLog('success', `🔧 Auto-fixed ${fixCount} issues`);
    addToast('success', t.verifyAutoFixed.replace('{count}', String(fixCount)));
  }, [fieldIssues, updateField, addLog, addToast, isVi]);

  // ─── Derived data ───
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of fieldIssues) counts[i.category] = (counts[i.category] || 0) + 1;
    return counts;
  }, [fieldIssues]);

  const filteredFieldIssues = useMemo(() => {
    let list = fieldIssues;
    if (categoryFilter) list = list.filter(i => i.category === categoryFilter);
    if (severityFilter) list = list.filter(i => i.severity === severityFilter);
    return list;
  }, [fieldIssues, categoryFilter, severityFilter]);

  const autoFixableCount = fieldIssues.filter(i => i.autoFixable).length;
  const fieldErrors = fieldIssues.filter(i => i.severity === 'error').length;
  const fieldWarnings = fieldIssues.filter(i => i.severity === 'warning').length;

  // Early return AFTER all hooks to comply with Rules of Hooks
  if (!card || doneCount === 0) return null;

  return (
    <div className="card fade-in" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            {t.verifyTitle}
          </h3>
        </div>
        {fieldIssues.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {fieldErrors > 0 && <Badge color="var(--accent-danger)" bg="rgba(255,82,82,0.1)" text={`${fieldErrors} ${t.verifyErrors}`} />}
            {fieldWarnings > 0 && <Badge color="var(--accent-warning)" bg="rgba(240,196,106,0.1)" text={`${fieldWarnings} ${t.verifyWarnings}`} />}
            {fieldIssues.length === 0 && <Badge color="var(--accent-success)" bg="rgba(76,175,80,0.1)" text={`✅ ${t.verifyPass}`} />}
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        {t.verifyDesc}
      </p>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleFieldVerify} disabled={isVerifying}
          style={{ flex: '1 1 120px', padding: '8px 12px', fontSize: '0.8rem' }}>
          {isVerifying && activeTab === 'field'
            ? <><Loader2 size={14} className="spin" /> {t.verifyChecking}</>
            : <><Zap size={14} /> {t.verifyFields}</>}
        </button>
        <button className="btn btn-secondary" onClick={handleQuickVerify} disabled={isVerifying}
          style={{ flex: '1 1 120px', padding: '8px 12px', fontSize: '0.8rem' }}>
          {isVerifying && activeTab === 'card'
            ? <><Loader2 size={14} className="spin" /> ...</>
            : <><ShieldCheck size={14} /> {t.verifyCheckRefs}</>}
        </button>
        <button className="btn btn-secondary" onClick={handleAIVerify} disabled={isVerifying}
          style={{ flex: '1 1 120px', padding: '8px 12px', fontSize: '0.8rem' }}>
          <Eye size={14} /> {t.verifyAIDeep}
        </button>
      </div>

      {/* Auto-fix all button */}
      {autoFixableCount > 0 && (
        <button className="btn btn-primary" onClick={handleFixAll}
          style={{ width: '100%', padding: '8px', fontSize: '0.78rem', marginBottom: '12px', background: 'var(--accent-success)', border: 'none' }}>
          <Wrench size={14} /> {t.verifyAutoFixAll.replace('{count}', String(autoFixableCount))}
        </button>
      )}

      {/* Category filter chips */}
      {fieldIssues.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <FilterChip label={t.all} count={fieldIssues.length} active={!categoryFilter} onClick={() => setCategoryFilter(null)} />
          {Object.entries(categoryCounts).map(([cat, count]) => {
            const i18nKey = CATEGORY_I18N_KEY[cat];
            return <FilterChip key={cat} label={i18nKey ? t[i18nKey] : cat} count={count}
              active={categoryFilter === cat} onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)} />;
          })}
        </div>
      )}

      {/* Field Issues List */}
      {fieldIssues.length > 0 && activeTab === 'field' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '450px', overflowY: 'auto' }}>
          {filteredFieldIssues.map(issue => <IssueRow key={issue.id} issue={issue} isVi={isVi}
            expanded={expandedIssues.has(issue.id)} onToggle={() => toggleIssue(issue.id)}
            onAutoFix={issue.autoFixable ? () => handleAutoFix(issue) : undefined} />)}
        </div>
      )}

      {/* Card-level results */}
      {verifyResult && activeTab === 'card' && (
        <div style={{ marginTop: '4px' }}>
          {refStats && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', marginBottom: '10px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t.verifyRefs} {refStats.total}
              </span>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                {Object.entries(refStats.types).map(([type, count]) => (
                  <span key={type} style={{ padding: '1px 6px', borderRadius: '8px', background: 'rgba(124,106,240,0.08)', fontSize: '0.6rem' }}>{type}: {count}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{
            padding: '10px 12px',
            background: verifyResult.errors > 0 ? 'rgba(255,82,82,0.05)' : 'rgba(76,175,80,0.05)',
            border: `1px solid ${verifyResult.errors > 0 ? 'rgba(255,82,82,0.15)' : 'rgba(76,175,80,0.15)'}`,
            borderRadius: 'var(--radius-md)', marginBottom: '10px', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)',
          }}>
            {verifyResult.summary}
          </div>
          {verifyResult.issues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '350px', overflowY: 'auto' }}>
              {verifyResult.issues.map(issue => <IssueRow key={issue.id} issue={issue} isVi={isVi}
                expanded={expandedIssues.has(issue.id)} onToggle={() => toggleIssue(issue.id)} />)}
            </div>
          )}
        </div>
      )}

      {/* Empty state after verify */}
      {fieldIssues.length === 0 && activeTab === 'field' && !isVerifying && fieldIssues !== null && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <CheckCircle2 size={28} color="var(--accent-success)" style={{ marginBottom: '6px' }} />
          <div>{t.verifyStartHint}</div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function Badge({ color, bg, text }: { color: string; bg: string; text: string }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700, background: bg, color }}>{text}</span>
  );
}

function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: active ? 700 : 500,
      background: active ? 'rgba(124,106,240,0.15)' : 'var(--bg-primary)',
      color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
      border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      {label} <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}

function IssueRow({ issue, isVi, expanded, onToggle, onAutoFix }: {
  issue: VerifyIssue | FieldIssue; isVi: boolean; expanded: boolean; onToggle: () => void; onAutoFix?: () => void;
}) {
  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const t = useT() as Record<string, string>;
  const category = 'category' in issue ? (issue as FieldIssue).category : null;
  const catLabel = category && CATEGORY_I18N_KEY[category] ? t[CATEGORY_I18N_KEY[category]] : null;

  return (
    <div style={{ border: `1px solid ${cfg.color}20`, borderRadius: 'var(--radius-md)', background: cfg.bg, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', userSelect: 'none' }}>
        <Icon size={13} color={cfg.color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ color: cfg.color }}>[{issue.location}]</span>
            {catLabel && <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '6px', background: 'rgba(124,106,240,0.08)', color: 'var(--text-muted)' }}>
              {catLabel}
            </span>}
            <span style={{ fontWeight: 500 }}>{issue.description.slice(0, 100)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {onAutoFix && (
            <button onClick={(e) => { e.stopPropagation(); onAutoFix(); }}
              className="btn btn-ghost btn-xs" style={{ padding: '2px 6px', fontSize: '0.6rem', color: 'var(--accent-success)' }}>
              <Wrench size={11} /> Fix
            </button>
          )}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 10px 8px', fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {issue.description.length > 100 && <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{issue.description}</div>}
          {issue.original && (
            <div>
              <span style={{ fontWeight: 600, color: 'var(--accent-danger)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Original:</span>
              <pre style={{ margin: '2px 0 0', padding: '5px 7px', background: 'rgba(0,0,0,0.05)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.66rem', maxHeight: '80px', overflowY: 'auto' }}>{issue.original}</pre>
            </div>
          )}
          {issue.current && issue.current !== '(missing)' && issue.current !== '(missing or renamed)' && (
            <div>
              <span style={{ fontWeight: 600, color: 'var(--accent-warning)', fontSize: '0.58rem', textTransform: 'uppercase' }}>Current:</span>
              <pre style={{ margin: '2px 0 0', padding: '5px 7px', background: 'rgba(0,0,0,0.05)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.66rem', maxHeight: '80px', overflowY: 'auto' }}>{issue.current}</pre>
            </div>
          )}
          {issue.suggestion && (
            <div style={{ padding: '5px 7px', background: 'rgba(76,175,80,0.06)', border: '1px solid rgba(76,175,80,0.15)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-success)', fontSize: '0.58rem', textTransform: 'uppercase' }}>
                💡 {t.verifySuggestFix}
              </span>
              <div style={{ marginTop: '2px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{issue.suggestion}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
