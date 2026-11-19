// 状态 -> uniforms.y 的数值档位(和 overlay.hud.js 保持一致)
export const STAT_NUM = { offline: 0, online: 1, busy: 2, error: 3 };

let device = null;
let context = null;
let pipeline = null;
let bindGroup = null;
let uniformBuf = null;

// 对齐 16 字节的 uniform 布局
const UNIFORM_F32 = 16;
const params = new Float32Array(UNIFORM_F32);
let canvas = null;

// 着色器独立成资源文件,这里是统一的语义入口
async function loadShader() {
  const r = await fetch('../scripts/overlay.render.wgsl');
  if (!r.ok) throw new Error(`WGSL ${r.status}`);
  return r.text();
}

export async function initFx() {
  canvas = document.getElementById('fx');

  let wgsl = '';
  try {
    wgsl = await loadShader();
  } catch (e) {
    console.warn('[ov] WGSL 资源加载失败,降级为 2D 静态背景', e);
    fallback2D(canvas);
    return false;
  }

  if (!navigator.gpu) {
    console.warn('[ov] WebGPU 不可用,降级为 2D 静态背景');
    fallback2D(canvas);
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.warn('[ov] 获取适配器失败,降级为 2D 静态背景');
    fallback2D(canvas);
    return false;
  }

  device = await adapter.requestDevice();
  context = canvas.getContext('webgpu');
  resize();

  // WebGPU 的管线/着色器错误是异步上报的,不挂监听会静默吞掉——
  // 症状就是"画面空白但日志零输出"。挂上,让它把话说全。
  device.addEventListener('uncapturederror', (e) => {
    console.error('[ov] uncaptured error:', e.error?.message || e.error);
  });

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',   // 关键:让半透明像素真正透到桌面
  });

  const module = device.createShaderModule({ code: wgsl });
  // createShaderModule 带诊断信息,成功返回不代表编译通过,先查一遍
  const info = await module.getCompilationInfo();
  const bad = info.messages.filter((m) => m.type === 'error' || m.type === 'warning');
  for (const m of bad) {
    console.warn(`[ov] WGSL ${m.type} @line${m.lineNum}: ${m.message}`);
  }
  if (info.messages.some((m) => m.type === 'error')) {
    console.warn('[ov] WGSL 编译错误,降级为 2D 静态背景');
    fallback2D(canvas);
    return false;
  }

  // uniform 缓冲:params(16B) + res(8B) + pad(8B) = 32B,对齐安全
  uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });

  pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs_main' },
    fragment: {
      module, entryPoint: 'fs_main',
      targets: [{
        format,
        // 预乘 alpha 输出的标准混合:src=1,dst=1-srcAlpha
        // (blend 不接受 null,显式写整对象)
        blend: {
          color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
    primitive: { topology: 'triangle-list' },
  });

  bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });

  // 首帧先推一次,避免 uniform 空洞
  writeUniforms(0);
  addEventListener('resize', () => {
    resize();
    context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });
  });
  return true;
}

function writeUniforms(time) {
  /*
   * uniform 布局(wgsl 里 Params):
   *   params.x = time  params.y = status  params.z = pulse  params.w = aspect
   *   res.xy   = canvas 物理像素
   */
  params[0] = time;
  params[1] = currentStatus;
  params[2] = Math.max(0, 1 - (time - pulseStart) / 0.6);  // 点击脉冲 0.6s 衰减
  params[3] = canvas.width / canvas.height;
  params[4] = canvas.width;
  params[5] = canvas.height;
  device.queue.writeBuffer(uniformBuf, 0, params.buffer, 0, 32);  // 只推 32B,后半 64B 是数组余量
}

let currentStatus = STAT_NUM.offline;
let pulseStart = -10;

// 供 hud.js 调用的公共入口
export const fx = {
  setStatus(n) { currentStatus = n; },
  poke() { pulseStart = performance.now() / 1000; },
};

export function frame() {
  if (!device) return;
  const now = performance.now();
  const ms = (currentStatus === STAT_NUM.offline) ? IDLE_MS : FRAME_MS;  // 离线降一档
  if (now - lastFrameAt < ms) return;       // 未到下一拍,跳过本帧
  lastFrameAt = now;
  const t = now / 1000;
  writeUniforms(t);

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view,
      loadOp: 'clear',
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// 启动：先拿到画布,再定尺寸,最后起管线
export async function boot() {
  canvas = document.getElementById('fx');   // 绑定画布 —— resize 依赖它,必须先行
  resize();
  let ok = false;
  try {
    ok = await initFx();
  } catch (e) {
    console.warn('[ov] 渲染管线启动失败,降级为 2D 静态背景', e);
  }
  if (!ok) { fallback2D(canvas); return false; }
  const loop = () => { frame(); requestAnimationFrame(loop); };
  loop();
  return true;
}

// 渲染比例：氛围层全是软光渐变,半分辨率放大回来看不出来,片元数直接砍到 ~1/4
// 若觉得糊,提到 0.8；要极致省电,压到 0.45 也就一格灯的差距
const RENDER_SCALE = 0.55;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);    // 兜住怪分辨率,再多没意义
  canvas.width  = Math.max(1, Math.floor(innerWidth  * dpr * RENDER_SCALE));
  canvas.height = Math.max(1, Math.floor(innerHeight * dpr * RENDER_SCALE));
}

// 帧率两档：忙碌/在线 30fps 撑场面,离线 15fps 省电(闪得慢没人盯着看)。
// 时间源仍取真实时钟,丢帧不会加速动画,视觉平滑。
const FRAME_MS = 1000 / 30;
const IDLE_MS  = 1000 / 15;
let lastFrameAt = 0;

// WebGPU 缺位时的 2D 兜底:一张说明性的渐变底,至少不黑屏。
// 注意:若 WebGPU 上下文已占用,当前 canvas 拿不到 2D 上下文,需换新画布顶替
function fallback2D(c) {
  let ctx = c.getContext('2d');
  if (!ctx) {
    const clone = document.createElement('canvas');
    clone.className = 'ov-stage__canvas';
    c.replaceWith(clone);
    c = clone;
    ctx = c.getContext('2d');
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width  = Math.floor(innerWidth * dpr);
  c.height = Math.floor(innerHeight * dpr);
  const w = c.width, h = c.height;
  if (!ctx) return;
  ctx.fillStyle = 'rgba(10, 14, 26, 0.55)';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
  g.addColorStop(0, 'rgba(124,58,237,0.30)');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}