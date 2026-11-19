/* =========================================================
   chat.runtime.js —— 人-AI 对话 UI（纯前端，无编译）
   自写逻辑放 js/ ，外部库放 lib/ 或 CDN。
   命名：调度相关元素统一结构化命名，挂在 chatSched 下。
   ---------------------------------------------------------
   渲染策略：不做 Markdown，而是"有限标签白名单渲染"——
     AI 输出里仅允许少数可信标签(<b>/<em>/<code>/<br>/<a>/<img>…)
     真正变成网页元素，其余统统转义为纯文本，可防注入(算程加载)。
   ========================================================= */
const STREAM_LOGER = document.getElementById('loger-out');
const STREAM_CHAT = document.getElementById('chat-stream');
const STATUS_CHAT = document.getElementById('chat-hd-status');
const BUTTON_CHAT = document.getElementById('chat-cm-input');

import { GL_COMMAND, GL_EVENT } from './gl.modify.js';

/* =========================================================
   后端 → 前端 事件订阅：ChatCore.set_state 时后端 emit 的
   "chat_status" 事件，前端在此被动响应并更新头部状态文本。
   事件通道改用结构化 payload 而非 eval 注入，前后端天然解耦。
   ========================================================= */
GL_EVENT.listen('chat_status', (e) => {
    STATUS_CHAT.textContent = e.payload;
});

function init() {
   GL_COMMAND.invoke('client.set_state', { state: 'Online' });
}

init();