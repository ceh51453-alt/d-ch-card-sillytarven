import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n/useLocale';
import { testConnection, getModelSuggestions, getDefaultProxyUrl } from '../utils/apiClient';
import type { AIProvider } from '../types/card';
import {
  Settings,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Loader2,
  Zap,
  CircleDot,
} from 'lucide-react';

const PROVIDERS: { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'custom', label: 'Custom / Local' },
];

export default function ProxyConfig() {
  const { proxy, setProxy, connectionStatus, setConnectionStatus } = useStore();
  const t = useT();
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = getModelSuggestions(proxy.provider);

  const handleProviderChange = (provider: AIProvider) => {
    setProxy({
      provider,
      proxyUrl: getDefaultProxyUrl(provider),
      model: getModelSuggestions(provider)[0] || '',
    });
    setConnectionStatus('untested');
    setTestMessage('');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMessage('');
    try {
      const result = await testConnection(proxy);
      setConnectionStatus(result.ok ? 'connected' : 'failed');
      setTestMessage(result.message);
    } catch {
      setConnectionStatus('failed');
      setTestMessage('Unexpected error during test');
    }
    setTesting(false);
  };

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return <span className="badge badge-success"><Wifi size={10} /> {t.connected}</span>;
      case 'failed':
        return <span className="badge badge-danger"><WifiOff size={10} /> {t.failed}</span>;
      default:
        return <span className="badge badge-neutral"><CircleDot size={10} /> {t.notTested}</span>;
    }
  };

  return (
    <div className="section">
      <div className="section-header" onClick={() => {}}>
        <span className="section-title">
          <Settings size={16} style={{ color: 'var(--accent-primary)' }} />
          {t.apiConfiguration}
        </span>
        {statusBadge()}
      </div>
      <div className="section-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Provider */}
        <div>
          <label className="label">{t.aiProvider}</label>
          <select
            className="input"
            value={proxy.provider}
            onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Proxy URL */}
        <div>
          <label className="label">{t.apiBaseUrl}</label>
          <input
            className="input input-mono"
            value={proxy.proxyUrl}
            onChange={(e) => setProxy({ proxyUrl: e.target.value })}
            placeholder="http://localhost:8080/v1"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="label">{t.apiKey}</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input input-mono"
              type={showKey ? 'text' : 'password'}
              value={proxy.apiKey}
              onChange={(e) => setProxy({ apiKey: e.target.value })}
              placeholder="sk-..."
              style={{ paddingRight: '40px' }}
            />
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '4px',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '4px',
              }}
              type="button"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Model */}
        <div style={{ position: 'relative' }}>
          <label className="label">{t.model}</label>
          <input
            className="input input-mono"
            value={proxy.model}
            onChange={(e) => setProxy({ model: e.target.value })}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="gpt-4o"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                marginTop: '4px',
                maxHeight: '180px',
                overflowY: 'auto',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {suggestions.map((s) => (
                <div
                  key={s}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseDown={() => {
                    setProxy({ model: s });
                    setShowSuggestions(false);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Connection */}
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing || !proxy.proxyUrl}
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {testing ? t.testing : t.testConnection}
        </button>
        {testMessage && (
          <div
            style={{
              fontSize: '0.75rem',
              color: connectionStatus === 'connected' ? 'var(--accent-success)' : 'var(--accent-danger)',
              padding: '6px 8px',
              background: connectionStatus === 'connected'
                ? 'rgba(106,240,138,0.05)'
                : 'rgba(240,106,106,0.05)',
              borderRadius: 'var(--radius-sm)',
              wordBreak: 'break-word',
            }}
          >
            {testMessage}
          </div>
        )}

        {/* Advanced Settings */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              userSelect: 'none',
            }}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t.advancedSettings}
          </div>

          {showAdvanced && (
            <div
              className="fade-in"
              style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}
            >
              {/* Max Tokens */}
              <div>
                <label className="label">{t.maxTokensPerRequest}</label>
                <input
                  className="input"
                  type="number"
                  min={256}
                  max={32768}
                  value={proxy.maxTokens}
                  onChange={(e) => setProxy({ maxTokens: parseInt(e.target.value) || 4096 })}
                />
              </div>

              {/* Temperature */}
              <div>
                <label className="label">
                  {t.temperature}: {proxy.temperature.toFixed(1)}
                </label>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={proxy.temperature}
                  onChange={(e) => setProxy({ temperature: parseFloat(e.target.value) })}
                />
              </div>

              {/* Request Delay */}
              <div>
                <label className="label">{t.delayBetweenRequests}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  value={proxy.requestDelay}
                  onChange={(e) => setProxy({ requestDelay: parseInt(e.target.value) || 0 })}
                />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t.delayBetweenRequestsHint}
                </div>
              </div>

              {/* Retry Delay */}
              <div>
                <label className="label">{t.retryDelay}</label>
                <input
                  className="input"
                  type="number"
                  min={100}
                  max={30000}
                  step={100}
                  value={proxy.retryDelay}
                  onChange={(e) => setProxy({ retryDelay: parseInt(e.target.value) || 1000 })}
                />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t.retryDelayHint}
                </div>
              </div>

              {/* Request Timeout */}
              <div>
                <label className="label">{t.requestTimeout}</label>
                <input
                  className="input"
                  type="number"
                  min={5000}
                  max={600000}
                  step={1000}
                  value={proxy.requestTimeout}
                  onChange={(e) => setProxy({ requestTimeout: parseInt(e.target.value) || 60000 })}
                />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t.requestTimeoutHint}
                </div>
              </div>

              {/* Max Retries */}
              <div>
                <label className="label">{t.maxRetriesOnFailure}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10}
                  value={proxy.maxRetries}
                  onChange={(e) => setProxy({ maxRetries: parseInt(e.target.value) || 3 })}
                />
              </div>

              {/* Min Response Ratio */}
              <div>
                <label className="label">
                  {t.minResponseLengthRatio}: {(proxy.minResponseRatio * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={proxy.minResponseRatio}
                  onChange={(e) => setProxy({ minResponseRatio: parseFloat(e.target.value) })}
                />
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t.minResponseLengthRatioHint}
                </div>
              </div>

              {/* System Prompt Prefix */}
              <div>
                <label className="label">{t.systemPromptPrefix}</label>
                <textarea
                  className="input"
                  rows={3}
                  value={proxy.systemPromptPrefix}
                  onChange={(e) => setProxy({ systemPromptPrefix: e.target.value })}
                  placeholder={t.systemPromptPrefixPlaceholder}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
