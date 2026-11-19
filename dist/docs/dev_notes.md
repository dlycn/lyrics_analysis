# 开发笔记：外链 · 资源映射 · CSP · 构建启动

> 项目：abcmusic（Tauri 2，brownfield 无打包器，纯 HTML/JS）
> 记录本次排掉的关键坑与结论，方便回看。

---

## 1. 外链点击：Tauri 里点 `<a>` 默认不跳系统浏览器

**现象**：WebView 里点外链 `<a href="https://...">`，默认不打开系统浏览器。

**结论**
- 后端提供跨平台命令 `open_url`（依赖 `tauri-plugin-opener`，走系统 `Intent/默认浏览器`）：
  ```rust
  app.opener().open_url(url, None::<&str>)
  ```
- 前端用 `window.__TAURI__.core.invoke("open_url", { url })` 调用（brownfield 无 npm，必须开 `withGlobalTauri: true`）。
- 拦截逻辑独立在 `dist/js/gl.modify.js`：
  ```js
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a && a.href && /^https?:\/\//i.test(a.href)) {
      e.preventDefault();
      window.__TAURI__.core.invoke("open_url", { url: a.getAttribute("href") });
    }
  });
  ```

**注意**
- `target="_blank"` 在拦截方案下**无效**（WebView 没有新标签页，行为全靠 JS 兜底）。
- Tauri 2.12 的 `WebviewEvent` 枚举**没有 `NewWindow` 变体**（只有 `DragDrop`），不要尝试用 `on_webview_event` 接外链——会编译不过。

---

## 2. 插件安装流程（以 opener / fs / dialog 为例）

每个插件三步齐配，缺一不可：

1. **Cargo.toml** 加依赖，如 `tauri-plugin-opener` / `tauri-plugin-fs` / `tauri-plugin-dialog` = `version "2"`。
2. **src/lib.rs** 注册：`tauri::Builder::default().plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_fs::init())...`
3. **capabilities/default.json** 加权限：`"opener:default"`、`"fs:default"`、`"dialog:default"`。

> 侧记：`tauri-plugin-opener` 底层依赖叫 `open` 那个 crate（"用默认程序打开 URL/文件"的跨平台库），不是插件本体。
> 大括号名：装了插件就对应一条 `xxx:default` 权限；前端经 `window.__TAURI__.<模组>.xxx` 调用。

**按需取舍的插件**
- `clipboard-manager`：一般不用，WebView 原生剪贴板可用。
- `notification`：本地工具用不着，网页 `Notification` API 够。
- `shell`（跑系统命令）：安卓/移动端意义不大，不必装。
- SQL：后端自集成即可，不必用 `tauri-plugin-sql`。

---

## 3. bundle.resources 资源映射 —— 最容易踩的坑

**语义**：`"源glob": "目标(resource 相对路径)"`，源目录前缀会被**剥掉**。

```json
"resources": {
  "assets/lyrics/**/*": "lyrics",     // 拷到 resource/lyrics/…（assets/ 前缀没了）
  "assets/soundfonts/**/*": "soundfonts"
}
```

**误区**：这样会在包内生成 `resource/lyrics/`、`resource/soundfonts/`，而 runtime 若用 `http://asset.localhost/assets/soundfonts/...` **对不上 → 音源加载失败**（且 `assets/test.png` 这种不在 glob 内的根本不打包）。

**正确做法**：保留 `assets/` 前缀，让 URL 一致：
```json
"bundle": { "resources": { "assets/**/*": "assets" } }
```
于是：
| 源 | 包内 | asset.localhost URL |
|----|------|--------------------|
| `assets/lyrics/*.md` | `resource/assets/lyrics/*.md` | `…/assets/lyrics/…` |
| `assets/soundfonts/…` | `resource/assets/soundfonts/…` | `…/assets/soundfonts/…` |
| `assets/test.png` | `resource/assets/test.png` | `…/assets/test.png` |

同时 `assetProtocol.scope.allow` 设为 `$RESOURCE/assets/**/*`。

**要点**
- `bundle.resources` 只在**打包产物**生效；开发/源码跑走 `frontendDist`，资源本来在盘上，**有没有 bundle 都一样**（所以"本地能显示" ≠ "打包能显示"）。
- 资源目录 = **exe 所在目录的相对路径**（独立于 exe 本体）。

---

## 4. CSP 图片加载与 CDN

**现象**：外站图被拦，控制台报：
```
Loading image 'https://…' violates CSP: "img-src 'self' blob: data: asset: http://asset.localhost"
```

**结论**
- `img-src` 只放行列出的源，要加载 CDN 图就得把对应域名加进白名单：`img-src … https://<cdn域名>`。
- 域宽取舍：`https://*.com` 很宽（覆盖所有 `.com` 的子域），测试方便但发布需斟酌；可收窄成明确一两个域名。
- **最终采取**：`img-src … https://*.jsdelivr.net https://*.npmmirror.com`。
  - 用**注册域名** `*.jsdelivr.net` 比泛化顶层域名 `*.net` 更可控（`*.net` 太宽）。
  - `*.npmmirror.com` 精确盖住国内可达的阿里镜像。
  - 更严的做法是只写精确 `cdn.jsdelivr.net`（子域下并无更深层级，`*.cdn.jsdelivr.net` 并不比它有用）。

> **CSP 通配符语法（host-source）**：`*` 只能出现在**最左段**，或整体顶层 `*`。合法如 `https://*.net`（任意 .net 主机）、`https://*.jsdelivr.net`；**非法**如 `https://cdn.*.net`（中间段星号会被拒绝）。

**踩坑过的源（网络可达性问题，非必措置问题）**
- `i0.hdslb.com`（B 站）：因 `Referer` 触发**防盗链** 403；且它拒绝跨站引用，加白名单也没用。**结论：不走外部防盗链图，或走自己后端代理。**
- `cdn.jsdelivr.net`：国内网络常 `ERR_CONNECTION_RESET`（被重置），且被 WebView2 判为 tracker 刷 `Tracking Prevention` 告警。
- 改用 `registry.npmmirror.com`（阿里 npm 镜像，国内可达）后正常加载 ✅。

> **jsDelivr 子域速览**：`cdn.`（主资源入口）、`fastly./quantil./gcore.`（各网络供应商节点）、`data.`（统计 API）、`testing./beta.`（测试）、`www.`（官网）。同一注册域名用子域做**职责隔离**是常规做法。

**侧记——Referer/防盗链**
- 浏览器默认 `Referrer-Policy`（跨站子资源）= `strict-origin-when-cross-origin`（只发来源源）。
- `<meta name="referrer" content="no-referrer">` 可让本页发请求不带 Referer → 过防盗链判定（像"直达"）。
- 但**项目明确不访问外站**，故最终**不加** no-referrer，保持默认更安全。

**WebView2 Tracking Prevention**
- 把第三方判为 tracker 会禁止其读写 storage（console 告警）。
- 可加 `additionalBrowserArgs: "--disable-features=TrackingPrevention"` 关闭，但属收窄浏览器隐私保护，**默认不开**。

---

## 5. 构建与启动：cmd_build.bat

**问题**：直接从项目根 `start` exe，内部 CWD 在项目目录，而资源在 `target/release`，导致 `asset.localhost` 访不到 → "要关掉控制台自己去点"。

**修好的脚本**（关键与 `pushd` 切到资源目录 + 独立进程启动）：
```bat
@echo off
chcp 65001 >nul
echo build args start
cargo tauri build>test\build.log 2>&1
echo build args end
rem 切到资源目录再启动，避免 CWD 错误导致 asset 访不到
pushd "..\..\target\release"
start "abcmusic" "abcmusicbin.exe"
popd
echo running now
```

**要点**
- `pushd ..\..\target\release`：把 exe 的当前目录切到 `target/release`（资源所在）。
- `start "abcmusic" …`：独立进程启动，不挂在构建控制台上，构建窗口可随手关。
- **不要**只 `copy` 一个光杆 exe 到项目根去跑——资源不在旁边，asset 协议必挂。要么直接在 `target/release` 跑，要么 copy 时必须连资源目录一起带走。

---

## 6. 其它开发注意点（本次发现）

- `tauri.conf.json` 的 CSP / 资源 / 权限是**打包期配置**，改了必须重新 `cargo tauri build`。
- brownfield 前端要调 Rust 命令，必须 `"withGlobalTauri": true`（`app` 顶层键，不是 window 内）。
- 当前 `dist/index.html` 若手残删了 `<script type="module" src="js/abc.runtime.js">`，ABC 编辑器会不渲染，记得留。

---

## 7. ChatCore 状态系统：单一真源 + 事件推送（后端权威架构）

> 目标：状态唯一真源在 Rust，前端纯被动渲染；用事件推送取代 `eval`/手工 DOM 注入。
> 载体文件：`src/client.rs`、`src/lib.rs`、`dist/js/chat.runtime.js`、`dist/overlay.html`。

**结构**（`src/client.rs`）
```rust
pub struct ChatCore {
    state: RwLock<ChatState>, // 内部可变性：&self 就能写
    logger: String,
    app: AppHandle,           // 构造注入，flush 时可自洽 emit
}
```

**要点（踩过的坑）**
- **别用 `Option<AppHandle>` 包裹**：状态对象要主动 emit，直接构造注入 `AppHandle`（可 Clone），互操作不再需要第二份状态对象。
- **`RwLock` 内部可变性**：`set_state(&self)` 而非 `&mut self`。对象进 Tauri State 仓库后是全局共享一份，拿不到独占 `&mut`，用锁换"只读借用 + 可写"。
- **事件推送替代 eval**：`flush_status()` 里 `emit_to("main", "chat_status", text)`，前端 `listen('chat_status')` 被动更新 DOM；不再 `eval("…textContent=…")`，前后端解耦。
- **`unwrap_err()` 反模式**：`emit_to(...).unwrap_err()` 只有“发送失败”才不炸，成功了反而 panic。正确姿势：
  ```rust
  if let Err(e) = self.app.emit_to("main", "chat_status", text) {
      log::error!("chat_status 事件推送失败: {e}");
  }
  ```

**set_state 递归坑**
- 在 `set_state` 内部再写 `self.app.state::<ChatCore>().set_state(state)` —— 仓库里是**同一个对象**，等于自己调自己 → 无限递归。同一对象内直接改 `self.state` 即可，不要回头再“取”。

---

## 8. overlay 悬浮屏：无边框 / 透明 / 置顶 / 点击穿透

`tauri.conf.json` 加第二个窗口 `overlay`（320×64、无边框、透明、置顶、跳过任务栏、固定位），默认 `visible: false`；`setup` 里手动 show 并开穿透：

```rust
overlay.set_ignore_cursor_events(true); // 点击穿透：鼠标直接透到底层
overlay.show();
```

**要点**
- 穿透开着时鼠标点不到 overlay 里的控件；要操作它先关穿透（`set_overlay_passthrough(false)`）。
- 想让 main **和** overlay 都收到 `chat_status`，后端**不能只用 `emit_to("main", …)`**——定向投递只发指定窗口，overlay 是 label `"overlay"`，永远收不到。全局状态改 `emit("chat_status", …)` 广播，只有"专属某窗口的信号"才用 `emit_to`。
- 现在的 `probe_core` 命令就地验证了 `State<ChatCore>`（省略生命周期标注）能过宏展开与编译，可留作“无 `'_` 也能用 State”的活例。

---

## 9. Tauri 底层：State 生命周期省略 与 IPC 信封模型

**`State<'_, T>` 的 `'_` 可以省掉**
- RFC 2115（Elided Lifetimes in Paths）：函数签名里省略的路径生命周期按 `'_` 推断，`State<ChatCore>` 与 `State<'_, ChatCore>` 等价（已用 `cargo check` + 命令宏实测通过）。
- 命令宏把参数类型**原样抄进** `CommandArg::from_command(...)` 调用（`tauri-macros` 的 `wrapper.rs` 生成），宏不做深度类型解析，省掉 `'_` 对宏无影响。
- 文档/示例写 `'_` 是“借用语义显式化”的惯例，不是语法强制。

**`#[tauri::command]` 宏本质**
- 宏只生成一个壳函数，真正的参数注入靠 `CommandArg` trait：从 IPC 信封（`InvokeMessage`，含 `CommandItem`：plugin / name / key / message / acl）逐个提取参数；`State` / `AppHandle` 等走“从仓库取”，普通参数走“反序列化 payload”。
- 这也是"前端 `invoke` 为什么必须 `await`"的根源：IPC 本质是跨边界消息往返（JS 发请求 → Rust wrapper 执行 → 结果回传 → Promise resolve）。Rust 命令体是否 async 与前端是否 `await` 无关——传输层异步是必然。

**误区澄清**
- 事件（emit）同样要序列化、走同一管道，**不是“免费”的**；和 invoke 的开销差异只在往返次数（invoke 两程 vs emit 一程）与副本数（广播 N 窗口 = N 份）。
- **Tauri 2 不存在 `window.__TAURI__.command`**（那是 Tauri 1 时代的认知）。`withGlobalTauri: true` 暴露的全局对象里，命令调用是 `window.__TAURI__.core.invoke(...)`，事件订阅是 `window.__TAURI__.event.listen(...)`——`core` 而不是 `command`。曾因写成 `window.__TAURI__.command` 导致 `GL_COMMAND` 为 undefined，运行时炸在 `GL_COMMAND.invoke` 上。

---

## 10. 命令通道 vs 事件通道：分工表

| | invoke（请求-响应） | emit（事件推送） |
|--|:--:|:--:|
| 方向 | 前端主动，两程（下参数/上结果） | 后端主动，单程广播 |
| 语义 | 快照查询：问此刻真源，给当前值 | 变更通知：状态变了，喊一声 |
| 适用 | 初始化取快照 / 关键操作要“确认拿到了” | 持续同步 / 多窗口全量订阅 |
| 典型坏用法 | invoke 只为触发变更、又顺手取回 | —— |

- 初始化用 invoke 拿一次当前状态，之后状态变更全走事件（要“不遗漏”）。
- 用命令去模拟事件、或用事件去模拟查询，都会让语义拧巴——这是“任务繁杂度”的来源，而不是通道本身。

---

## 11. “服务式”文件加载：asset.localhost 三层干预

**底层认知**：`http://asset.localhost/...` 的请求被本进程协议处理器拦截，由 Rust 读文件当 HTTP 响应返回——**“服务器”就是 Rust 自己**，这是内建的本地 HTTP 语义（状态码 / Content-Type / body）。

- **零代码层（静态资源直接 fetch）**：`bundle.resources` 打进 `$RESOURCE` + `assetProtocol.scope.allow: ["$RESOURCE/**/*"]` 后，前端直接
  ```js
  const lrc = await (await fetch('http://asset.localhost/lyrics/孤勇者.md')).text();
  new Audio('http://asset.localhost/soundfonts/FatBoy/…/C4.mp3');
  ```
- **运行时落盘层（Rust 产出文件 → 前端来取）**：Rust 写 `app.path().app_data_dir()` → scope 加 `"$APPDATA/**/*"` → 写完后 `emit` 一个 `file_ready` 通知 → 前端 `listen` 后用 `convertFileSrc(absPath)` 把绝对路径转成 asset URL 再 fetch。磁盘是唯一跨进程持久真源，这一步不抽象。
- **自定义协议层（真·服务式路由）**：
  ```rust
  app.register_asynchronous_uri_scheme_protocol("lyricapi", move |ctx, _req, responder| {
      // 从 ctx.uri() 拿路径/参数，动态合成响应
      responder.respond(Response::new(bytes));
  });
  ```
  前端 `fetch('http://lyricapi.localhost/...')`，Rust 现场算响应，可做动态渲染 / 鉴权 / 不暴露目录。
- **信号直接传“文件”**：文本可以（字符串塞进 DOM 即可）；二进制浏览器不认“字符串=文件”，要么落盘走 URL，要么前端 `new Blob([…])` + `URL.createObjectURL()` 现场造 URL（只适合小数据；大音频/音色库别走 IPC 事件）。

---

## 12. 桌面“前置透明层”背景：无感、护眼、不挡操作

**核心矛盾**：overlay 是覆盖整个桌面前的透明层，它的装饰目的是“几乎不引起注意”，护眼目的是“长时间盯着不累”，但两件事都靠“低调”实现——**任何能感知到的色块/边框都是干扰**。灰度罩(`rgba(30,30,46,.55)`)最大的问题是：不透明度太高 → 变成“一块全屏糊住的灰膜”，比没有更糟。

**护眼色的原理（不是玄学）**
- 人眼对**高亮度、高对比、高冷色(蓝光)**最疲劳。护眼本质是两条路：降亮度、降蓝光。
- **降蓝光** → 用暖色(黄/橙)抵消蓝光，即“夜览/护眼模式”原理：色温从 ~6500K 降向 ~4000-5000K。
  `rgba(255, 184, 108, a)` 就是经典的暖白(约 4500K)背景近似色，配 `alpha` 很低即可。
- **降亮度/降对比** → 用更淡的灰而非更黑的膜。纯白/纯黑都是高对比，介于中间的豆沙色(如 #C7EDCC)饱和度低、亮度中，属于“低刺激中性色”。
- 注意“绿色对眼睛好”的**真相**：古老说法来自 CRT 时代护眼屏用绿底(“纸绿色”#C7EDCC，即豆沙绿)，原因是它同时做到低亮度+低蓝光+低对比，**不是绿色本身有魔力**。任何一个低饱和暖色/中性色都能达到同样的“低刺激”，且绿色作为全屏罩反而显得怪。

**本项目实测的典型值（只写 alpha，数值可当通用模板）**

| 想达到的感觉 | 典型写法 | alpha 范围 | 说明 |
|---|---|---|---|
| 几乎无感、略偏暖护眼 | `rgba(255, 184, 108, 0.06)` | 0.03-0.08 | **推荐**，只给屏幕“轻了一层蜜”，日常操作毫无打扰 |
| 略降亮度、中性不偏色 | `rgba(46, 46, 46, 0.08)` | 0.05-0.12 | 类似“关灯”前兆，护眼但**牺牲对比度** |
| 傍晚强烈暖色 | `rgba(255, 160, 80, 0.18)` | 0.15-0.25 | 深夜模式，低于 0.15 无感，高于 0.25 开始影响读文字 |
| 纯粹的背景氛围 | 豆沙绿 `#C7EDCC` | ≥ 0.5 | 适合“内容区铺底”，**不适合全屏透明罩** |

- **经验法则**：全屏透明罩的 alpha 上限是 **~0.15**。超过就会开始被感知成“滤镜”，干扰底下工作内容；0.03-0.08 是“存在但不存在”的甜区。
- **别加边框**：透明罩上那道白框(原 `rgba(255,255,255,.5)`)是“灰度膜感”的另一来源——它会吸走注意力且破坏透明悬浮感，`border: none` 之后整个层就“融化”进屏幕了。
- **文字可读性优先**：如果罩子变得很淡，白色文字(#fff)在亮背景上可能看不清——此时留给内容本身的颜色对比去解决，而不是加大罩子 alpha。这才是“无感”的完成形态。

---

## 13. overlay“质感”设计：拒绝“只调 alpha”的廉价悬浮感

**出发点**：只有降低 alpha 没有“AI 在前台运行”的实感。质感不来自“覆盖率”，来自**光线与层次**。

**可落地的质感武器（都保持低 alpha、不遮内容、不伤眼）**

| 手法 | CSS | 作用 |
|---|---|---|
| 品牌光晕 | `radial-gradient(ellipse ... rgb(紫/10%), transparent)` | 中心一团柔光，瞬时传达“这里有东西醒着” |
| HUD 网格 | `repeating-linear-gradient(90deg, rgb(255 255 255 / 2%) 0 1px, transparent 1px 28px)` | 1-2% 透明细线网格，精密仪器感 |
| 内发光 | `box-shadow: inset 0 0 56px rgba(紫/5%)` | 边缘光晕，比边框更柔和 |
| 发光呼吸点 | `box-shadow: 0 0 6px, 0 0 14px; @keyframes opacity .45→1` | LED 呼吸，经典的“引擎运行中” |

**本项目落地（overlay.html #ov-panel）**：品牌紫 `#7c3aed` 中心光晕 + 白色 2% 双轴细网格 + 内发光 + 状态字前加发光圆点 `::before`（含呼吸动画）。品牌紫与主窗口 chat 头像色（.chat-hd-ava `#7c3aed`）呼应，形成同一产品语系。

**避坑经验**
- **透明窗口做不了真毛玻璃**：`backdrop-filter: blur()` 只能模糊“本 WebView 内部位于其后的元素”，采样不到真正的桌面内容。在 Tauri 透明窗口上要么无效要么变黑——直接排抛弃幻想，用“自发光”替代“台后模糊”。
- **alpha 用百分比写，别写小数**：现代 CSS Color Level 4 支持 `rgb(124 58 237 / 8%)`、`rgb(255 255 255 / 2%)`，语义清晰且淘汰 `0.06` 这类别扭小数。
- **网格线的像素与间距经验值**：`0 1px, transparent 1px 28px` 即 1px 亮线 + 27px 空，观感最像设备网格；更细是 32px 间距，更粗 24px。