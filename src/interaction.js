// タップの波紋(bloom)管理 と ストローク描画バッファ(p5.Graphics)

const MAX_TAPS = 16;     // シェーダーに渡せる波紋の最大数（frag 側の配列長と一致させる）
const TAP_LIFETIME = 3000; // 波紋の寿命(ms)

let strokeLayer;         // ユーザーのストロークを貯める 2D バッファ（テクスチャとして渡す）
let taps = [];           // {x, y, t} の配列（x,y はピクセル座標, t は millis）

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

// 波紋を追加（古いものは上限で押し出す）
function addTap(x, y) {
  taps.push({ x: x, y: y, t: millis() });
  if (taps.length > MAX_TAPS) taps.shift();
}

// 寿命切れの波紋を間引く
function pruneTaps() {
  const now = millis();
  taps = taps.filter((tp) => now - tp.t < TAP_LIFETIME);
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
