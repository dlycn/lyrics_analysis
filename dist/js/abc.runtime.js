const AbcRender = document.getElementById("abc-render");
const AbcInput = document.getElementById("abc-input");
const AbcAudio = document.getElementById("abc-audio");

const SOUNDFONT_URL = "http://asset.localhost/soundfonts/FatBoy/";

function initEditor() {
    new ABCJS.Editor("abc-input", {
        paper_id: "abc-render",
        synth: {
            el: "#abc-audio",
            options: {
                displayLoop: true,
                displayRestart: true,
                displayPlay: true,
                displayProgress: true,
                displayWarp: true,
                soundFontUrl: SOUNDFONT_URL
            }
        },
        generate_warnings: true
    });
}

window.addEventListener("load", initEditor, false);