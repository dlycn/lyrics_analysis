/* =========================================================
   gl.modify.js —— 全局外链点击处理
   拦截 WebView 内所有 <a> 外链点击,阻止默认导航,
   交给后端 open_url 命令用系统默认浏览器打开。
   (依赖 tauri.conf.json 里 withGlobalTauri: true)
   ========================================================= */

document.addEventListener("click", (e) => {
    const target = e.target.closest("a");
    // 只处理带 http/https 外链的 <a>
    if (target && target.href && /^https?:\/\//i.test(target.href)) {
        e.preventDefault(); // 阻止 WebView 默认行为
        const url = target.getAttribute("href");
        window.__TAURI__.core.invoke("open_url", { url });
    }
});