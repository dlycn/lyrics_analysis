// 透明无边框窗打不开 DevTools,把 console 全量转存到本地文件。
// 后端 append_log 落盘在 app_log_dir/overlay.log,用于排查渲染管线故障。
const { invoke } = window.__TAURI__.core;

function fmt(a) {
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  if (a instanceof Promise) return '[Promise]';
  if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
  return String(a);
}

async function push(level, args) {
  const msg = args.map(fmt).join(' ');
  try { await invoke('append_log', { level, msg }); } catch { /* 后端未就绪就静默 */ }
}

// 包裹 console 全家桶:原样输出 + 转存文件
['log', 'info', 'warn', 'error'].forEach((lv) => {
  const raw = console[lv].bind(console);
  console[lv] = (...args) => { raw(...args); push(lv, args); };
});

// 页面级异常兜底:双出口收网,一个都别跑
window.addEventListener('error', (e) => push('error', ['error:', e.message, e.filename, e.lineno]));
window.addEventListener('unhandledrejection', (e) => push('error', ['unhandledrejection:', e.reason]));