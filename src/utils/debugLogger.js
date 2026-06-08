export function writeDebugLog(message) {
    console.log(`[ST-Debug] ${message}`);
    fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: `[${new Date().toISOString()}] ${message}`
    }).catch(() => { });
}
