document.addEventListener('click', async function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href) return;
    if (!a.href.startsWith('http')) return;
    e.preventDefault();
    // 调用 Rust 命令
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        try {await window.__TAURI_INTERNALS__.invoke('open_url', { url: a.href });
        } catch (err) {
            console.error('打开链接失败:', err);
        }
    } else {
        window.open(a.href, '_blank');
    }
});