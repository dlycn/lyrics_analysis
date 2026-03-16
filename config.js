const CONFIG = {
  selectors: {
    startBtn: '#start',
    saveBtn: '#save',
    textarea: '#abc_codes',
    staffArea: '#staff_area',
  },
};

const startBtn = document.querySelector(CONFIG.selectors.startBtn);
const saveBtn = document.querySelector(CONFIG.selectors.saveBtn);
const abcCode = document.querySelector(CONFIG.selectors.textarea);
const staffArea = document.querySelector(CONFIG.selectors.staffArea);

let isActive = true;
let isSaving = false;
let isRendering = false;

startBtn.classList.add('active');

startBtn.addEventListener('click', function() {
    isActive = !isActive;
    if (isActive) {
        renderAbc();
        startBtn.classList.add('active');
    } else {
        startBtn.classList.remove('active');
    }
});

saveBtn.addEventListener('click', function() {
    if (isSaving) return;
    saveBtn.classList.add('active');
    isSaving = true;
    abcString = abcCode.value.split("  ").join("");
    if (abcString.length > 0){
        const d = new Date();
        time = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}_${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}`
        // 创建 Blob 对象（文件内容）
        const blob = new Blob([abcString], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        // 创建隐藏的下载链接
        const a = document.createElement('a');
        a.href = url;
        a.download = 'abc_' + time + '.txt';      // 默认文件名（用户可修改）
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    saveBtn.classList.remove('active');
    isSaving = false;
});



abcCode.addEventListener('input', function() {
    if (!isActive) return;
    renderAbc();
});

function renderAbc() {
    if (isRendering) return;
    abcString = abcCode.value.split("  ").join("");
    isRendering = true;
    ABCJS.renderAbc("staff_area", abcString, {
        scale: 1.5,
        responsive: "resize",
    })
        isRendering = false;
}