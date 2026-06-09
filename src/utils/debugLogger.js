let logQueue = [];
let logTimeout = null;

function flushLogs() {
    if (logTimeout) {
        clearTimeout(logTimeout);
        logTimeout = null;
    }
    if (logQueue.length === 0) return;
    const messagesToFlush = logQueue.join('\n');
    logQueue = [];
    fetch('/api/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: messagesToFlush
    }).catch(() => { });
}

export function writeDebugLog(message) {
    console.log(`[ST-Debug] ${message}`);
    logQueue.push(`[${new Date().toISOString()}] ${message}`);
    if (logQueue.length >= 100) {
        flushLogs();
    } else if (!logTimeout) {
        logTimeout = setTimeout(flushLogs, 500);
    }
}

