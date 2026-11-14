const AbcRender = document.getElementById("abc-render");
const AbcInput = document.getElementById("abc-input");
const AbcEditor = document.getElementById("abc-editor");
const AbcPlayBtn = document.getElementById("abc-play");
const AbcStopBtn = document.getElementById("abc-stop");
const AbcPlayState = document.getElementById("abc-play-state");

const SOUNDFONT_URL = "asset://localhost/assets/soundfonts/FatBoy/";

var abclyrics = "";
var abcupdate = false;
var currentVisualData = null;
var synthControl = null;

AbcInput.addEventListener("input", abcstr_update);

async function abcstr_update() {
    let abcstring = AbcInput.value;
    if (abcstring == abclyrics || abcupdate) { return; }
    abcupdate = true;
    stopPlayback();
    const visualData = ABCJS.renderAbc(AbcRender, abcstring);
    currentVisualData = visualData;
    abclyrics = abcstring;
    abcupdate = false;
}

AbcPlayBtn.addEventListener("click", () => {
    if (!currentVisualData || currentVisualData.length === 0) {
        AbcPlayState.textContent = "暂无乐谱";
        return;
    }
    doPlay(currentVisualData[0]);
});

AbcStopBtn.addEventListener("click", stopPlayback);

async function doPlay(visual) {
    try {
        if (synthControl) {
            synthControl.disable(true);
            synthControl = null;
        }
        synthControl = new ABCJS.synth.SynthController();
        synthControl.load(
            AbcPlayState,
            null,
            { displayPlay: true, displayProgress: true, displayWarp: true }
        );
        let success = await synthControl.setTune(visual, false, {
            soundFontUrl: SOUNDFONT_URL,
            onProgress: (p) => { backupProgress(40 + p * 60); }
        });
        if (!success) {
            AbcPlayState.textContent = "音源不可用";
        }
    } catch (e) {
        AbcPlayState.textContent = "播放失败: " + e.message;
        console.error("abcjs play error:", e);
    }
}

function stopPlayback() {
    if (synthControl) {
        synthControl.disable(true);
        synthControl = null;
    }
    if (AbcPlayState) {
        AbcPlayState.textContent = "";
    }
}

function backupProgress(value) {
    console.log("progress:", value);
}