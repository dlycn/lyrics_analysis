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

    let abcString = abcCode.value.split("  ").join("");
    if (abcString.length > 0) {
        fetch('/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'   // 告诉服务器发送的是纯文本
            },
            body: abcString
        })
        .then(response => {
            if (response.ok) {
                alert('文件已保存');
            } else {
                alert('保存失败');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('保存出错');
        })
        .finally(() => {
            saveBtn.classList.remove('active');
            isSaving = false;
        });
    } else {
        saveBtn.classList.remove('active');
        isSaving = false;
    }
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