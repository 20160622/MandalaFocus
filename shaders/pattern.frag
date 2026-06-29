// MandalaFocus 中核シェーダー（線画 / アイソライン版・仏教モチーフ）
// 万華鏡 + 多重フラクタルの値場 → 等高線を細い線で描く（インク画調）
// さらに 曼荼羅の建築（二重円相・四門・蓮弁輪）・放射光背・火焔光背・宝珠 を重ねる。
#ifdef GL_ES
precision highp float;
#endif

#define TAU 6.28318530718
#define MAX_TAPS 32
#define TAP_LIFE 5.0     // 波紋の寿命(秒)
#define PAINT_LIFE 12.0  // 着彩の寿命(秒)：塗り絵的に長く残し、後半でゆっくり退色

varying vec2 vTexCoord;

uniform vec2  u_resolution;
uniform float u_time;        // millis
uniform float u_seed;
uniform float u_segments;    // 万華鏡のセグメント数
uniform float u_warp;        // ドメインワープの強さ

uniform float u_spacing;     // 等高線の本数
uniform float u_lineWidth;   // 線の太さ(px)
uniform float u_fill;        // 陰影の量
uniform vec3  u_paper;       // 地の色
uniform vec3  u_ink;         // 線の色
uniform float u_calm;        // 動きの静けさ(0=通常, 1=禅モードで最も静か)
uniform float u_focus;       // 集中の経過(0..1)：荘厳さがゆっくり高まる
uniform float u_flow;        // 没入の連鎖(0..1)：発光・華やかさ・光が増す
uniform float u_paintHold;   // 塗り続けるモード(0=退色する, 1=色が消えない)

uniform float u_mandala;     // 曼荼羅成分の強さ(0=フラクタル, 1=曼荼羅)
uniform float u_petals;      // 蓮弁の数
uniform float u_petalDepth;  // 蓮弁の深さ
uniform float u_spokes;      // 法輪のスポーク数(0=なし)
uniform float u_core;        // 中央の蓮華座コア(0/1)
uniform float u_rays;        // 放射光背(0/1)
uniform float u_palace;      // 曼荼羅建築：二重円相・四門・蓮弁輪(0/1)
uniform float u_flame;       // 火焔光背(0/1)
uniform float u_jewel;       // 中央の宝珠(0/1)

uniform vec3  u_taps[MAX_TAPS]; // x, y(ピクセル), t(millis)
uniform vec3  u_tapColor[MAX_TAPS]; // タップごとの着彩色(rgb)
uniform int   u_tapCount;

uniform sampler2D u_strokeTex;

// --- value noise ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {   // 階層を 1 段増やして細部を出す
    v += amp * noise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// ridged turbulence（尾根状の多重フラクタル）
float turbulence(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {   // 尾根状フラクタルも 1 段深く
    float n = noise(p * freq);
    n = abs(2.0 * n - 1.0);
    v += amp * n;
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}

// 宝珠（如意宝珠）の符号付き距離：下半分は円、上は尖る（玉ねぎ形）
float sdJewel(vec2 q, float r) {
  q.x = abs(q.x);
  if (q.y <= 0.0) {
    return abs(length(q) - r);          // 下半分：円
  }
  vec2 a = vec2(r, 0.0);
  vec2 b = vec2(0.0, r * 1.9);           // 上の尖り
  vec2 pa = q - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);            // 上半分：稜線への距離
}

// 画面座標 p における値場（折り返し・フラクタル・波紋・ストロークを含む）
// 勾配を求めるため複数回サンプルするので 1 関数にまとめている。
float fieldFromP(vec2 p) {
  vec2 res = u_resolution;
  float spd = mix(1.0, 0.45, u_calm); // 禅モードで動きの移ろいを静める
  float t = u_time * 0.001 * spd;

  // 万華鏡折り返し
  float araw = atan(p.y, p.x);     // 生の角度（曼荼羅用に保持）
  float rad = length(p);
  float seg = TAU / u_segments;
  float ang = mod(araw, seg);
  ang = abs(ang - seg * 0.5);
  ang += t * 0.008;                // ごくゆっくり回転
  vec2 fp = vec2(cos(ang), sin(ang)) * rad;

  // 多重フラクタルの値場（ゆっくり移り変わる）
  // seed(整数)を有界なオフセットに変換し、座標が巨大化してノイズ精度が落ちるのを防ぐ
  vec2 seedOffset = vec2(
    fract(sin(u_seed * 12.9898) * 43758.5453),
    fract(sin(u_seed * 78.2330) * 43758.5453)
  ) * 50.0;
  vec2 q = fp * 4.0 + seedOffset;  // 基本周波数を上げて模様を細かく
  vec2 w = vec2(
    fbm(q + vec2(0.0, t * 0.05)),
    fbm(q + vec2(5.2, 1.3 - t * 0.04))
  );
  float base = turbulence(q + u_warp * w + vec2(t * 0.03, 0.0));
  float detail = turbulence(q * 3.0 - 6.0 * w);
  float f = base * 0.7 + detail * 0.3;

  // 曼荼羅（多重の蓮弁による同心リング・仏教的モチーフ）
  float ma = araw + t * 0.006;     // ごくゆっくり回転
  float scallop = u_petalDepth * (
      cos(ma * u_petals)       * (1.0 - smoothstep(0.15, 0.55, rad))  // 内側：基本の弁
    + cos(ma * u_petals * 2.0) * smoothstep(0.25, 0.60, rad)          // 中間：倍の弁（層）
    + cos(ma * u_petals * 4.0) * smoothstep(0.45, 0.78, rad) * 0.55   // 外側：さらに細かい弁（層）
  );
  float fm = rad - scallop;        // 等高線が蓮弁状の同心リングになる
  f = mix(f, fm, u_mandala);

  // タップ波紋（等高線が同心円状に波打つ）
  for (int i = 0; i < MAX_TAPS; i++) {
    if (i >= u_tapCount) break;
    vec3 tap = u_taps[i];
    float age = (u_time - tap.z) * 0.001;
    if (age < 0.0 || age > TAP_LIFE) continue;
    vec2 tp = vec2(tap.x - 0.5 * res.x, 0.5 * res.y - tap.y) / res.y;
    float d = length(p - tp);
    float r = age * 0.6;
    float ring = exp(-pow((d - r) * 8.0, 2.0));
    f += ring * (1.0 - age / TAP_LIFE) * 0.5;
  }

  // ストローク（生の位置 + 万華鏡対称のエコー）→ 値場を盛り上げる
  // 香の煙のように、時間で揺らぎながら溶けるよう僅かに座標を揺らす
  vec2 wob = vec2(noise(p * 7.0 + t * 0.6), noise(p * 7.0 - t * 0.5)) - 0.5;
  wob *= 0.004;
  vec2 rawUV = vec2(p.x * res.y / res.x + 0.5, p.y + 0.5) + wob;
  rawUV.y = 1.0 - rawUV.y;
  vec2 foldUV = vec2(fp.x * res.y / res.x + 0.5, fp.y + 0.5) + wob;
  foldUV.y = 1.0 - foldUV.y;
  float stroke = max(texture2D(u_strokeTex, rawUV).r, texture2D(u_strokeTex, foldUV).r);
  f += stroke * 0.5;

  return f;
}

void main() {
  vec2 res = u_resolution;
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * res) / res.y;
  float rad = length(p);
  float a = atan(p.y, p.x);
  float t = u_time * 0.001;
  float lw = u_lineWidth;

  // 瞑想的な呼吸：ごくゆっくり線の密度が伸縮する（禅モードではさらに緩やかに）
  float breath = sin(u_time * 0.00035 * mix(1.0, 0.6, u_calm));
  float spacing = u_spacing * (1.0 + 0.04 * breath);

  // 値場と その画面方向の勾配（中央差分）。
  // p 空間の 1 単位 = res.y ピクセルなので、勾配は「ピクセルあたりの変化量」に直す。
  float stepPx = 1.5;                 // サンプル間隔(px)
  float eps = stepPx / res.y;         // px を p 空間へ
  float fc = fieldFromP(p);
  float fx = fieldFromP(p + vec2(eps, 0.0));
  float fy = fieldFromP(p + vec2(0.0, eps));
  float gradPx = length(vec2(fx - fc, fy - fc)) / stepPx; // 値場の変化量/px

  // 等高線：fc * spacing の整数レベルに細い線を引く（太さ一定・AA付き）
  float fl = fc * spacing;
  float dline = abs(fract(fl + 0.5) - 0.5);              // 線の中心で 0
  float pixelDist = dline / max(gradPx * spacing, 1e-5); // 最寄り線までのピクセル数
  float line = 1.0 - smoothstep(0.0, lw, pixelDist);

  // 線の下に重ねる淡い陰影（任意）
  float shade = (1.0 - clamp(fc, 0.0, 1.0)) * 0.6;
  float ink = max(line, u_fill * shade);

  // 放射光背（後光：細い光条が中心から放射する）
  if (u_rays > 0.5) {
    float rayN = 36.0;
    float ray = 0.5 + 0.5 * cos(a * rayN);
    ray = smoothstep(0.6, 0.95, ray);
    ray *= smoothstep(0.10, 0.16, rad) * smoothstep(0.44, 0.30, rad);
    ink = max(ink, ray * 0.5);
  }

  // 法輪（ダルマチャクラ：スポーク＋ハブ＋外輪）
  if (u_spokes > 0.5) {
    float a2 = a + u_time * 0.00001; // ごくゆっくり回転
    float spokeAng = TAU / u_spokes;
    float da = abs(fract(a2 / spokeAng + 0.5) - 0.5) * spokeAng; // 最寄りスポークへの角度差
    float spoke = 1.0 - smoothstep(0.0, lw, da * rad * res.y);   // 弧長(px)で太さ一定
    spoke *= smoothstep(0.07, 0.10, rad) * smoothstep(0.46, 0.42, rad); // ハブ〜外輪の間だけ
    float rim = 1.0 - smoothstep(0.0, lw * 1.5, abs(rad - 0.46) * res.y);
    float hub = 1.0 - smoothstep(0.0, lw, abs(rad - 0.07) * res.y);
    ink = max(ink, max(spoke, max(rim, hub)));
  }

  // 曼荼羅の建築：二重円相・外周の蓮弁輪・四門
  if (u_palace > 0.5) {
    float c1 = 1.0 - smoothstep(0.0, lw, abs(rad - 0.38) * res.y);
    float c2 = 1.0 - smoothstep(0.0, lw, abs(rad - 0.42) * res.y);
    // 内側にも円相を足して層を増やす
    float c0 = 1.0 - smoothstep(0.0, lw, abs(rad - 0.30) * res.y);
    float c3 = 1.0 - smoothstep(0.0, lw, abs(rad - 0.33) * res.y);
    ink = max(ink, max(max(c0, c3), max(c1, c2)));

    // 内周の細かな蓮弁輪（二重円相の間に小弁を巡らせる）
    float inR = 0.355 + 0.008 * cos(a * 48.0);
    float inLine = 1.0 - smoothstep(0.0, lw, abs(rad - inR) * res.y);
    inLine *= smoothstep(0.33, 0.35, rad) * smoothstep(0.38, 0.36, rad);
    ink = max(ink, inLine);

    // 外周の蓮弁輪（より細かい弁に）
    float petR = 0.455 + 0.010 * cos(a * 48.0);
    float petLine = 1.0 - smoothstep(0.0, lw, abs(rad - petR) * res.y);
    petLine *= smoothstep(0.42, 0.44, rad);
    ink = max(ink, petLine);

    // 四門（四方の楼門：二重円相を跨ぐ小さな門）
    float gateAng = TAU / 4.0;
    float gda = abs(fract(a / gateAng + 0.5) - 0.5) * gateAng; // 最寄り基本方位への角度差
    float arc = gda * rad;
    float halfW = 0.038;
    float rIn = 0.36, rOut = 0.46;
    float wall = (1.0 - smoothstep(0.0, lw, abs(arc - halfW) * res.y))
                 * step(rIn, rad) * step(rad, rOut);          // 門の側壁
    float bars = max(
      1.0 - smoothstep(0.0, lw, abs(rad - rIn) * res.y),
      1.0 - smoothstep(0.0, lw, abs(rad - rOut) * res.y)
    ) * step(arc, halfW);                                     // 門の上下の桁
    ink = max(ink, max(wall, bars));
  }

  // 火焔光背（外周で燃え立つ縁）
  if (u_flame > 0.5) {
    float flameN = 18.0;
    float flick = noise(vec2(a * flameN * 0.5 + t * 0.3, t * 0.2));
    float tip = 0.45 + 0.05 * (0.5 + 0.5 * cos(a * flameN)) + 0.02 * flick;
    float flame = 1.0 - smoothstep(0.0, lw * 1.4, abs(rad - tip) * res.y);
    flame *= smoothstep(0.43, 0.46, rad);
    ink = max(ink, flame);
  }

  // 中央の宝珠（如意宝珠：玉ねぎ形＋小さな炎尖）
  if (u_jewel > 0.5) {
    float jd = sdJewel(p, 0.05);
    float jewel = 1.0 - smoothstep(0.0, lw, jd * res.y);
    ink = max(ink, jewel);
  }

  // 中央の蓮華座コア（点＋ハロー）
  if (u_core > 0.5) {
    float dot = 1.0 - smoothstep(0.016, 0.022, rad);
    float halo = 1.0 - smoothstep(0.0, lw, abs(rad - 0.05) * res.y);
    ink = max(ink, max(dot, halo));
  }

  // 縁に近い線をフェードして枠の途切れを和らげる
  ink *= smoothstep(1.45, 1.15, rad);

  // 線が生きる：描いた軌跡そのものを発光させる（万華鏡対称のエコー込み）
  float spd2 = mix(1.0, 0.45, u_calm);
  float t2 = u_time * 0.001 * spd2;
  float segG = TAU / u_segments;
  float angG = abs(mod(a, segG) - segG * 0.5) + t2 * 0.008;
  vec2 fpG = vec2(cos(angG), sin(angG)) * rad;

  // タッチで構成要素を着彩：タップした部分（折りたたみ後の位置）に当たる
  // 万華鏡対称のセルがすべて同じ色に染まり、寿命とともにゆっくり退色する。
  vec3 paintCol = vec3(0.0);
  float paintA = 0.0;
  for (int i = 0; i < MAX_TAPS; i++) {
    if (i >= u_tapCount) break;
    vec3 tap = u_taps[i];
    float age = (u_time - tap.z) * 0.001;
    // 通常は寿命で切る。塗り続けるモードでは退色させず常に有効。
    if (age < 0.0 || (u_paintHold < 0.5 && age > PAINT_LIFE)) continue;
    vec2 tp = vec2(tap.x - 0.5 * res.x, 0.5 * res.y - tap.y) / res.y;
    float ta = atan(tp.y, tp.x);
    float tr = length(tp);
    float tang = abs(mod(ta, segG) - segG * 0.5) + t2 * 0.008; // タップ点も同じ折りたたみへ
    vec2 ftp = vec2(cos(tang), sin(tang)) * tr;
    float dd = distance(fpG, ftp);                 // 折りたたみ空間での距離
    float fall = 1.0 - smoothstep(0.09, 0.17, dd); // この近傍だけに限定
    if (fall <= 0.0) continue;
    // タップした等高線セル（＝触れた構成要素）と同じレベルの面だけを塗る。
    // これで線の内側にきっちり収まり、細かい要素を塗り分けられる。
    float fcTap = fieldFromP(tp);
    float bandMatch = step(abs(floor(fc * spacing) - floor(fcTap * spacing)), 0.5);
    float grow = smoothstep(0.0, 0.25, age);                       // さっと染まる
    // 長く残して後半で退色。塗り続けるモードでは退色を打ち消す（常に 1.0）。
    float life = mix(1.0 - smoothstep(PAINT_LIFE * 0.55, PAINT_LIFE, age), 1.0, u_paintHold);
    float aa = fall * grow * life * bandMatch;
    if (aa > paintA) { paintA = aa; paintCol = u_tapColor[i]; } // 最も濃い色を採用
  }

  vec2 sgRaw = vec2(p.x * res.y / res.x + 0.5, p.y + 0.5);  sgRaw.y = 1.0 - sgRaw.y;
  vec2 sgFold = vec2(fpG.x * res.y / res.x + 0.5, fpG.y + 0.5); sgFold.y = 1.0 - sgFold.y;
  float strokeGlow = max(texture2D(u_strokeTex, sgRaw).r, texture2D(u_strokeTex, sgFold).r);

  // 呼吸の中心の光（瞑想的な明滅）＋ 描線の発光 ＋ フローの華やぎ
  float centerGlow = (0.5 + 0.5 * breath) * (0.06 + 0.10 * u_focus) * smoothstep(0.6, 0.0, rad);
  float glow = centerGlow
             + strokeGlow * (0.45 + 0.6 * u_flow)
             + u_flow * 0.05 * smoothstep(1.0, 0.0, rad);

  // 集中・フローの高まりで線をほんのり強める（荘厳に・華やかに育つ）
  float ink2 = ink + (u_focus * 0.12 + u_flow * 0.10) * line;
  float v = clamp(ink2, 0.0, 1.0);

  vec3 base = u_paper;
  base = mix(base, paintCol, paintA * 0.85); // タッチした構成要素を着彩（退色する）
  vec3 col = mix(base, u_ink, v);
  col += (u_ink - base) * glow * (1.0 - v); // 地の側を線色へ持ち上げて発光に
  gl_FragColor = vec4(col, 1.0);
}
