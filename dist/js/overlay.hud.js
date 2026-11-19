import { GL_EVENT } from './gl.modify.js';
import { fx, STAT_NUM } from './overlay.pipeline.js';

const card = document.getElementById('ov-hud');
const label = document.getElementById('ov-status');
const btn = document.getElementById('ov-avatar');

// 后端来码(英文/中文)都能吃；'异常' 对应 Rust 侧 ChatState::Exception
const TEXT = { online: '在线', busy: '思考中', offline: '离线', error: '出错' };
const CODE = { 在线: 'online', 思考中: 'busy', 离线: 'offline', 出错: 'error', 异常: 'error' };

// 状态唯一入口：DOM 态 + 着色器 uniform 态一起切
function setState(code) {
  card.dataset.status = code;
  label.textContent = TEXT[code];
  fx.setStatus(STAT_NUM[code] ?? 0);
}

// 后端事件兜底：payload 可能是码也可能是文本(中文/英文都能吃)
GL_EVENT.listen('chat_status', (e) => {
  const raw = String(e.payload ?? '').trim();
  const code = CODE[raw] || (TEXT[raw] && raw) || '';
  if (code && TEXT[code]) {
    setState(code);                    // 正常状态码
  } else {
    label.textContent = raw;           // 纯文本照原样显示
  }
});

// 点击头像：切 busy + 推脉冲到着色器 + 双出口抛事件
const poke = () => {
  setState('busy');
  fx.poke();
  GL_EVENT.emit?.('avatar_click');
  document.dispatchEvent(new CustomEvent('ov:avatar-click'));
};

btn.addEventListener('click', poke);
btn.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); poke(); }
});

window.__ov = {
  setStatus: (code) => { if (TEXT[code]) setState(code); },
  say: (text) => { label.textContent = text; },
};