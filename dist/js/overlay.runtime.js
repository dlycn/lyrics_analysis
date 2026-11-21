import { GL_COMMAND, GL_EVENT } from "./gl.modify.js";
import { boot } from '../js/overlay.pipeline.js';
const DevToolState = false;

GL_EVENT.listen('devtool_status', (e) => {
    DevToolState = e.payload;
});

GL_COMMAND.invoke('dev_tool');
boot();