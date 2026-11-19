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

fn accent() -> vec3<f32> {
  let s = P.params.y;
  var c = mix(vec3<f32>(0.42, 0.49, 0.60),            // offline
              vec3<f32>(0.49, 0.23, 0.93),            // online  #7c3aed
              step(0.5, s));
  c = mix(c, vec3<f32>(0.13, 0.83, 0.93), step(1.5, s));   // busy   #22d3ee
  c = mix(c, vec3<f32>(0.97, 0.44, 0.44), step(2.5, s));   // error  #f87171
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

  // 离线和故障时整体收着：没人看就别烧电
  let energy = mix(0.42, 1.0, step(0.5, s));

  let p  = uv - vec2<f32>(0.5);
  let dv = p * vec2<f32>(ar, 1.0);
  let dc = length(dv);

  var col = vec3<f32>(0.0);

  // 1) 中心光核：按宽高比校正成圆,不是椭圆
  let core = 1.0 - smoothstep(0.0, 0.92, dc);
  col += ac * core * core * 0.30 * (0.85 + 0.15 * sin(t * 0.5)) * energy;

  // 2) HUD 网格：等方格,1px 抗锯齿,中心压暗
  let gc = vec2<f32>(ar, 1.0) * 14.0;
  let gl = gridLine(uv.x * gc.x) + gridLine(uv.y * gc.y);
  col += ac * min(gl, 1.0) * 0.05 * (1.0 - smoothstep(0.0, 0.7, dc)) * energy;

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
    col += ac * (1.0 - smoothstep(0.0, 0.12, dd)) * 0.30 * fade * tw * energy;
  }

  // 4) 边缘流光：环绕距离,min(ang,1-ang) 无接缝
  let b    = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edge = 1.0 - smoothstep(0.0, 0.026, b);
  let ang  = fract(atan2(p.y, p.x) * 0.15915494 + 0.75 - t * 0.10);
  let sweep = 1.0 - smoothstep(0.0, 0.20, min(ang, 1.0 - ang));
  col += ac * edge * sweep * 0.55 * energy;

  // 5) 底部水光
  let dfloor = length((uv - vec2<f32>(0.5, 1.28)) * vec2<f32>(ar, 1.0));
  col += vec3<f32>(0.22, 0.51, 0.97) * (1.0 - smoothstep(0.0, 0.95, dfloor)) * 0.10 * energy;

  // 6) 点击涟漪：中心向外扩散一圈
  let pv = P.params.z;
  col += ac * (1.0 - smoothstep(0.0, 0.45, abs(dc - pv * 0.5))) * pv * 0.45;

  // 7) 暗角：只削光,不压桌面（预乘里 rgb 归零 = 什么都不加）
  let vig = smoothstep(0.55, 1.15, length(uv * vec2<f32>(0.9, 1.4) - 0.45));
  col *= 1.0 - vig * 0.55;

  let a = 0.55 * clamp(energy + 0.2, 0.0, 1.0);
  return vec4<f32>(col * a, a);
}