// 進化の階梯（収集・進化系のゲームロジック）
// 「光」をためて段階的にモチーフを開放していく。状態は localStorage に保存。

// 保存キーは旧名 'evocells' のまま据え置く（改名しても既存の進捗を引き継ぐため。変更厳禁）
const SAVE_KEY = 'evocells.save.v1';
const PASSIVE_PER_SEC = 1.0; // 放置で増える光/秒

// 各階梯：到達に必要な光、開放される MODES のインデックス、名称
const STAGES = [
  { light: 0,    mode: 0, title: '種(たね)' },
  { light: 40,   mode: 1, title: '芽生え' },
  { light: 120,  mode: 5, title: '生長' },
  { light: 280,  mode: 2, title: '蓮華' },
  { light: 560,  mode: 3, title: '曼荼羅' },
  { light: 1000, mode: 4, title: '法輪' },
  { light: 1600, mode: 6, title: '虚空(こくう)' },
];

const progress = {
  light: 0,
  reachedStage: 0, // 到達済みの最高階梯インデックス
};

let _saveTimer = 0;

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      progress.light = o.light || 0;
      progress.reachedStage = o.reachedStage || 0;
    }
  } catch (e) { /* 保存が読めなくても初期状態で続行 */ }
  // 光の量に対して階梯がずれていないか補正
  for (let i = 0; i < STAGES.length; i++) {
    if (progress.light >= STAGES[i].light) progress.reachedStage = Math.max(progress.reachedStage, i);
  }
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (e) { /* 保存できなくても続行 */ }
}

// 光を加算（タップ・描画から呼ぶ）
function earnLight(amount) {
  progress.light += amount;
}

// 毎フレーム呼ぶ。放置分を加算し、新たに開放された階梯の配列を返す。
function updateProgress(dtMs) {
  progress.light += PASSIVE_PER_SEC * dtMs / 1000;

  const newly = [];
  for (let i = progress.reachedStage + 1; i < STAGES.length; i++) {
    if (progress.light >= STAGES[i].light) {
      progress.reachedStage = i;
      newly.push(STAGES[i]);
    } else {
      break;
    }
  }

  _saveTimer += dtMs;
  if (newly.length > 0 || _saveTimer > 2000) {
    _saveTimer = 0;
    saveProgress();
  }
  return newly;
}

function isModeUnlocked(modeIdx) {
  for (let s = 0; s <= progress.reachedStage; s++) {
    if (STAGES[s].mode === modeIdx) return true;
  }
  return false;
}

function unlockedModeCount() {
  let c = 0;
  for (let i = 0; i < MODES.length; i++) if (isModeUnlocked(i)) c++;
  return c;
}

function currentStageTitle() {
  return STAGES[progress.reachedStage].title;
}

// 次の階梯への進捗 {have, need, ratio, title}。最大なら null。
function nextStageInfo() {
  const n = progress.reachedStage + 1;
  if (n >= STAGES.length) return null;
  const prev = STAGES[progress.reachedStage].light;
  const need = STAGES[n].light;
  const ratio = Math.max(0, Math.min(1, (progress.light - prev) / (need - prev)));
  return { have: progress.light, need: need, ratio: ratio, title: STAGES[n].title };
}
