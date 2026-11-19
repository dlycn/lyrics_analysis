struct Params {
  params: vec4<f32>,   // x 时间(s)  y 状态(0离线/1在线/2忙碌/3故障)  z 点击脉冲  w 宽高比
  res:    vec2<f32>,   // 绘制缓冲像素尺寸 = canvas.width / canvas.height，不是 CSS 尺寸
  pad:    vec2<f32>,
};
@group(0) @binding(0) var<uniform> P: Params;

// 位移哈希：比 sin(dot()) 便宜一个三角函数,也不受各家 sin 实现精度差异影响
fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 状态 -> 主色相：Trae 电光蓝系。离线灰蓝待机,在线亮蓝当家,
// 忙碌转青,故障转红。整体都比之前版本更饱和、更亮。
fn accent() -> vec3<f32> {
  let s = P.params.y;
  var c = mix(vec3<f32>(0.44, 0.60, 0.88),            // offline  #70b3ff
              vec3<f32>(0.15, 0.55, 1.00),            // online   #3b8cff
              step(0.5, s));
  c = mix(c, vec3<f32>(0.00, 0.72, 0.98), step(1.5, s));   // busy   #00b8fa
  c = mix(c, vec3<f32>(1.00, 0.47, 0.47), step(2.5, s));   // error  #ff7878
  return c;
}

// 抗锯齿网格线：线宽跟着像素走,任何分辨率都约 1px
fn gridLine(x: f32) -> f32 {
  let d = abs(fract(x - 0.5) - 0.5);
  let a = fwidth(x) * 1.1;
  return 1.0 - smoothstep(0.0, a, d);
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag.xy / P.res;
  let ar = P.params.w;
  let t  = P.params.x;
  let s  = P.params.y;
  let ac = accent();

  // 离线也留基本亮度——之前 0.42 太收着,整个窗都暗得不像氛围窗
  let energy = mix(0.62, 1.0, step(0.5, s));

  let p  = uv - vec2<f32>(0.5);
  let dv = p * vec2<f32>(ar, 1.0);
  let dc = length(dv);

  var col = vec3<f32>(0.0);

  // 1) 中心光核：按宽高比校正成圆,提亮加饱和
  let core = 1.0 - smoothstep(0.0, 0.88, dc);
  col += ac * core * core * 0.42 * (0.88 + 0.12 * sin(t * 0.5)) * energy;

  // 2) HUD 网格：等方格,1px 抗锯齿,中心压暗（压得没以前狠）
  let gc = vec2<f32>(ar, 1.0) * 14.0;
  let gl = gridLine(uv.x * gc.x) + gridLine(uv.y * gc.y);
  col += ac * min(gl, 1.0) * 0.07 * (1.0 - smoothstep(0.0, 0.7, dc) * 0.9) * energy;

  // 3) 浮游微粒：一格一颗,格内随机位置,竖直上浮,两端淡出
  //    淡出是关键——不淡出的话,点走到格子尽头会瞬间跳回另一端
  let ps = vec2<f32>(ar, 1.0) * 9.0;
  let pc = floor(uv * ps);
  let pf = fract(uv * ps);
  let h  = hash21(pc);
  if (h > 0.86) {
    let sp = 0.05 + fract(h * 37.0) * 0.09;                  // 格/秒
    let fy = fract(pf.y - t * sp + fract(h * 91.0));         // 减时间 = 向上
    let fx = 0.18 + fract(h * 53.0) * 0.64;
    let dd = length(vec2<f32>(pf.x - fx, pf.y - fy));
    let fade = smoothstep(0.0, 0.16, fy) * (1.0 - smoothstep(0.84, 1.0, fy));
    let tw = 0.55 + 0.45 * sin(t * 1.6 + h * 40.0);
    col += ac * (1.0 - smoothstep(0.0, 0.12, dd)) * 0.38 * fade * tw * energy;
  }

  // 4) 边缘流光：加宽加亮,绕一圈扫壁的光弧
  let b    = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edge = 1.0 - smoothstep(0.0, 0.045, b);                // 流光带加宽近一倍
  let ang  = fract(atan2(p.y, p.x) * 0.15915494 + 0.75 - t * 0.12);
  let sweep = 1.0 - smoothstep(0.0, 0.28, min(ang, 1.0 - ang));
  // 主光弧 + 一段淡淡的底光,让流光整圈有存在感
  col += ac * edge * sweep * 0.90 * energy;
  col += ac * edge * 0.10 * energy;

  // 5) 底部水光：更亮更蓝,呼应蓝光主题
  let dfloor = length((uv - vec2<f32>(0.5, 1.24)) * vec2<f32>(ar, 1.0));
  col += vec3<f32>(0.16, 0.44, 1.00) * (1.0 - smoothstep(0.0, 0.80, dfloor)) * 0.16 * energy;

  // 6) 点击涟漪：中心向外扩散一圈
  let pv = P.params.z;
  col += ac * (1.0 - smoothstep(0.0, 0.45, abs(dc - pv * 0.5))) * pv * 0.55;

  // 7) 暗角：只削光,不压桌面。压暗系数从 0.55 降到 0.38,整窗不再死黑
  let vig = smoothstep(0.62, 1.18, length(uv * vec2<f32>(0.9, 1.4) - 0.45));
  col *= 1.0 - vig * 0.38;

  // 通体提亮：alpha 0.55 -> 0.72,不然透过桌面看着灰扑扑的
  let a = 0.72 * clamp(energy + 0.25, 0.0, 1.0);
  return vec4<f32>(col * a, a);
}