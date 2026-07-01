// MandalaFocus 音響エンジン（Web Audio API・合成のみ／音声ファイル不要）
// ・静かな持続音（ドローン）：低い倍音をゆっくり揺らす
// ・シンギングボウルの鳴り：タップ時に倍音つきの鐘の音
// ・禅タイマーの鐘：開始/終了の合図
// AudioContext はブラウザの方針によりユーザー操作の中でしか開始できないため、
// 音をオンにするボタン（クリック）か、タップの中で生成・再開する。

let _actx = null;
let _master = null;
let _drone = null;        // { g, stoppers[] }
let _audioOn = false;

// 背景音（ドローン）の種類。harm=倍音の和音。
const DRONE_PRESETS = [
  { name: '和音', type: 'harm', base: 196.0,  ratios: [1, 1.5, 2],     gains: [0.5, 0.32, 0.22],        lp: 1400, lfo: 1 / 14, vol: 0.16 },
  { name: '荘厳', type: 'harm', base: 98.0,   ratios: [1, 2, 3],       gains: [0.55, 0.30, 0.16],       lp: 780,  lfo: 1 / 18, vol: 0.18 },
  { name: '豊麗', type: 'harm', base: 130.81, ratios: [1, 2, 3, 4, 5], gains: [0.5, 0.28, 0.18, 0.1, 0.06], lp: 2200, lfo: 1 / 12, vol: 0.14 },
  { name: '温和', type: 'harm', base: 174.61, ratios: [1, 1.25, 1.5, 2], gains: [0.45, 0.30, 0.28, 0.20], lp: 1600, lfo: 1 / 15, vol: 0.15 },
  { name: '泉',   type: 'harm', base: 146.83, ratios: [1, 1.5, 2, 2.5, 3],    gains: [0.5, 0.34, 0.22, 0.12, 0.08],  lp: 1900, lfo: 1 / 16, vol: 0.15 },
];
let _droneIdx = 0;

// 五音音階（ペンタトニック）。タップごとにこの中から選ぶと不協和にならず瞑想的。
const _PENTA = [220.0, 246.94, 293.66, 329.63, 392.0]; // A B D E G

function _audioEnsure() {
  if (_actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  _actx = new AC();
  _master = _actx.createGain();
  _master.gain.value = 0.9;
  const comp = _actx.createDynamicsCompressor(); // 軽いリミッターで歪み防止
  _master.connect(comp);
  comp.connect(_actx.destination);
}

// 2秒ループの環境ノイズ。rain=true で雨向け（明るい地の音＋雨だれの粒を焼き込む）。
function _makeNoise(rain) {
  const len = _actx.sampleRate * 2;
  const buf = _actx.createBuffer(1, len, _actx.sampleRate);
  const data = buf.getChannelData(0);

  if (!rain) {
    // ブラウン系（低域寄り）ノイズ
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.0;
    }
    return buf;
  }

  // 雨の地の音：高域を残したピンクノイズ（さーっという定常音）
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; // 地は控えめ
  }

  // 雨だれの粒：短く減衰するノイズの粒を控えめに散らす（さーっとした地の音を主役に）
  const drops = 60;
  for (let d = 0; d < drops; d++) {
    const pos = (Math.random() * len) | 0;
    const dur = (_actx.sampleRate * (0.003 + Math.random() * 0.012)) | 0; // 3〜15ms
    const amp = 0.12 + Math.random() * 0.22;
    for (let j = 0; j < dur && pos + j < len; j++) {
      const env = Math.exp(-j / (dur * 0.3));
      data[pos + j] += (Math.random() * 2 - 1) * amp * env;
    }
  }

  // クリップ防止
  for (let i = 0; i < len; i++) {
    if (data[i] > 1) data[i] = 1; else if (data[i] < -1) data[i] = -1;
  }
  return buf;
}

function _droneStart() {
  if (!_actx || _drone) return;
  const now = _actx.currentTime;
  const pre = DRONE_PRESETS[_droneIdx];

  const g = _actx.createGain();
  g.gain.value = 0.0;
  const lp = _actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pre.lp;
  lp.Q.value = 0.5;
  g.connect(lp);
  lp.connect(_master);

  const stoppers = [];

  if (pre.type === 'noise') {
    // 雨音：明るめのノイズ＋雨だれの粒。低い唸りはハイパスで除き、高域はローパス(pre.lp)で整える。
    const src = _actx.createBufferSource();
    src.buffer = _makeNoise(pre.tone === 'rain');
    src.loop = true;
    const hp = _actx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = pre.hp || 400;
    hp.Q.value = 0.4;
    const ng = _actx.createGain();
    ng.gain.value = 0.8;
    src.connect(hp);
    hp.connect(ng);
    ng.connect(g);
    src.start();
    stoppers.push(src);
  } else {
    // 倍音の和音：基音＋倍音をサイン波で重ねる
    pre.ratios.forEach((r, i) => {
      const o = _actx.createOscillator();
      o.type = 'sine';
      o.frequency.value = pre.base * r;
      o.detune.value = (i - 1) * 4; // わずかなデチューンでうねり
      const og = _actx.createGain();
      og.gain.value = pre.gains[i];
      o.connect(og);
      og.connect(g);
      o.start();
      stoppers.push(o);
    });
  }

  // ごくゆっくりの音量うねりで「呼吸」する持続音に
  const lfo = _actx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = pre.lfo;
  const lfoG = _actx.createGain();
  lfoG.gain.value = pre.vol * 0.25;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  lfo.start();
  stoppers.push(lfo);

  g.gain.setValueAtTime(0.0, now);
  g.gain.linearRampToValueAtTime(pre.vol, now + 1.5); // フェードイン

  _drone = { g, stoppers };
}

function _droneStop() {
  if (!_actx || !_drone) return;
  const now = _actx.currentTime;
  const d = _drone;
  _drone = null;
  d.g.gain.cancelScheduledValues(now);
  d.g.gain.setValueAtTime(d.g.gain.value, now);
  d.g.gain.linearRampToValueAtTime(0.0, now + 1.2); // フェードアウト
  setTimeout(() => {
    d.stoppers.forEach((n) => { try { n.stop(); } catch (e) {} });
  }, 1400);
}

// 倍音つきの鐘／ボウル音を1発鳴らす（指定なしならペンタトニックから抽選）
function playBowl(rootHz, level) {
  if (!_audioOn || !_actx) return;
  const now = _actx.currentTime;
  const root = rootHz || _PENTA[Math.floor(Math.random() * _PENTA.length)];
  const vol = level || 0.5;

  // ボウルの非整数倍音（高い倍音ほど早く減衰）
  const partials = [
    { r: 1.0,  g: 0.5,  d: 5.0 },
    { r: 2.0,  g: 0.26, d: 3.4 },
    { r: 2.74, g: 0.16, d: 2.4 },
    { r: 4.07, g: 0.08, d: 1.5 },
  ];

  const out = _actx.createGain();
  out.gain.value = vol;
  out.connect(_master);

  partials.forEach((p) => {
    const o = _actx.createOscillator();
    o.type = 'sine';
    o.frequency.value = root * p.r;
    o.detune.value = Math.random() * 6 - 3; // 微妙な揺らぎでうなり
    const g = _actx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(p.g, now + 0.008); // 速いアタック
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.d); // 長い減衰
    o.connect(g);
    g.connect(out);
    o.start(now);
    o.stop(now + p.d + 0.1);
  });
}

// 禅タイマーの鐘（start=澄んだ高め, end=落ち着いた低め）。音オフでも合図として鳴らす。
function playBell(kind) {
  _audioEnsure();
  if (_actx.state === 'suspended') _actx.resume();
  const wasOn = _audioOn;
  _audioOn = true; // 合図は確実に鳴らす
  playBowl(kind === 'end' ? 174.61 : 261.63, 0.6); // F3 / C4
  _audioOn = wasOn;
}

// 音のオン/オフ。on にするときユーザー操作の中で呼ぶこと（AudioContext 再開のため）。
// onReady(state) には最終的な AudioContext の状態（'running' 等）を渡す。
function audioSetEnabled(on, onReady) {
  if (on) {
    _audioEnsure();
    const startAll = () => {
      _audioOn = true;
      _droneStart();
      if (onReady) onReady(_actx.state);
    };
    // suspended のままだと無音。resume の完了を待ってから鳴らす。
    if (_actx.state === 'suspended' && _actx.resume) {
      _actx.resume().then(startAll).catch(startAll);
    } else {
      startAll();
    }
  } else {
    _audioOn = false;
    _droneStop();
    if (onReady) onReady('suspended');
  }
}

function audioIsEnabled() { return _audioOn; }
function audioState() { return _actx ? _actx.state : 'none'; }

// ---- 背景音（ドローン）の種類選択 ----
function droneCount() { return DRONE_PRESETS.length; }
function droneName(i) {
  const k = (i == null) ? _droneIdx : i;
  return DRONE_PRESETS[((k % DRONE_PRESETS.length) + DRONE_PRESETS.length) % DRONE_PRESETS.length].name;
}
function droneIndex() { return _droneIdx; }

// 種類を設定。再生中なら滑らかに切り替える（新旧が一瞬クロスフェード）。
function setDrone(i) {
  _droneIdx = ((i % DRONE_PRESETS.length) + DRONE_PRESETS.length) % DRONE_PRESETS.length;
  if (_audioOn) { _droneStop(); _droneStart(); }
  return _droneIdx;
}
function cycleDrone() { return setDrone(_droneIdx + 1); }

// 五音音階（約2オクターブ）。位置→音程に使う。y01: 0=低い, 1=高い。
const _SCALE = [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 783.99];
function noteFreq(y01) {
  const n = _SCALE.length;
  let i = Math.floor(y01 * n);
  if (i < 0) i = 0; if (i > n - 1) i = n - 1;
  return _SCALE[i];
}

// ---- なぞり描き中の持続音（弓で弾くような音／テルミン風） ----
let _draw = null; // { o, o2, g, lp }

function drawToneStart() {
  if (!_audioOn || !_actx || _draw) return;
  const now = _actx.currentTime;
  const g = _actx.createGain();
  g.gain.value = 0.0;
  const lp = _actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.Q.value = 2.0;
  g.connect(lp);
  lp.connect(_master);

  const o = _actx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 330;
  const o2 = _actx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 330;
  o2.detune.value = 6; // わずかにずらしてうねり
  const og2 = _actx.createGain();
  og2.gain.value = 0.5;
  o.connect(g);
  o2.connect(og2);
  og2.connect(g);
  o.start();
  o2.start();

  g.gain.setValueAtTime(0.0, now);
  g.gain.linearRampToValueAtTime(0.10, now + 0.08); // すっと立ち上がる
  _draw = { o, o2, g, lp };
}

// 周波数と強さ（0..1：なぞる速さ）を滑らかに更新
function drawToneSet(freq, level) {
  if (!_draw || !_actx) return;
  const now = _actx.currentTime;
  const lv = Math.max(0, Math.min(1, level || 0));
  _draw.o.frequency.setTargetAtTime(freq, now, 0.05);   // ポルタメント
  _draw.o2.frequency.setTargetAtTime(freq, now, 0.05);
  _draw.g.gain.setTargetAtTime(0.06 + 0.12 * lv, now, 0.05);
  _draw.lp.frequency.setTargetAtTime(700 + 1600 * lv, now, 0.05);
}

function drawToneStop() {
  if (!_draw || !_actx) return;
  const now = _actx.currentTime;
  const d = _draw;
  _draw = null;
  d.g.gain.cancelScheduledValues(now);
  d.g.gain.setValueAtTime(d.g.gain.value, now);
  d.g.gain.linearRampToValueAtTime(0.0, now + 0.25); // すっと消える
  setTimeout(() => { try { d.o.stop(); d.o2.stop(); } catch (e) {} }, 350);
}
