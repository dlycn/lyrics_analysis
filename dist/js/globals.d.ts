// 全局库类型声明：abcjs 与 midi 以 <script> 标签(UMD)挂到 window，
// 不走 import，因此用本文件手动补全编辑器提示。

interface Window {
  ABCJS: typeof ABCJS;
  MIDI: typeof MIDI;
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
