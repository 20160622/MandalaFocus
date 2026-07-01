// 線画（アイソライン）スタイルのプリセット と パターンモードの定義。
// 値場の等高線を細い線で描く。各値の意味：
//   spacing  : 等高線の本数（大きいほど線が密）
//   lineWidth: 線の太さ（ピクセル）
//   fill     : 線の下に薄い陰影をどれだけ重ねるか（0=純粋な線画）
//   paper    : 地の色 [r,g,b] (0..1)
//   ink      : 線の色 [r,g,b] (0..1)
// モノトーン専用（墨絵調）。地・線ともグレースケール。
const TONES = [
  // 0: 細線・白地（ペン画）
  { spacing: 13.0, lineWidth: 1.2, fill: 0.0, paper: [0.96, 0.95, 0.92], ink: [0.08, 0.08, 0.09] },
  // 1: 密な線・白地
  { spacing: 22.0, lineWidth: 1.1, fill: 0.0, paper: [0.96, 0.95, 0.92], ink: [0.08, 0.08, 0.09] },
  // 2: 黒地に白線（ブループリント風）
  { spacing: 15.0, lineWidth: 1.2, fill: 0.0, paper: [0.05, 0.05, 0.06], ink: [0.94, 0.94, 0.92] },
  // 3: 線＋淡い陰影・白地
  { spacing: 13.0, lineWidth: 1.3, fill: 0.4, paper: [0.96, 0.95, 0.92], ink: [0.08, 0.08, 0.09] },
  // 4: 粗い太線・白地
  { spacing: 8.0,  lineWidth: 2.0, fill: 0.18, paper: [0.95, 0.95, 0.95], ink: [0.10, 0.10, 0.11] },
];

// パターンモード: 万華鏡のセグメント数・ワープ強さ と 曼荼羅成分・仏教的モチーフ。
//   mandala   : 0=純フラクタル, 1=純曼荼羅（蓮弁の同心リング）
//   petals    : 蓮弁の数（segments と揃えると調和する）
//   petalDepth: 蓮弁の深さ
//   spokes    : 法輪のスポーク数（0=なし）
//   core      : 中央の蓮華座コア（0/1）
//   rays      : 放射する光背（後光）（0/1）
//   palace    : 曼荼羅の建築（二重円相・四門・外周の蓮弁輪）（0/1）
//   flame     : 火焔光背（外周の燃え立つ縁）（0/1）
//   jewel     : 中央の宝珠（如意宝珠）（0/1）
//   cosmos    : 虚空（星曼荼羅：天球環＋星＋放射子午線）（0/1）
const MODES = [
  // 0 種：素のフラクタル万華鏡
  { segments: 12, warp: 0.6, mandala: 0.0,  petals: 12, petalDepth: 0.05, spokes: 0,  core: 0, rays: 0, palace: 0, flame: 0, jewel: 0, cosmos: 0 },
  // 1 芽生え：うっすら蓮弁が立ち上がる
  { segments: 16, warp: 0.4, mandala: 0.30, petals: 16, petalDepth: 0.05, spokes: 0,  core: 0, rays: 0, palace: 0, flame: 0, jewel: 0, cosmos: 0 },
  // 2 蓮華：多重の蓮弁＋中央コア＋放射光背
  { segments: 12, warp: 0.3, mandala: 0.85, petals: 12, petalDepth: 0.06, spokes: 0,  core: 1, rays: 1, palace: 0, flame: 0, jewel: 0, cosmos: 0 },
  // 3 曼荼羅：二重円相・四門・外周蓮弁輪の荘厳
  { segments: 16, warp: 0.3, mandala: 0.90, petals: 16, petalDepth: 0.05, spokes: 0,  core: 1, rays: 0, palace: 1, flame: 0, jewel: 0, cosmos: 0 },
  // 4 法輪：輪宝＋火焔光背＋中央宝珠
  { segments: 12, warp: 0.3, mandala: 0.80, petals: 12, petalDepth: 0.05, spokes: 12, core: 0, rays: 0, palace: 0, flame: 1, jewel: 1, cosmos: 0 },
  // 5 生長：有機的な曼荼羅
  { segments: 24, warp: 0.5, mandala: 0.55, petals: 24, petalDepth: 0.04, spokes: 0,  core: 0, rays: 0, palace: 0, flame: 0, jewel: 0, cosmos: 0 },
  // 6 虚空：星曼荼羅（天球環＋星＋放射子午線＋中央宝珠）— 宇宙の真理（最終形）
  { segments: 24, warp: 0.35, mandala: 0.65, petals: 24, petalDepth: 0.045, spokes: 0,  core: 0, rays: 0, palace: 0, flame: 0, jewel: 1, cosmos: 1 },
];
