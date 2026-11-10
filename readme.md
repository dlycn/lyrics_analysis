# 🎼 ABC 指令工坊 — MIDI ↔ ABC 双工编辑器

> **翻译由人完成，应用只做"MIDI 全量呈现 + 指令机械翻译"。**
>
> 主链路：`mp3 → (basic-pitch) → MIDI → 本工具 → ABC 指令流 → abcjs 渲染 / 播放 / 导出`

---

## 🎯 这个工具解决什么

自动把 MIDI 转 ABC 的规则一定会做一堆**记谱决策**（量化到几连音、哪些音并成和弦、哪些音拆声部、
C# 还是 Db……）。决策一旦写进最终 ABC 就很难反推。

本工具把这些决策**交还给人**：

1. Rust 内核把 MIDI 解析成**保真事件表**（原始 tick、力度、音色、通道、轨道、CC、meta、歌词……），
   不做任何量化/合并/拆声部/拼写；
2. 人在事件表上**逐条下达 ABC 指令**（音符/休止/和弦/小节线/连音线/变音/声部/头部字段/歌词……）；
3. Rust 内核把指令流**机械地**翻译成 ABC 文本（只负责纯语法：同小节变音记忆、时值换算、
   不可表示时值用连音线拆分、禁止空行等）；
4. abcjs 实时渲染/播放；可再导出 ABC 或 MIDI（反向也可：打开 ABC → abcjs 转 MIDI → 进事件表）。

整个指令流带**来源标记**（每条指令记录来自哪个 MIDI 事件），随时可撤销/重做，
所以任意一步都可以回退重来，不存在"自动转换错了不可回退"的问题。

---

## 🧱 架构（性能/权威数据层在 Rust）

```
dist/index.html        界面骨架（三栏：MIDI 事件表 / ABC 指令流 / ABC 文本+渲染）
dist/js/editor.js      UI 控制器：事件表编辑、指令编辑、ABC 文本双向编辑、撤销重做
dist/js/player.js      abcjs 渲染 + 播放；MIDI 试听（本地 SoundFont 采样）
dist/js/midi-view.js   纯视图换算（tick ↔ 小节:拍、时值分数、指令流时间轴）
dist/js/tauri-core.js  前端 → Rust 命令的唯一通道
dist/js/libs/          第三方库 → ES 模块的中介层（loader / abcjs / midi）
dist/lib/              第三方文件原样放置（abcjs-basic-min.js / midi.min.js）

src/midi.rs    MIDI → 保真事件表 MidiDoc；音符编辑/删除；事件表导出 .mid
src/abc.rs     人工下达的 ABC 指令流 → ABC 文本（纯语法翻译，不做音乐推断）
src/abc_parse.rs  ABC 文本 → 指令流（ABC 面板直接编辑的反向解析）
src/lib.rs     Tauri 命令 + 会话文档存储（DocStore）+ 本地 SoundFont 协议 sf://
src/bin/abclyrics_cli.rs   无界面 CLI（自动化测试/批处理）
```

### 第三方库中介层（dist/lib → dist/js/libs）

`dist/lib/` 只放第三方文件原样（升级时整文件替换，不改）；`dist/js/libs/` 是它们到 ES 模块的中介层。
**自研模块只 import 中介层，不直接碰 `window.ABCJS` / `window.MIDI`。**

| 文件 | 作用 |
|------|------|
| `dist/js/libs/loader.js` | 经典脚本加载器：浏览器动态注入 `<script>`（若页面已有同源旧标签则复用）/ Node 测试走 `createRequire`；带缓存、超时、接口校验 |
| `dist/js/libs/abcjs.js` | ABCJS 中介：top-level await 后 `ABCJS` 一定可用；并把易踩的接口整形好——`renderAbc` 统一收元素/选择器、`abcToMidiBytes` 统一返回 `Uint8Array`、`createSynth` / `supportsAudio` |
| `dist/js/libs/midi.js` | MIDI.js 中介（老库，主链路已不用）：按需加载，Node 下明确拒绝 |
| `dist/js/libs/index.js` | 统一出口；新增第三方库 = 加一个同名中介 + 这里补一行 export |

好处：第三方文件不用改成模块也能被 `import`；加载顺序、重复加载、环境差异（Tauri WebView / Node 测试）
全收在这一层；换版本时接口校验会在加载那一刻报"缺哪个 API"，而不是业务代码深处拿到 `undefined`。

```html
<!-- index.html 只需要模块入口，不再手工挂第三方 <script> -->
<script type="module" src="./js/editor.js"></script>
```

（迁移期兼容：页面里若还留着 `./lib/abcjs-basic-min.js` 旧标签，loader 会检测并直接复用，不会重复注入。）

### 为什么播放不需要 FluidSynth

`assets/soundfonts/FluidR3_GM/<instrument>-mp3/<note>.mp3` 正好是 abcjs synth
默认音源（midi-js-soundfonts）的目录结构。Rust 侧注册了 `sf://` 自定义协议把该目录映射出去，
abcjs synth 直接离线取本地音源；MIDI 试听也复用同一套采样（WebAudio + 播放速率变调）。

> `assets/` 体积约 2.5 GB 且被 `.gitignore` 排除。换机器时用环境变量
> `ABCLYRICS_SOUNDFONT_DIR` 指向 `soundfonts` 目录，或放到
> `assets/soundfonts/`（`cargo tauri dev` 时也会在 manifest 目录下自动找）。

---

## 🚀 使用流程

1. **打开 MIDI**（或"示例 MIDI"；也可以 mp3 先过 basic-pitch 生成 MIDI）
2. 左侧事件表查看/筛选/试听：`#`、小节:拍、tick、轨道、通道、音高、时值、力度、音色、详情；
   **事件表可编辑**：选中音符后可改音高/起点/时值/力度（Rust 内核写回），或直接删除音符
3. **新建指令文档**：头部字段（X/T/M/L/Q/K/V）按当前上下文生成，之后逐条修改
4. 选中事件 → `Enter` / "插入音符命令"：
   - 默认开启"自动补休止对齐"：ABC 时间轴会先用休止符补到该事件的 tick，保证与 MIDI 对齐；
   - 若该 tick 已有同起点同时值的音符，会自动**并入和弦**而不是再追加一个音；
   - 还可用"插入休止到该位置"手动补齐空拍
5. 中间指令流逐条编辑（音名/八度/变音/时值/连音线/和弦/小节线/歌词/指令/注释/片段），
   上移/下移/复制/删除，Ctrl+Z / Ctrl+Y 撤销重做
6. **ABC 文本可直接编辑**：改完 `Ctrl+Enter`（或点"应用 ABC 修改"）由 Rust 解析回指令流；
   右侧同时有五线谱渲染、播放、导出 `.abc` / `ABC→MIDI`
7. **打开 ABC**（反向）：abcjs 把 ABC 转成 MIDI → Rust 解析成事件表，便于核对/继续编辑
8. **保存 MIDI（事件表）**：把编辑后的音符事件表（含音色/CC/meta）导出为 `.mid`

面板里的 `K/M/L` 只是**上下文参考**（影响小节:拍显示、时值参考、默认拼写种子），
改它们**不会**自动改动已有指令；点"写入头部"才会把值写进 M/L/K 头部字段。

---

## 🧪 测试

```bash
# Rust 内核单测（解析器/翻译器/SoundFont 协议）
cargo test -p abclyrics

# 端到端：Rust CLI + abcjs 往返（需要先构建 CLI）
cargo build -p abclyrics --bin abclyrics_cli
node server/abclyrics/test/run-tests.js

# 无 GUI 界面冒烟（需要 npm i playwright-core + 系统 Edge）
node server/abclyrics/test/ui-smoke.js   # 浏览器冒烟：test/out/ui-smoke.png

# 灰度/生产构建验收（真实 release exe + 生产 CSP + sf:// 本地音源）
# 先 cargo tauri build，再：
node server/abclyrics/test/gray-release.js   # 输出 test/out/gray-release.png
```

中介层（与 Rust 无关，纯前端）：

```bash
# Node 单测：UMD→CJS 加载、接口校验、ABC→MIDI、错误路径
node --test server/abclyrics/test/mediator.test.mjs

# 浏览器冒烟：Edge headless 走"ES module → 动态注入 dist/lib"及"复用旧标签"两条真实路径
node server/abclyrics/test/mediator-browser-smoke.mjs   # 截图 test/out/mediator-browser.png
```

测试覆盖：

- 中介层：UMD→ES 模块加载（浏览器动态注入 / 复用旧 `<script>` / Node `createRequire`）、
  接口校验、ABC→MIDI 生成 `MThd` 字节、缺文件/缺 API/Node 下的明确报错
- MIDI 解析保真度：5 首真实曲目 fixture（含 running status、多轨、元事件、noteOn↔音符回指）
- MIDI 编辑/导出：改音高/起点/力度后导出 `.mid`，重新解析一致、事件回指仍成立
- 指令翻译纯语法：变音记忆/还原（含 K:G 等带调号情形）、5/16 → 连音线拆分、空行禁止、和弦
- ABC 文本↔指令流：parse-abc 解析、序列化往返文本稳定、三连音/装饰/和弦标注保留为 inline
- 往返：指令流 → ABC → abcjs → MIDI → 再解析，音高/起点/时值一致
- UI：页面无异常、事件表渲染、补休止对齐、并入和弦、MIDI 编辑、ABC 直接编辑、SVG、撤销
- 灰度（release + 生产 CSP）：无 CSP 违规、真实 IPC、sf:// 本地音源播放

---

## 📁 目录结构

```
abclyrics/
├── dist/                    # 前端产物（Tauri frontendDist，无构建步骤）
│   ├── index.html
│   ├── js/                  # editor.js / player.js / midi-view.js / tauri-core.js
│   │   └── libs/            # 中介层：loader.js / abcjs.js / midi.js / index.js
│   └── lib/                 # 第三方文件原样放置：abcjs-basic-min.js / midi.min.js
├── src/
│   ├── midi.rs              # MIDI → 保真事件表；音符编辑；导出
│   ├── abc.rs               # ABC 指令流 → ABC 文本
│   ├── abc_parse.rs         # ABC 文本 → 指令流（直接编辑反向解析）
│   ├── lib.rs               # Tauri 命令 + 会话 DocStore + sf:// SoundFont 协议
│   ├── main.rs
│   └── bin/abclyrics_cli.rs # 无界面 CLI
├── assets/                  # 曲谱库 + 本地音源（gitignore，约 2.5 GB）
│   ├── lyrics/              # ABC 曲谱（.md 内为纯 ABC）
│   └── soundfonts/FluidR3_GM/<instrument>-mp3/<note>.mp3
├── test/
│   ├── fixtures/            # 真实曲目 MIDI fixtures
│   ├── mediator.test.mjs    # 中介层 Node 单测（UMD→ES 模块、接口校验、错误路径）
│   ├── mediator-browser*.html + mediator-page-check.mjs + mediator-browser-smoke.mjs  # 中介层浏览器自检
│   ├── run-tests.js         # 端到端测试（Rust CLI + abcjs）
│   ├── ui-smoke.js          # 无 GUI 界面冒烟
│   └── gray-release.js      # 灰度验收（release exe + 生产 CSP + CDP）
├── docs/                    # ABC 标准文档 / 字段速查
├── Cargo.toml
├── tauri.conf.json
├── cmd_debug.ps1            # cargo tauri dev + 复制 exe
└── cmd_build.ps1            # cargo tauri build + 复制 exe
```

---

## ⚠️ 已知限制（都是"刻意不做"或"待做"的分界）

- **不做**自动量化、自动和弦合并、自动声部拆分、自动拼写、一键全曲转 ABC（这些是人的决策）；
  仅有的"合并"是插入时同起点同时值的两个事件并入和弦（机械规则，可在插入前关掉对齐）
- MIDI 事件表编辑目前覆盖音符级（音高/起点/时值/力度/删除）；program/CC/meta 等非音符事件只读
- 三连音/连音组等特殊节奏：ABC 文本里直接写 `(3` 等语法，或指令流用"＋片段"（保留为 inline）
- 力度/踏板：事件表里保真可见并可导出；ABC 核心语法没有精确位置，需要时用注释/%%指令承载
- 播放音源依赖本机 `assets/soundfonts`（gitignore）；缺失时播放会报错提示，不影响编辑
- 跨小节的可表示性由人在下令时处理（工具会做连音线拆分，但不会替你决定小节切分）

---

## 📝 License

MIT
