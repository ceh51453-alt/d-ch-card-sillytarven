import { useState, useCallback } from 'react';
import { useStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { useT } from '../i18n/useLocale';
import { aiVerifyCard, quickVerify, extractSystemReferences } from '../utils/aiVerify';
import type { VerifyIssue, VerifyResult } from '../utils/aiVerify';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Loader2, Zap, Eye, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

const SEVERITY_CONFIG = {
  error: { color: 'var(--accent-danger)', bg: 'rgba(255,82,82,0.06)', icon: AlertCircle, label: 'Error' },
  warning: { color: 'var(--accent-warning)', bg: 'rgba(240,196,106,0.06)', icon: AlertTriangle, label: 'Warning' },
  info: { color: 'var(--accent-primary)', bg: 'rgba(124,106,240,0.06)', icon: Info, label: 'Info' },
};

export default function VerifyPanel() {
  const { card, fields, proxy, translationConfig, locale, addToast, addLog } = useStore();
  const { getExportCard } = useTranslation();
  const t = useT();
  const isVi = locale === 'vi';

  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyMode, setVerifyMode] = useState<'quick' | 'ai'>('quick');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [refStats, setRefStats] = useState<{ total: number; types: Record<string, number> } | null>(null);

  const doneCount = fields.filter(f => f.status === 'done').length;
  const hasTranslations = doneCount > 0;

  const toggleIssue = (id: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleQuickVerify = useCallback(() => {
    if (!card) return;
    setIsVerifying(true);
    setVerifyMode('quick');

    try {
      const exportCard = getExportCard();
      if (!exportCard) {
        addToast('error', isVi ? 'Không thể tạo card xuất' : 'Cannot generate export card');
        setIsVerifying(false);
        return;
      }

      const origRefs = extractSystemReferences(card);
      const types: Record<string, number> = {};
      for (const r of origRefs) {
        types[r.type] = (types[r.type] || 0) + 1;
      }
      setRefStats({ total: origRefs.length, types });

      const issues = quickVerify(card, exportCard);
      setVerifyResult({
        totalIssues: issues.length,
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
        issues,
        summary: issues.length === 0
          ? (isVi ? '✅ Tất cả tham chiếu hệ thống đều hợp lệ.' : '✅ All system references are valid.')
          : (isVi ? `Tìm thấy ${issues.length} vấn đề cần xem xét.` : `Found ${issues.length} issue(s) to review.`),
      });
      addLog('info', `Quick verify: ${issues.length} issues found`);
    } catch (err) {
      addToast('error', `Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsVerifying(false);
    }
  }, [card, getExportCard, addToast, addLog, isVi]);

  const handleAIVerify = useCallback(async () => {
    if (!card) return;
    setIsVerifying(true);
    setVerifyMode('ai');

    try {
      const exportCard = getExportCard();
      if (!exportCard) {
        addToast('error', isVi ? 'Không thể tạo card xuất' : 'Cannot generate export card');
        setIsVerifying(false);
        return;
      }

      const origRefs = extractSystemReferences(card);
      const types: Record<string, number> = {};
      for (const r of origRefs) {
        types[r.type] = (types[r.type] || 0) + 1;
      }
      setRefStats({ total: origRefs.length, types });

      addLog('active', isVi ? '🔍 Đang gọi AI kiểm tra tính toàn vẹn...' : '🔍 Calling AI for integrity verification...');

      const result = await aiVerifyCard(
        card,
        exportCard,
        proxy,
        translationConfig.targetLanguage,
        translationConfig.mvuDictionary
      );

      setVerifyResult(result);
      addLog(result.errors > 0 ? 'error' : 'success',
        `AI Verify: ${result.errors} errors, ${result.warnings} warnings, ${result.info} info`
      );
      addToast(
        result.errors > 0 ? 'error' : 'success',
        isVi
          ? `Kiểm tra xong: ${result.errors} lỗi, ${result.warnings} cảnh báo`
          : `Verified: ${result.errors} errors, ${result.warnings} warnings`
      );
    } catch (err) {
      addToast('error', `AI Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsVerifying(false);
    }
  }, [card, getExportCard, proxy, translationConfig, addToast, addLog, isVi]);

  // Early return AFTER all hooks
  if (!card || !hasTranslations) return null;

  return (
    <div className="card fade-in" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-primary)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            {isVi ? 'Kiểm Tra Tính Toàn Vẹn' : 'Integrity Verification'}
          </h3>
        </div>
        {verifyResult && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {verifyResult.errors > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700,
                background: 'rgba(255,82,82,0.1)', color: 'var(--accent-danger)',
              }}>
                {verifyResult.errors} {isVi ? 'lỗi' : 'errors'}
              </span>
            )}
            {verifyResult.warnings > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700,
                background: 'rgba(240,196,106,0.1)', color: 'var(--accent-warning)',
              }}>
                {verifyResult.warnings} {isVi ? 'cảnh báo' : 'warnings'}
              </span>
            )}
            {verifyResult.totalIssues === 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 700,
                background: 'rgba(76,175,80,0.1)', color: 'var(--accent-success)',
              }}>
                ✅ {isVi ? 'Đạt' : 'Pass'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        {isVi
          ? 'Kiểm tra xem các biến MVU/Zod, macro {{getvar::}}, EJS template, data-var attributes, CSS class/id có bị hỏng sau dịch không.'
          : 'Check if MVU/Zod variables, {{getvar::}} macros, EJS templates, data-var attributes, CSS classes/IDs are broken after translation.'}
      </p>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className="btn btn-secondary"
          onClick={handleQuickVerify}
          disabled={isVerifying}
          style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
        >
          {isVerifying && verifyMode === 'quick'
            ? <><Loader2 size={14} className="spin" /> {isVi ? 'Đang kiểm tra...' : 'Checking...'}</>
            : <><Zap size={14} /> {isVi ? 'Kiểm Tra Nhanh' : 'Quick Verify'}</>
          }
        </button>
        <button
          className="btn btn-primary"
          onClick={handleAIVerify}
          disabled={isVerifying}
          style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem' }}
        >
          {isVerifying && verifyMode === 'ai'
            ? <><Loader2 size={14} className="spin" /> {isVi ? 'AI đang phân tích...' : 'AI analyzing...'}</>
            : <><Eye size={14} /> {isVi ? 'AI Kiểm Tra Sâu' : 'AI Deep Verify'}</>
          }
        </button>
      </div>

      {/* System References Stats */}
      {refStats && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '12px',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            {isVi ? 'Tham chiếu hệ thống:' : 'System references:'} {refStats.total}
          </span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            {Object.entries(refStats.types).map(([type, count]) => (
              <span key={type} style={{
                padding: '1px 6px',
                borderRadius: '8px',
                background: 'rgba(124,106,240,0.08)',
                fontSize: '0.6rem',
              }}>
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verify Result */}
      {verifyResult && (
        <div style={{ marginTop: '4px' }}>
          {/* Summary */}
          <div style={{
            padding: '10px 12px',
            background: verifyResult.errors > 0 ? 'rgba(255,82,82,0.05)' : 'rgba(76,175,80,0.05)',
            border: `1px solid ${verifyResult.errors > 0 ? 'rgba(255,82,82,0.15)' : 'rgba(76,175,80,0.15)'}`,
            borderRadius: 'var(--radius-md)',
            marginBottom: '12px',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
          }}>
            {verifyResult.summary}
          </div>

          {/* Issues List */}
          {verifyResult.issues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '400px', overflowY: 'auto' }}>
              {verifyResult.issues.map(issue => {
                const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info;
                const Icon = cfg.icon;
                const isExpanded = expandedIssues.has(issue.id);

                return (
                  <div
                    key={issue.id}
                    style={{
                      border: `1px solid ${cfg.color}20`,
                      borderRadius: 'var(--radius-md)',
                      background: cfg.bg,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Issue Header */}
                    <div
                      onClick={() => toggleIssue(issue.id)}
                      style={{
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <Icon size={14} color={cfg.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <span style={{ color: cfg.color, marginRight: '6px' }}>[{issue.location}]</span>
                          {issue.description.slice(0, 120)}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div style={{
                        padding: '0 12px 10px',
                        fontSize: '0.7rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}>
                        {issue.description.length > 120 && (
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {issue.description}
                          </div>
                        )}
                        {issue.original && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--accent-danger)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                              Original:
                            </span>
                            <pre style={{
                              margin: '2px 0 0',
                              padding: '6px 8px',
                              background: 'rgba(0,0,0,0.05)',
                              borderRadius: 'var(--radius-sm)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              fontSize: '0.68rem',
                              maxHeight: '100px',
                              overflowY: 'auto',
                            }}>
                              {issue.original}
                            </pre>
                          </div>
                        )}
                        {issue.current && issue.current !== '(missing)' && issue.current !== '(missing or renamed)' && (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--accent-warning)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                              Current:
                            </span>
                            <pre style={{
                              margin: '2px 0 0',
                              padding: '6px 8px',
                              background: 'rgba(0,0,0,0.05)',
                              borderRadius: 'var(--radius-sm)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              fontSize: '0.68rem',
                              maxHeight: '100px',
                              overflowY: 'auto',
                            }}>
                              {issue.current}
                            </pre>
                          </div>
                        )}
                        {issue.suggestion && (
                          <div style={{
                            padding: '6px 8px',
                            background: 'rgba(76,175,80,0.06)',
                            border: '1px solid rgba(76,175,80,0.15)',
                            borderRadius: 'var(--radius-sm)',
                          }}>
                            <span style={{ fontWeight: 600, color: 'var(--accent-success)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                              💡 {isVi ? 'Gợi ý sửa:' : 'Suggested fix:'}
                            </span>
                            <div style={{ marginTop: '2px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              {issue.suggestion}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
