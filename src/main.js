// MandalaFocus — メイン sketch（p5.js グローバルモード）
// 全画面 WebGL キャンバスに「生きている万華鏡フラクタル」をシェーダーで描画する。

let patternShader;
let toneIndex = 0; // 起動時はモノトーン（墨絵・白地）。色付きは Tone で切替
let modeIndex = 0;
let seed = 0;

// ドラッグ／タップ判定用
let pointerDown = false;
let pointerMoved = false;
let pressX = 0;
let pressY = 0;

const UI_GUARD = 64; // 画面下部の UI バー領域（ここでの操作は無視）

// ---- 集中の工夫：禅モード・禅タイマー ----
let zen = false;            // 禅モード（UI/HUD/通知を隠して絵だけに）
let zenHoldTimer = null;    // 禅モード中の長押し解除タイマー
let calmAmt = 0;            // 動きの静けさ 0..1（毎フレーム目標へ補間）

const FOCUS_DURS = [0, 3, 5, 10]; // 集中タイマーの分（0=オフ）
let focusSel = 0;          // FOCUS_DURS の選択位置
let focusActive = false;
let focusEndAt = 0;
let focusTotalMs = 0;
let focusAmt = 0;          // 経過に応じ 0→1（シェーダーの荘厳さに反映）

// ---- フロー（没入の連鎖）：触れ続けるほど高まり、止めると静まる ----
let flow = 0;              // 0..1。光・発光・対称の華やかさに反映

function preload() {
  patternShader = loadShader('shaders/pattern.vert?v=18', 'shaders/pattern.frag?v=18');
}

function setup() {
  pixelDensity(1); // gl_FragCoord と width/height を一致させ、座標計算を単純化
  createCanvas(windowWidth, windowHeight, WEBGL);
  rectMode(CENTER); // WEBGL は原点が中心。中心配置の rect で全画面を覆う
  noStroke();

  createStrokeLayer(width, height);
  seed = floor(random(1000)); // 共有コード用に整数

  loadProgress();
  setupUI();
  updateHUD();
}

function draw() {
  // 集中タイマーの進行（光が貯まりやすくなる「集中の報酬」つき）
  tickFocus();

  // 進化：光をため、新しい階梯が開いたら通知してそのモチーフへ
  const newly = updateProgress(deltaTime);
  if (newly.length > 0) {
    const st = newly[newly.length - 1];
    modeIndex = st.mode; // 開放されたモチーフへ自動で切替
    showToast('🌸 開放：' + st.title);
  }

  // フロー：触れていない間はゆっくり減衰（約2.5秒で静まる）
  flow = max(0, flow - deltaTime * 0.0004);

  // 動きの静けさ：禅モードで深く、集中セッション中も少し静かに（なめらかに補間）
  const calmTarget = zen ? 1.0 : (focusActive ? 0.5 : 0.0);
  calmAmt += (calmTarget - calmAmt) * 0.05;
  // 荘厳さ：集中の経過に応じてゆっくり高まる（離脱後は戻る）
  const focusTarget = focusActive ? min(1, (focusTotalMs - (focusEndAt - millis())) / focusTotalMs) : 0.0;
  focusAmt += (focusTarget - focusAmt) * 0.04;

  fadeStrokes(6);
  pruneTaps();

  shader(patternShader);

  const mode = MODES[modeIndex];
  const tone = TONES[toneIndex];

  patternShader.setUniform('u_resolution', [width, height]);
  patternShader.setUniform('u_time', millis());
  patternShader.setUniform('u_seed', seed);
  patternShader.setUniform('u_segments', mode.segments);
  patternShader.setUniform('u_warp', mode.warp);
  patternShader.setUniform('u_mandala', mode.mandala);
  patternShader.setUniform('u_petals', mode.petals);
  patternShader.setUniform('u_petalDepth', mode.petalDepth);
  patternShader.setUniform('u_spokes', mode.spokes);
  patternShader.setUniform('u_core', mode.core);
  patternShader.setUniform('u_rays', mode.rays);
  patternShader.setUniform('u_palace', mode.palace);
  patternShader.setUniform('u_flame', mode.flame);
  patternShader.setUniform('u_jewel', mode.jewel);
  patternShader.setUniform('u_spacing', tone.spacing);
  patternShader.setUniform('u_lineWidth', tone.lineWidth);
  patternShader.setUniform('u_fill', tone.fill);
  patternShader.setUniform('u_paper', tone.paper);
  patternShader.setUniform('u_ink', tone.ink);
  patternShader.setUniform('u_calm', calmAmt);
  patternShader.setUniform('u_focus', focusAmt);
  patternShader.setUniform('u_flow', flow);
  patternShader.setUniform('u_taps', tapsToUniform());
  patternShader.setUniform('u_tapColor', tapColsToUniform());
  patternShader.setUniform('u_tapCount', taps.length);
  patternShader.setUniform('u_strokeTex', strokeLayer);

  // 全画面を覆う矩形（中心 0,0 に width×height）
  rect(0, 0, width, height);

  updateHUD();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  createStrokeLayer(width, height); // バッファも作り直す
}

// ---- 入力処理（マウス） ----

// タップ先が UI（ボタンバー／HUD）かどうか。座標ではなく実際の対象で判定する。
// UI 上では既定動作を残し、ボタンの click が発火するようにする（iOS でも反応する）。
function overUI(event) {
  const t = event && event.target;
  return !!(t && t.closest && t.closest('#ui, #hud'));
}

function beginPointer() {
  pointerDown = true;
  pointerMoved = false;
  pressX = mouseX;
  pressY = mouseY;
  // 禅モード中は長押し（700ms）で解除
  if (zen) {
    clearTimeout(zenHoldTimer);
    zenHoldTimer = setTimeout(() => {
      if (pointerDown && !pointerMoved) { toggleZen(); pointerDown = false; }
    }, 700);
  }
}

function endPointer() {
  clearTimeout(zenHoldTimer);
  drawToneStop(); // なぞり描きの持続音を止める
  if (pointerDown && !pointerMoved) {
    addTap(mouseX, mouseY);            // 動かさず離した＝タップ → 波紋＋開花
    flow = min(1, flow + 0.12);        // フローが高まる
    earnLight(5 * (1 + flow));         // フローが高いほど多く貯まる
    const y01 = 1 - constrain(mouseY / height, 0, 1); // 上ほど高音
    playBowl(noteFreq(y01));           // タップ位置で音程が変わる
  }
  pointerDown = false;
}

function movePointer() {
  paintStroke(mouseX, mouseY, pmouseX, pmouseY);
  flow = min(1, flow + 0.03);
  earnLight(0.3 * (1 + flow * 2)); // 描画でも光がたまる（フローで増量）
  if (dist(mouseX, mouseY, pressX, pressY) > 6) {
    pointerMoved = true;
    clearTimeout(zenHoldTimer); // 動いたら長押し解除を取り消し
  }
  // なぞり描き中の持続音：上ほど高音、速いほど明るく大きく
  if (audioIsEnabled()) {
    drawToneStart();
    const y01 = 1 - constrain(mouseY / height, 0, 1);
    const sp = dist(mouseX, mouseY, pmouseX, pmouseY) / 30;
    drawToneSet(noteFreq(y01), sp);
  }
}

function mousePressed(event) {
  if (overUI(event)) return; // ボタン等は既定動作へ
  if (menuOpen) { setMenu(false); return; } // 開いていたら絵のタップで閉じる
  beginPointer();
}

function mouseDragged() {
  if (!pointerDown) return;
  movePointer();
}

function mouseReleased() {
  endPointer();
}

// ---- 入力処理（タッチ：スマホ対応。UI 以外でのみ既定動作を抑止） ----

function touchStarted(event) {
  if (overUI(event)) return; // UI へのタッチはボタンの click を生かす（preventDefault しない）
  if (menuOpen) { setMenu(false); return false; } // 開いていたら絵のタッチで閉じる
  beginPointer();
  return false;
}

function touchMoved() {
  if (!pointerDown) return; // 描画中でなければ既定動作を残す
  movePointer();
  return false;
}

function touchEnded() {
  if (!pointerDown) return; // UI 等：既定動作（click）を生かす
  endPointer();
  return false;
}

// ---- 操作コマンド ----

function nextTone() { toneIndex = (toneIndex + 1) % TONES.length; }

// 開放済みのモチーフだけを巡回する
function nextPattern() {
  for (let k = 1; k <= MODES.length; k++) {
    const i = (modeIndex + k) % MODES.length;
    if (isModeUnlocked(i)) { modeIndex = i; break; }
  }
}

function shuffleAll() { seed = floor(random(1000)); }

// ---- メニュー（≡ で開閉） ----
let menuOpen = false;

function toggleMenu() { setMenu(!menuOpen); }

function setMenu(open) {
  menuOpen = open;
  const panel = document.getElementById('menu-panel');
  const btn = document.getElementById('btn-menu');
  if (panel) panel.classList.toggle('open', open);
  if (btn) btn.classList.toggle('active', open);
}

// ---- 集中モード（禅：UI/HUD/通知を隠して絵だけに） ----

function toggleZen() {
  zen = !zen;
  document.body.classList.toggle('zen', zen);
  if (zen) { setMenu(false); showZenHint(); } // 禅に入るときメニューは閉じる
}

function showZenHint() {
  const el = document.getElementById('zenhint');
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ---- 全画面表示 ----

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  // iOS のホーム画面起動（standalone）は既に全画面
  if (window.navigator.standalone) { showToast('すでに全画面です'); return; }
  const doc = document;
  const el = doc.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  // iOS Safari は要素の全画面APIに非対応 → ホーム画面追加を案内
  if (!req) { showToast('iPhoneは「共有」→「ホーム画面に追加」で全画面に'); return; }
  if (!isFullscreen()) {
    req.call(el);
  } else {
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (exit) exit.call(doc);
  }
}

function updateFullscreenButton() {
  const btn = document.getElementById('btn-fullscreen');
  if (btn) btn.textContent = isFullscreen() ? '⛶ 解除' : '⛶ 全画面';
}

// ---- 静かな音（オン/オフ） ----

function toggleSound() {
  const on = !audioIsEnabled();
  const btn = document.getElementById('btn-sound');
  if (btn) btn.textContent = on ? '🔔 音' : '🔕 音';
  if (!on) { audioSetEnabled(false); showToast('音 オフ'); return; }
  // resume 完了後に確認音を鳴らし、AudioContext の状態をトーストで知らせる
  audioSetEnabled(true, (state) => {
    playBowl(293.66); // 確認の一打（音が出ているか分かる）
    if (state === 'running') showToast('音 オン ― 背景音「' + droneName() + '」');
    else showToast('音 状態: ' + state + '（音が出ない場合はタブ/端末の音量を確認）');
  });
}

// 背景音の種類を切り替え
function cycleSoundType() {
  const i = cycleDrone();
  const btn = document.getElementById('btn-soundtype');
  if (btn) btn.textContent = '🎵 ' + droneName(i);
  if (audioIsEnabled()) showToast('音色：' + droneName(i));
  else showToast('音色：' + droneName(i) + '（「音」をオンで再生）');
}

// ---- 禅タイマー（3/5/10分の集中セッション） ----

function cycleFocus() {
  focusSel = (focusSel + 1) % FOCUS_DURS.length;
  const m = FOCUS_DURS[focusSel];
  if (m === 0) endFocus(false);
  else startFocus(m);
}

function startFocus(minutes) {
  focusActive = true;
  focusTotalMs = minutes * 60000;
  focusEndAt = millis() + focusTotalMs;
  playBell('start');
  showToast('集中 ' + minutes + '分 ― はじめます');
  updateFocusButton();
}

function endFocus(completed) {
  if (focusActive && completed) {
    const mins = focusTotalMs / 60000;
    earnLight(mins * 12); // 集中をやり切った報酬
    playBell('end');
    showToast('おつかれさまでした（+光 ' + floor(mins * 12) + '）');
  }
  focusActive = false;
  focusSel = 0;
  updateFocusButton();
}

// 毎フレーム：残り時間の更新・完了判定・集中の報酬（光が貯まりやすい）
function tickFocus() {
  if (!focusActive) return;
  const rem = focusEndAt - millis();
  if (rem <= 0) { endFocus(true); return; }
  earnLight(1.5 * deltaTime / 1000); // 集中中は受動的にも多めにたまる
  updateFocusButton();
}

function updateFocusButton() {
  const btn = document.getElementById('btn-focus');
  if (!btn) return;
  if (!focusActive) { btn.textContent = '⏱ 集中'; return; }
  const rem = max(0, focusEndAt - millis());
  const s = floor(rem / 1000);
  const mm = floor(s / 60);
  const ss = ('0' + (s % 60)).slice(-2);
  btn.textContent = '⏱ ' + mm + ':' + ss;
}

// ---- 共有コード（seed・tone・motif をひとつのコードに） ----

function buildCode() {
  const c = floor(seed) * 100 + toneIndex * 10 + modeIndex;
  return c.toString(36);
}

function applyCode(str) {
  const c = parseInt(str, 36);
  if (isNaN(c)) { showToast('コードが不正です'); return; }
  const m = c % 10;
  const to = floor(c / 10) % 10;
  const sd = floor(c / 100);
  if (m >= MODES.length || to >= TONES.length) { showToast('コードが不正です'); return; }
  seed = sd; toneIndex = to; modeIndex = m;
  showToast('コードを読み込みました');
}

function shareCode() {
  const code = buildCode();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code)
      .then(() => showToast('コードをコピー：' + code))
      .catch(() => window.prompt('共有コード（コピーしてください）', code));
  } else {
    window.prompt('共有コード（コピーしてください）', code);
  }
}

function loadCode() {
  const s = window.prompt('共有コードを入力');
  if (s) applyCode(s.trim());
}

// ---- HUD・通知 ----

let _toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function updateHUD() {
  document.getElementById('hud-stage').textContent = '階梯：' + currentStageTitle();
  document.getElementById('hud-light').textContent = '光 ' + floor(progress.light);
  document.getElementById('hud-collection').textContent = '◉ ' + unlockedModeCount() + '/' + MODES.length;

  const info = nextStageInfo();
  const bar = document.getElementById('hud-bar');
  if (info) {
    bar.style.width = (info.ratio * 100) + '%';
    document.getElementById('hud-progress').title =
      '次：' + info.title + '（' + floor(info.have) + ' / ' + info.need + '）';
  } else {
    bar.style.width = '100%';
    document.getElementById('hud-progress').title = '全モチーフ開放';
  }
}

// ---- キーボード ----

function keyPressed() {
  if (keyCode === ESCAPE) {
    if (menuOpen) setMenu(false);
    else if (focusActive) endFocus(false);
    else if (zen) toggleZen();
    return;
  }
  if (key === 'p' || key === 'P') nextTone();
  else if (key === 'm' || key === 'M') nextPattern();
  else if (key === ' ') shuffleAll();
  else if (key === 'c' || key === 'C') clearStrokes();
  else if (key === 'z' || key === 'Z') toggleZen();
  else if (key === 'f' || key === 'F') cycleFocus();
  else if (key === 's' || key === 'S') toggleSound();
}

// ---- UI バーのボタン配線 ----

function setupUI() {
  document.getElementById('btn-palette').addEventListener('click', nextTone);
  document.getElementById('btn-pattern').addEventListener('click', nextPattern);
  document.getElementById('btn-shuffle').addEventListener('click', shuffleAll);
  document.getElementById('btn-clear').addEventListener('click', clearStrokes);
  document.getElementById('btn-share').addEventListener('click', shareCode);
  document.getElementById('btn-load').addEventListener('click', loadCode);
  document.getElementById('btn-zen').addEventListener('click', toggleZen);
  document.getElementById('btn-sound').addEventListener('click', toggleSound);
  document.getElementById('btn-soundtype').addEventListener('click', cycleSoundType);
  document.getElementById('btn-focus').addEventListener('click', cycleFocus);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-menu').addEventListener('click', toggleMenu);
  // 全画面の出入り（Escでの解除含む）にボタン表示を追従させる
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
}
