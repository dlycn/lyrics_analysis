/* =========================================================
   abc.runtime.js —— OOP 版
   用 class 封装长生命周期的 ABCJS.Editor:
   - 实例属性持有 DOM 引用与编辑器句柄(常驻整个页面生命周期)
   - 提供 init / destroy / setSoundFont 等外部可调接口
   ========================================================= */

const SOUNDFONT_PRE_URL = "http://asset.localhost/soundfonts/";

/**
 * 乐谱播放器:管理 ABCJS.Editor 的长生命周期
 */
class AbcPlayer {
    /** 私有字段声明(真正的长生命周期句柄,外部不可见/不可写) */
    #editor;
    /** 私有标记:IME 合成监听只挂一次(防止 #recreate 重复挂载) */
    #imeHooked = false;

    /**
     * @param {string} inputId  谱曲文本框元素 id
     * @param {string} renderId 渲染区元素 id
     * @param {string} audioId  音频控制条挂载元素 id
     * @param {string} warningsId 警告落脚元素 id
     */
    constructor(inputId, renderId, audioId, warningsId = "abc-warnings") {
        this.inputId = inputId;
        this.renderId = renderId;
        this.audioId = audioId;
        this.warningsId = warningsId;

        /** @type {import("ABCJS").Editor|null} 长生命周期句柄(私有,外部不可写) */
        this.#editor = null;

        this.soundFont = "FluidR3_GM";
    }

    /** 只读访问编辑器句柄(调试 / 读取用;外部无法改它) */
    get editor() {
        return this.#editor;
    }

    /** 确保编辑器只创建一次(幂等,绝不销毁)。
        长生命周期对象在这里诞生,之后一直复用实例句柄。 */
    init() {
        if (this.#editor) {
            return; // 已存在:不动,由内部 #recreate 决定是否重建
        }
        this.#editor = new ABCJS.Editor(this.inputId, {
            paper_id: this.renderId,
            warnings_id: this.warningsId,
            synth: {
                el: `#${this.audioId}`,
                options: {
                    displayLoop: true,
                    displayRestart: true,
                    displayPlay: true,
                    displayProgress: true,
                    displayWarp: true,
                    soundFontUrl: `${SOUNDFONT_PRE_URL}${this.soundFont}/`,
                },
            },
            generate_warnings: true,
        });
        this.#hookIme();
    }

    /** 给输入框挂 IME 合成结束监听:
        abcjs 只监听 change/失焦,中文输入法按 shift 提交后不会触发,
        导致"合成已提交、渲染却不变"。
        这里在 compositionend 后派发 change,让 abcjs 照常 fireChanged。
        只挂一次(#imeHooked 守卫)。 */
    #hookIme() {
        if (this.#imeHooked) {
            return;
        }
        const area = document.getElementById(this.inputId);
        if (!area) {
            return;
        }
        area.addEventListener("compositionend", () => {
            area.dispatchEvent(new Event("change", { bubbles: true }));
        });
        this.#imeHooked = true;
    }

    /** 切换音源目录。
        注意:soundFontUrl 是合成器初始化期选项(无 live setter),
        只能走 #recreate 整体重建——这是"换音源"特有的硬约束。
        日常参数变更(音量/速度等)请不要走这里。 */
    setSoundFont(lib) {
        this.soundFont = lib;
        this.#recreate();
    }

    /** 内部整体重建:仅用于 soundFontUrl 这类初始化期选项切换。
        = 释放旧句柄(#release) + 重新装载(init)。
        私有:外部不可调用,杜绝销毁句柄的逃逸风险。 */
    #recreate() {
        this.#release();
        this.init();
    }

    /** 内部释放:仅由 #recreate 调用。外部无法触达。 */
    #release() {
        this.#editor = null;
    }
}


/** 模块级单例:借助 ES Module 只求值一次,全站共享同一份播放器 */
let sharedPlayer = null;
/** 取全站唯一播放器实例(惰性:首次调用才 new) */
function setupPlayer(inputId = "abc-input", renderId = "abc-render", audioId = "abc-audio", warningsId = "abc-warnings") {
    if (!sharedPlayer) {
        sharedPlayer = new AbcPlayer(inputId, renderId, audioId, warningsId);
    }
    sharedPlayer.init();
    return sharedPlayer;
}

// —— 模块导出 ——
// 只暴露单例工厂,不导出 AbcPlayer 类:
// 外部拿不到构造器 → 无法 new 第二份,单例被真正封死。
export { setupPlayer };
export default setupPlayer; // 默认导出即是单例入口

/** 入口:用单例装载播放器,挂到全局便于控制台调试(保留入口副作用) */
function getAbcPlayer() {
    const player = setupPlayer("abc-input", "abc-render", "abc-audio");
    window.__abcPlayer = player;
}
window.addEventListener("load", getAbcPlayer, false);