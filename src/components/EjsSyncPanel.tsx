import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { detectEjsCard, extractEjsEntryNames, extractEjsKeywords, extractAllDecorators, aiTranslateEjsEntries } from '../utils/ejsSync';
import { Settings, Plus, Trash2, Wand2, Loader2, Search, Download, Upload, Shield, Zap, Hash, BookOpen, Eye } from 'lucide-react';

export default function EjsSyncPanel() {
  const { card, translationConfig, setTranslationConfig, locale, proxy, addToast } = useStore();
  const t = useT();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [activeTab, setActiveTab] = useState<'entries' | 'keywords' | 'decorators'>('entries');
  const [isAutoTranslating, setIsAutoTranslating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isVi = locale === 'vi';

  const { enableEjsSync, ejsDecoratorPreserve } = translationConfig;
  const ejsEntryNameDict = translationConfig.ejsEntryNameDict || {};
  const ejsKeywordDict = translationConfig.ejsKeywordDict || {};

  if (!card) return null;

  // ─── EJS Detection Summary (only scan when enabled to avoid crashes) ───
  const ejsDetection = useMemo(() => {
    if (!enableEjsSync) return { isEjs: false, confidence: 0, ejsBlockCount: 0, entryWithEjsCount: 0, hasGetwi: false, hasDefine: false, hasGetChatMessages: false, hasExecute: false, hasDecorators: false, reasons: [] };
    try { return detectEjsCard(card); } catch { return { isEjs: false, confidence: 0, ejsBlockCount: 0, entryWithEjsCount: 0, hasGetwi: false, hasDefine: false, hasGetChatMessages: false, hasExecute: false, hasDecorators: false, reasons: [] }; }
  }, [card, enableEjsSync]);
  const ejsEntryRefs = useMemo(() => {
    if (!enableEjsSync) return [];
    try { return extractEjsEntryNames(card); } catch { return []; }
  }, [card, enableEjsSync]);
  const ejsKeywords = useMemo(() => {
    if (!enableEjsSync) return [];
    try { return extractEjsKeywords(card); } catch { return []; }
  }, [card, enableEjsSync]);
  const ejsDecorators = useMemo(() => {
    if (!enableEjsSync) return [];
    try { return extractAllDecorators(card); } catch { return []; }
  }, [card, enableEjsSync]);

  const toggleSync = () => setTranslationConfig({ enableEjsSync: !enableEjsSync });

  // ─── Entry Name Dict CRUD ───
  const addEntryName = () => {
    if (newKey.trim() && newValue.trim()) {
      setTranslationConfig({
        ejsEntryNameDict: { ...ejsEntryNameDict, [newKey.trim()]: newValue.trim() },
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeEntryName = (key: string) => {
    const next = { ...ejsEntryNameDict };
    delete next[key];
    setTranslationConfig({ ejsEntryNameDict: next });
  };

  const updateEntryName = (key: string, value: string) => {
    setTranslationConfig({ ejsEntryNameDict: { ...ejsEntryNameDict, [key]: value } });
  };

  // ─── Keyword Dict CRUD ───
  const addKeyword = () => {
    if (newKey.trim() && newValue.trim()) {
      setTranslationConfig({
        ejsKeywordDict: { ...ejsKeywordDict, [newKey.trim()]: newValue.trim() },
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const removeKeyword = (key: string) => {
    const next = { ...ejsKeywordDict };
    delete next[key];
    setTranslationConfig({ ejsKeywordDict: next });
  };

  const updateKeyword = (key: string, value: string) => {
    setTranslationConfig({ ejsKeywordDict: { ...ejsKeywordDict, [key]: value } });
  };

  // ─── Auto Extract + AI Translate ───
  const autoExtractAndTranslate = async () => {
    setIsAutoTranslating(true);
    try {
      const newEntryNames = ejsEntryRefs.map(r => r.name).filter(n => !(n in ejsEntryNameDict));
      const newKws = ejsKeywords.map(k => k.keyword).filter(k => !(k in ejsKeywordDict));

      if (newEntryNames.length === 0 && newKws.length === 0) {
        addToast('info', isVi ? 'Tất cả đã được map sẵn.' : 'All items already mapped.');
        return;
      }

      // Build EJS context
      const ejsContext = (card.data?.character_book?.entries || [])
        .filter((e: any) => e.content && /<%[\s\S]*?%>/.test(e.content))
        .map((e: any) => e.content)
        .join('\n\n')
        .slice(0, 3000);

      const { entryTranslations, keywordTranslations } = await aiTranslateEjsEntries(
        newEntryNames,
        newKws,
        translationConfig.targetLanguage,
        proxy,
        undefined,
        ejsContext,
      );

      const mergedEntries = { ...ejsEntryNameDict, ...entryTranslations };
      const mergedKws = { ...ejsKeywordDict, ...keywordTranslations };

      setTranslationConfig({ ejsEntryNameDict: mergedEntries, ejsKeywordDict: mergedKws });

      const addedE = Object.keys(entryTranslations).length;
      const addedK = Object.keys(keywordTranslations).length;
      addToast('success', isVi
        ? `Đã dịch ${addedE} entry names + ${addedK} keywords.`
        : `Translated ${addedE} entry names + ${addedK} keywords.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast('error', `AI translate failed: ${msg}`);
    } finally {
      setIsAutoTranslating(false);
    }
  };

  // ─── Auto Extract Only (no AI) ───
  const autoExtractOnly = () => {
    let added = 0;
    const nextEntries = { ...ejsEntryNameDict };
    for (const ref of ejsEntryRefs) {
      if (!(ref.name in nextEntries)) {
        nextEntries[ref.name] = '';
        added++;
      }
    }
    const nextKws = { ...ejsKeywordDict };
    for (const kw of ejsKeywords) {
      if (!(kw.keyword in nextKws)) {
        nextKws[kw.keyword] = '';
        added++;
      }
    }
    if (added > 0) {
      setTranslationConfig({ ejsEntryNameDict: nextEntries, ejsKeywordDict: nextKws });
      addToast('success', isVi ? `Đã thêm ${added} items mới.` : `Added ${added} new items.`);
    } else {
      addToast('info', isVi ? 'Tất cả đã có sẵn.' : 'All items already exist.');
    }
  };

  // ─── Import / Export ───
  const exportDict = () => {
    const data = JSON.stringify({ ejsEntryNameDict, ejsKeywordDict }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ejs-sync-dict.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDict = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.ejsEntryNameDict) {
          setTranslationConfig({ ejsEntryNameDict: { ...ejsEntryNameDict, ...data.ejsEntryNameDict } });
        }
        if (data.ejsKeywordDict) {
          setTranslationConfig({ ejsKeywordDict: { ...ejsKeywordDict, ...data.ejsKeywordDict } });
        }
        addToast('success', isVi ? 'Import thành công!' : 'Import successful!');
      } catch {
        addToast('error', isVi ? 'File JSON không hợp lệ.' : 'Invalid JSON file.');
      }
    };
    input.click();
  };

  // ─── Filter ───
  const currentDict = activeTab === 'entries' ? ejsEntryNameDict : ejsKeywordDict;
  const filteredEntries = Object.entries(currentDict || {}).filter(([k, v]) =>
    !searchQuery || k.toLowerCase().includes(searchQuery.toLowerCase()) || (v || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const entryCount = Object.keys(ejsEntryNameDict).length;
  const kwCount = Object.keys(ejsKeywordDict).length;
  const totalCount = entryCount + kwCount;
  const translatedCount = Object.values(ejsEntryNameDict).filter(v => v.trim()).length +
    Object.values(ejsKeywordDict).filter(v => v.trim()).length;

  return (
    <div className="config-section" style={{ borderLeft: enableEjsSync ? '3px solid var(--color-info)' : undefined }}>
      {/* ─── Header ─── */}
      <div
        className="config-section-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <Settings size={16} style={{ color: 'var(--color-info)' }} />
        <span style={{ fontWeight: 600 }}>
          {isVi ? 'Chiến Lược C (Đồng bộ EJS)' : 'Strategy C (EJS Sync)'}
        </span>

        {/* Toggle */}
        <label className="toggle-switch" style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={enableEjsSync} onChange={toggleSync} />
          <span className="slider"></span>
        </label>

        {/* Badge */}
        {totalCount > 0 && (
          <span className="badge badge-info" style={{ fontSize: 11 }}>
            {translatedCount}/{totalCount}
          </span>
        )}
      </div>

      {isExpanded && enableEjsSync && (
        <div className="config-section-body" style={{ padding: '12px 16px' }}>
          {/* ─── EJS Detection Banner ─── */}
          <div style={{
            background: ejsDetection.isEjs ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Zap size={14} />
            <span>
              {ejsDetection.isEjs ? (
                <>
                  <strong>EJS card detected</strong> — {ejsDetection.ejsBlockCount} blocks, {ejsDetection.entryWithEjsCount} entries with EJS
                  {ejsDetection.hasGetwi && ', getwi()'}
                  {ejsDetection.hasDefine && ', define()'}
                  {ejsDetection.hasDecorators && ', decorators'}
                </>
              ) : (
                <>{isVi ? 'Không phát hiện EJS trong card này.' : 'No EJS detected in this card.'}</>
              )}
            </span>
          </div>

          {/* ─── Action Buttons ─── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={autoExtractOnly} title="Extract entry names + keywords (no AI)">
              <Search size={13} /> {isVi ? 'Quét' : 'Scan'}
            </button>
            <button
              className="btn btn-sm btn-accent"
              onClick={autoExtractAndTranslate}
              disabled={isAutoTranslating}
              title="Scan + AI translate"
            >
              {isAutoTranslating ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />}
              {isVi ? 'Quét + Dịch AI' : 'Scan + AI Translate'}
            </button>
            <button className="btn btn-sm" onClick={exportDict} title="Export dictionaries">
              <Download size={13} />
            </button>
            <button className="btn btn-sm" onClick={importDict} title="Import dictionaries">
              <Upload size={13} />
            </button>
          </div>

          {/* ─── Decorator Preserve Toggle ─── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
            <Shield size={14} style={{ color: 'var(--color-info)' }} />
            <span>{isVi ? 'Bảo vệ Decorators (@@, [GENERATE:], @INJECT)' : 'Protect Decorators'}</span>
            <label className="toggle-switch" style={{ marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={ejsDecoratorPreserve}
                onChange={() => setTranslationConfig({ ejsDecoratorPreserve: !ejsDecoratorPreserve })}
              />
              <span className="slider"></span>
            </label>
          </div>

          {/* ─── Tabs ─── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              className={`btn btn-xs ${activeTab === 'entries' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('entries')}
            >
              <BookOpen size={12} /> Entry Names ({entryCount})
            </button>
            <button
              className={`btn btn-xs ${activeTab === 'keywords' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('keywords')}
            >
              <Hash size={12} /> Keywords ({kwCount})
            </button>
            <button
              className={`btn btn-xs ${activeTab === 'decorators' ? 'btn-primary' : ''}`}
              onClick={() => setActiveTab('decorators')}
            >
              <Eye size={12} /> Decorators ({ejsDecorators.length})
            </button>
          </div>

          {/* ─── Search ─── */}
          {activeTab !== 'decorators' && (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: 8, opacity: 0.5 }} />
              <input
                type="text"
                className="input input-sm"
                style={{ paddingLeft: 28, width: '100%' }}
                placeholder={isVi ? 'Tìm kiếm...' : 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* ─── Dictionary Table (Entries / Keywords) ─── */}
          {activeTab !== 'decorators' && (
            <>
              <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 8 }}>
                {filteredEntries.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
                    {isVi ? 'Chưa có dữ liệu. Nhấn "Quét" để bắt đầu.' : 'No data. Click "Scan" to start.'}
                  </div>
                ) : (
                  <table className="dict-table" style={{ width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40%' }}>Original</th>
                        <th style={{ width: '40%' }}>{isVi ? 'Dịch' : 'Translated'}</th>
                        <th style={{ width: '20%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map(([key, value]) => (
                        <tr key={key}>
                          <td style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{key}</td>
                          <td>
                            <input
                              type="text"
                              className="input input-xs"
                              value={value}
                              onChange={(e) =>
                                activeTab === 'entries'
                                  ? updateEntryName(key, e.target.value)
                                  : updateKeyword(key, e.target.value)
                              }
                              style={{ width: '100%', fontSize: 11 }}
                              placeholder="..."
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-xs btn-ghost"
                              onClick={() =>
                                activeTab === 'entries' ? removeEntryName(key) : removeKeyword(key)
                              }
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ─── Add Row ─── */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <input
                  type="text"
                  className="input input-sm"
                  placeholder="Original"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <input
                  type="text"
                  className="input input-sm"
                  placeholder={isVi ? 'Dịch' : 'Translated'}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }}
                  onKeyDown={(e) => e.key === 'Enter' && (activeTab === 'entries' ? addEntryName() : addKeyword())}
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={activeTab === 'entries' ? addEntryName : addKeyword}
                >
                  <Plus size={13} />
                </button>
              </div>
            </>
          )}

          {/* ─── Decorators View (Read-only) ─── */}
          {activeTab === 'decorators' && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {ejsDecorators.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
                  {isVi ? 'Không có decorator nào.' : 'No decorators found.'}
                </div>
              ) : (
                <table className="dict-table" style={{ width: '100%', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Decorator</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ejsDecorators.map((dec, i) => (
                      <tr key={i}>
                        <td>
                          <span className="badge badge-sm" style={{
                            background: dec.type === 'render' ? 'var(--color-success-bg)' :
                              dec.type === 'inject' ? 'var(--color-warning-bg)' :
                                dec.type === 'generate' ? 'var(--color-info-bg)' : 'var(--bg-secondary)',
                            fontSize: 10,
                          }}>
                            {dec.type}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>
                          {dec.line.slice(0, 60)}{dec.line.length > 60 ? '...' : ''}
                        </td>
                        <td style={{ fontSize: 10, opacity: 0.7 }}>{dec.foundIn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ─── Stats ─── */}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8, display: 'flex', gap: 12 }}>
            <span>📊 {isVi ? 'Entry Names' : 'Entry Names'}: {entryCount} ({Object.values(ejsEntryNameDict).filter(v => v.trim()).length} {isVi ? 'đã dịch' : 'translated'})</span>
            <span>🏷️ Keywords: {kwCount} ({Object.values(ejsKeywordDict).filter(v => v.trim()).length} {isVi ? 'đã dịch' : 'translated'})</span>
            <span>🛡️ Decorators: {ejsDecorators.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
