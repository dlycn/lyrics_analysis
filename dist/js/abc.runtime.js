const AbcRender = document.getElementById("abc-render");
const AbcInput = document.getElementById("abc-input");
const AbcEditor = document.getElementById("abc-editor");
var abclyrics = "";
var abcupdate = false;
AbcInput.addEventListener("input",abcstr_update);

async function abcstr_update() {
    let abcstring = AbcInput.value;
    if (abcstring == abclyrics || abcupdate) {return;}
    abcupdate = true;
    ABCJS.renderAbc(AbcRender,abcstring);
    abcupdate = false;
}


