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

function renderAbc() {
    if (isRendering) return;
    abcString = abcCode.value.split("\n *").join("\n");
    isRendering = true;
    ABCJS.renderAbc("staff_area", abcString, {
        scale: 1.5,
        responsive: "resize",
    })
        isRendering = false;
}