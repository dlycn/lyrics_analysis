# 开发笔记：外链 · 资源映射 · CSP · 构建启动

> 项目：abclyrics（Tauri 2，brownfield 无打包器，纯 HTML/JS）
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
start "abclyrics" "abclyricsbin.exe"
popd
echo running now
```

**要点**
- `pushd ..\..\target\release`：把 exe 的当前目录切到 `target/release`（资源所在）。
- `start "abclyrics" …`：独立进程启动，不挂在构建控制台上，构建窗口可随手关。
- **不要**只 `copy` 一个光杆 exe 到项目根去跑——资源不在旁边，asset 协议必挂。要么直接在 `target/release` 跑，要么 copy 时必须连资源目录一起带走。

---

## 6. 其它开发注意点（本次发现）

- `tauri.conf.json` 的 CSP / 资源 / 权限是**打包期配置**，改了必须重新 `cargo tauri build`。
- brownfield 前端要调 Rust 命令，必须 `"withGlobalTauri": true`（`app` 顶层键，不是 window 内）。
- 当前 `dist/index.html` 若手残删了 `<script type="module" src="js/abc.runtime.js">`，ABC 编辑器会不渲染，记得留。