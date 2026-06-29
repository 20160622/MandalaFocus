// タップの波紋(bloom)管理 と ストローク描画バッファ(p5.Graphics)

const MAX_TAPS = 32;     // 同時に塗れる色数の上限（frag 側の配列長と一致させる）
const TAP_LIFETIME = 12000; // 着彩の寿命(ms)。frag 側 PAINT_LIFE と揃える（塗り絵的に長め）

let strokeLayer;         // ユーザーのストロークを貯める 2D バッファ（テクスチャとして渡す）
let taps = [];           // {x, y, t} の配列（x,y はピクセル座標, t は millis）
let paintHoldMode = false; // 塗り続けるモード：true の間は着彩を退色させない

// 塗り続けるモードの切替（main 側から設定）
function setPaintHold(on) { paintHoldMode = on; }

// ストローク用バッファを生成
function createStrokeLayer(w, h) {
  strokeLayer = createGraphics(w, h);
  strokeLayer.clear();
  strokeLayer.noStroke();
}

// ドラッグの軌跡を柔らかいブラシで描く（前フレーム位置との間を補間して連続させる）
// 速いほど細く、ゆっくりほど太い「生きた筆致」に。
function paintStroke(x, y, px, py) {
  if (!strokeLayer) return;
  strokeLayer.noStroke();
  strokeLayer.fill(255, 90); // 白で描く → シェーダーは r チャンネルを参照
  const d = dist(x, y, px, py);
  const size = constrain(map(d, 2, 45, 34, 13), 13, 34); // 速さで太さが変わる
  const steps = max(1, floor(d / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ix = lerp(px, x, t);
    const iy = lerp(py, y, t);
    strokeLayer.ellipse(ix, iy, size, size);
  }
}

// ストロークを少しずつ減衰させる（「徐々に溶ける」進化感）
function fadeStrokes(amount) {
  if (!strokeLayer) return;
  strokeLayer.noStroke();
  strokeLayer.fill(0, amount); // 半透明の黒を重ねて r を 0 に近づける
  strokeLayer.rect(0, 0, strokeLayer.width, strokeLayer.height);
}

// ストロークを全消去
function clearStrokes() {
  if (!strokeLayer) return;
  strokeLayer.clear();
}

// HSL(0..1) → RGB(0..1)
function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(h + 1 / 3), conv(h), conv(h - 1 / 3)];
}

// 波紋を追加（古いものは上限で押し出す）。タップ位置から色相を決めて着彩色を持たせる。
function addTap(x, y) {
  const ang = Math.atan2(y - height / 2, x - width / 2);
  const hue = (ang / (Math.PI * 2)) + 0.5 + (millis() * 0.00003); // 位置＋ゆるやかな時間で色相
  const col = hslToRgb(((hue % 1) + 1) % 1, 0.62, 0.55);          // 上品で鮮やかな色
  taps.push({ x: x, y: y, t: millis(), col: col });
  if (taps.length > MAX_TAPS) taps.shift();
}

// 寿命切れの波紋を間引く（塗り続けるモード中は退色させないので残す）
function pruneTaps() {
  if (paintHoldMode) return;
  const now = millis();
  taps = taps.filter((tp) => now - tp.t < TAP_LIFETIME);
}

// 塗り続けるモードを解除したとき、保持していた色を「いまから退色」させる。
// 各タップの時刻を退色開始の経過分だけ過去にずらし、滑らかに消えるようにする。
function fadeOutHeldTaps() {
  const now = millis();
  const startMs = TAP_LIFETIME * 0.55; // frag の PAINT_LIFE*0.55（退色の始まり）と揃える
  for (const tp of taps) tp.t = now - startMs;
}

// 着彩（タップ色）をすべて消す
function clearTaps() {
  taps.length = 0;
}

// シェーダー uniform 用に [x, y, t, x, y, t, ...] のフラット配列を作る（長さ MAX_TAPS*3）
function tapsToUniform() {
  const arr = new Array(MAX_TAPS * 3).fill(0);
  for (let i = 0; i < taps.length && i < MAX_TAPS; i++) {
    arr[i * 3 + 0] = taps[i].x;
    arr[i * 3 + 1] = taps[i].y;
    arr[i * 3 + 2] = taps[i].t;
  }
  return arr;
}

// タップごとの着彩色を [r, g, b, ...] のフラット配列に（長さ MAX_TAPS*3）
function tapColsToUniform() {
  const arr = new Array(MAX_TAPS * 3).fill(0);
  for (let i = 0; i < taps.length && i < MAX_TAPS; i++) {
    const c = taps[i].col || [1, 1, 1];
    arr[i * 3 + 0] = c[0];
    arr[i * 3 + 1] = c[1];
    arr[i * 3 + 2] = c[2];
  }
  return arr;
}
