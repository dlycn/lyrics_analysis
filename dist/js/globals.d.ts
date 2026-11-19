// 全局库类型声明：abcjs 与 midi 以 <script> 标签(UMD)挂到 window，
// 不走 import，因此用本文件手动补全编辑器提示。

/* =========================================================
   Tauri 2 全局对象（withGlobalTauri: true 注入 window.__TAURI__）
   注意与 Tauri 1 的差异：命令调用在 core 命名空间下，
   不存在 window.__TAURI__.command；事件订阅用 event.listen。
   ========================================================= */

/** Tauri 2 core 命名空间：命令调用 / Channel 等底层 IPC API */
interface TauriCore {
  /**
   * 调用 Rust 侧 #[tauri::command] 注册的命令。
   * @example invoke('client.set_state', { state: 'Online' })
   */
  invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: { headers?: Record<string, string> }
  ): Promise<T>;
}

/** 事件订阅处理器收到的信封结构 */
interface TauriEventPayload<T = unknown> {
  id: number;
  event: string;
  payload: T;
}

/** Tauri 2 event 命名空间：事件订阅与发射 */
interface TauriEvent {
  /** 订阅后端 emit 的事件，返回取消订阅函数 */
  listen<T = unknown>(
    event: string,
    handler: (event: TauriEventPayload<T>) => void | Promise<void>
  ): Promise<() => void>;
  /** 单次订阅，触发一次即自动取消 */
  once<T = unknown>(
    event: string,
    handler: (event: TauriEventPayload<T>) => void | Promise<void>
  ): Promise<() => void>;
  /** 发射事件（前端 → 后端） */
  emit(event: string, payload?: unknown): Promise<void>;
}

interface Window {
  ABCJS: typeof ABCJS;
  MIDI: typeof MIDI;
  /** withGlobalTauri: true 时注入——core 命令通道 / event 事件通道 */
  __TAURI__: {
    core: TauriCore;
    event: TauriEvent;
  };
}

/** 合成器播放相关选项 */
interface ABCSynthOptions {
  soundFontUrl?: string;
  displayLoop?: boolean;
  displayRestart?: boolean;
  displayPlay?: boolean;
  displayProgress?: boolean;
  displayWarp?: boolean;
}

/** 编辑器内嵌合成器配置 */
interface ABCSynth {
  el?: string | HTMLElement;
  options?: ABCSynthOptions;
}

/** ABCJS.Editor 构造参数 */
interface ABCJSEditorParams {
  /** 渲染乐谱的目标元素 id */
  paper_id?: string;
  /** 内嵌合成器（音序器/播放器）配置 */
  synth?: ABCSynth;
  /** 是否输出警告到控制台 */
  generate_warnings?: boolean;
}

/**
 * abcjs 全局命名空间（UMD 构建暴露）
 * 这里只覆盖本项目用到的部分，可按需补充。
 */
declare namespace ABCJS {
  class Editor {
    constructor(inputId: string, params?: ABCJSEditorParams);
  }
}

/**
 * midi.js 全局命名空间（UMD 构建暴露）。
 * 当前项目中暂未直接使用，保留最小编写以防止读取时报错。
 */
declare namespace MIDI {
  // TODO: 按实际使用补充（如 MIDI.loadPlugin / MIDI.Player 等）
}