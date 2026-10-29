// =============================================
// halloween-home.js
// ハロウィンイベントの期間中の、ホーム（タイトル）画面の背景の飾り
//
// ・遠くの丘と、右の丘の上のおばけ屋敷のシルエット（窓の明かりがまたたく）
// ・丘の上に、光るジャック・オ・ランタン（中の光がゆらゆら揺れる）
// ・地面の近くを、うすい霧がゆっくり流れる
// ・ときどき、小さなおばけがふわっと出て消える
//
// 動かないもの（丘・屋敷・かぼちゃ・霧・おばけの形）は、最初に1回だけ絵にしておき、
// 毎フレームはその絵を貼るだけにする（スマホで重くしないため）。
// 数・速さは config.js の events.halloween2026.home。
// 描くのは game.js（Game.setHomeScene で受け取った drawBack を、タイトルのデモのときだけ呼ぶ）。
// 地面そのものはスタートボタンの裏に隠れるので、飾りは塔の左右の丘の上に置く
// =============================================

const HalloweenHome = (() => {
  const W = 450; // ゲームの世界の幅（game.js の WORLD_W）
  const SCALE = 2; // 絵を作るときの細かさ（ゲーム内の 1 を何ピクセルで描くか）。霧はぼやけた絵なので 1 で作る（軽くするため）
  // 飾りの絵の範囲：地面の高さ（groundY）から上へ TOP、下へ BOTTOM（ゲーム内の単位）
  const TOP = 150;
  const BOTTOM = 20;
  // ジャック・オ・ランタンを置く場所 [x, 地面からの高さ, 大きさ]（count の数だけ、前から使う）
  const PUMPKINS = [[40, 58, 26], [96, 46, 20], [342, 52, 22], [16, 40, 16], [130, 30, 15], [300, 36, 16]];
  // おばけ屋敷の窓 [x, 地面からの高さ, 幅, 高さ]（屋敷の絵と同じ位置）
  const WINDOWS = [[388, 98, 7, 9], [410, 98, 7, 9], [399, 128, 6, 7], [388, 78, 7, 9], [410, 78, 7, 9]];

  const conf = () => ((window.GAME_CONFIG.events || {}).halloween2026 || {}).home || {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  let sprites = null; // { pumpkins（かぼちゃの数）, scenery, glow, fog, ghost }。かぼちゃの数を変えたら作りなおす
  let ghosts = []; // { x, y（地面からの高さ）, born, life, size }
  let nextGhostAt = 0;

  // ---------- 最初に1回だけ作る絵 ----------
  function canvasOf(w, h, scale = SCALE) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * scale);
    c.height = Math.ceil(h * scale);
    const g = c.getContext("2d");
    g.scale(scale, scale);
    return { c, g };
  }

  // かぼちゃの数（config の pumpkins。置ける場所の数まで）
  function pumpkinCount() {
    const n = conf().pumpkins == null ? 4 : Math.round(conf().pumpkins);
    return Math.min(PUMPKINS.length, Math.max(0, n));
  }

  function build() {
    const n = pumpkinCount();
    if (sprites && sprites.pumpkins === n) return sprites;
    sprites = { pumpkins: n, scenery: buildScenery(n), glow: buildGlow(), fog: buildFog(), ghost: buildGhost() };
    return sprites;
  }

  // 丘・おばけ屋敷・かぼちゃ（光っていない本体）。y は「地面から上へ」を TOP からの位置に直して描く
  function buildScenery(count) {
    const { c, g } = canvasOf(W, TOP + BOTTOM);
    const Y = (up) => TOP - up; // 地面からの高さ → 絵の中の y
    // 遠くの丘（左と右がこんもり高く、真ん中は塔の後ろで低い）
    g.fillStyle = "#2a1742";
    g.beginPath();
    g.moveTo(-10, Y(-BOTTOM));
    g.lineTo(-10, Y(62));
    g.quadraticCurveTo(50, Y(84), 120, Y(44));
    g.quadraticCurveTo(170, Y(16), W / 2, Y(10));
    g.quadraticCurveTo(290, Y(14), 330, Y(52));
    g.quadraticCurveTo(390, Y(90), W + 10, Y(70));
    g.lineTo(W + 10, Y(-BOTTOM));
    g.closePath();
    g.fill();
    // 枯れ木（左の丘）
    g.strokeStyle = "#1a0d2b";
    g.lineCap = "round";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(66, Y(66));
    g.lineTo(64, Y(108));
    g.moveTo(65, Y(92));
    g.lineTo(52, Y(106));
    g.moveTo(64, Y(100));
    g.lineTo(76, Y(116));
    g.stroke();
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(52, Y(106));
    g.lineTo(46, Y(110));
    g.moveTo(76, Y(116));
    g.lineTo(82, Y(114));
    g.stroke();
    // おばけ屋敷（右の丘の上。とがった屋根と、かたむいた塔）
    g.fillStyle = "#170b26";
    g.beginPath();
    g.moveTo(378, Y(64));
    g.lineTo(378, Y(110));
    g.lineTo(372, Y(110));
    g.lineTo(399, Y(138)); // 屋根のてっぺん
    g.lineTo(426, Y(110));
    g.lineTo(420, Y(110));
    g.lineTo(420, Y(66));
    g.closePath();
    g.fill();
    g.beginPath(); // 左の小さな塔
    g.moveTo(366, Y(60));
    g.lineTo(366, Y(96));
    g.lineTo(362, Y(96));
    g.lineTo(371, Y(124));
    g.lineTo(380, Y(96));
    g.lineTo(376, Y(96));
    g.lineTo(376, Y(62));
    g.closePath();
    g.fill();
    g.fillRect(396, Y(146), 2, 10); // 屋根の上の飾り
    // 窓（明かりの消えた暗い色。明かりは毎フレーム上から重ねる）
    g.fillStyle = "#3a2350";
    for (const [x, up, w, h] of WINDOWS) g.fillRect(x - w / 2, Y(up) - h / 2, w, h);
    // かぼちゃ（本体。顔の穴は、あとで光を重ねると明るく見えるように暗く抜いておく）
    for (const [x, up, s] of PUMPKINS.slice(0, count)) drawPumpkin(g, x, Y(up), s);
    return { canvas: c, w: W, h: TOP + BOTTOM };
  }

  // かぼちゃ1つ（x：真ん中、y：底、s：横幅）
  function drawPumpkin(g, x, y, s) {
    const h = s * 0.78;
    const cy = y - h / 2;
    g.fillStyle = "#e8700f";
    for (const [dx, rx] of [[-s * 0.26, s * 0.3], [s * 0.26, s * 0.3], [0, s * 0.32]]) {
      g.beginPath();
      g.ellipse(x + dx, cy, rx, h / 2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(120, 50, 0, 0.6)";
    g.lineWidth = Math.max(0.6, s * 0.04);
    for (const dx of [-0.12, 0.12]) {
      g.beginPath();
      g.ellipse(x + dx * s, cy, s * 0.12, h / 2 - 0.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#3f6b22"; // へた
    g.fillRect(x - s * 0.05, y - h - s * 0.14, s * 0.1, s * 0.18);
    // 顔（三角の目と、ギザギザの口）
    g.fillStyle = "#ffd257";
    tri(g, x - s * 0.2, cy - h * 0.08, s * 0.1);
    tri(g, x + s * 0.2, cy - h * 0.08, s * 0.1);
    g.beginPath();
    g.moveTo(x - s * 0.28, cy + h * 0.1);
    for (let i = 0; i <= 6; i++) g.lineTo(x - s * 0.28 + (i * s * 0.56) / 6, cy + h * (i % 2 ? 0.2 : 0.12));
    g.lineTo(x + s * 0.24, cy + h * 0.3);
    g.lineTo(x - s * 0.24, cy + h * 0.3);
    g.closePath();
    g.fill();
  }

  function tri(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + r, y + r * 0.7);
    g.lineTo(x - r, y + r * 0.7);
    g.closePath();
    g.fill();
  }

  // かぼちゃの中の光のにじみ（1つ作って、大きさと濃さを変えて貼る）
  function buildGlow() {
    const { c, g } = canvasOf(40, 40);
    const r = g.createRadialGradient(20, 20, 0, 20, 20, 20);
    r.addColorStop(0, "rgba(255, 200, 80, 0.85)");
    r.addColorStop(0.4, "rgba(255, 140, 30, 0.35)");
    r.addColorStop(1, "rgba(255, 120, 20, 0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 40, 40);
    return c;
  }

  // 霧（横につなげても切れ目が見えないように、はみ出した分は反対側にも描く）
  function buildFog() {
    const h = 60;
    const { c, g } = canvasOf(W, h, 1);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = rand() * W;
      const y = h * (0.35 + rand() * 0.4);
      const rx = 30 + rand() * 50;
      const ry = 8 + rand() * 10;
      for (const ox of [-W, 0, W]) {
        const r = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
        r.addColorStop(0, "rgba(214, 200, 240, 0.35)");
        r.addColorStop(1, "rgba(214, 200, 240, 0)");
        g.fillStyle = r;
        g.save();
        g.translate(x + ox, y);
        g.scale(1, ry / rx);
        g.translate(-(x + ox), -y);
        g.beginPath();
        g.arc(x + ox, y, rx, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    return { canvas: c, w: W, h };
  }

  // 小さなおばけ（白いしずくの形に、目と口）
  function buildGhost() {
    const { c, g } = canvasOf(30, 34);
    g.fillStyle = "rgba(245, 240, 255, 0.92)";
    g.beginPath();
    g.moveTo(3, 30);
    g.lineTo(3, 14);
    g.arc(15, 14, 12, Math.PI, 0);
    g.lineTo(27, 30);
    for (let i = 0; i < 4; i++) g.quadraticCurveTo(27 - i * 6 - 3, 26, 27 - (i + 1) * 6, 30);
    g.closePath();
    g.fill();
    g.fillStyle = "#2b1a40";
    for (const x of [11, 19]) {
      g.beginPath();
      g.ellipse(x, 13, 2, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(15, 21, 2.5, 2, 0, 0, Math.PI * 2);
    g.fill();
    return { canvas: c, w: 30, h: 34 };
  }

  // ---------- 毎フレーム ----------
  // ctx は、ゲーム内の座標のまま描ける状態。groundY：地面の高さ（ゲーム内の y）
  // 空・月・こうもりのあとで、塔（柱・土台・キャラ）の前に呼ばれる
  function drawBack(ctx, groundY) {
    const s = build();
    const still = reduced.matches;
    const t = performance.now() / 1000;
    const top = groundY - TOP;
    // 丘・屋敷・かぼちゃ
    ctx.drawImage(s.scenery.canvas, 0, top, s.scenery.w, s.scenery.h);
    // 窓の明かり（ときどき、またたく）
    const blink = conf().windowBlink == null ? 1 : conf().windowBlink;
    WINDOWS.forEach(([x, up, w, h], i) => {
      const flick = still ? 1 : 0.75 + 0.25 * Math.sin(t * (2 + i * 0.7) + i * 2);
      const off = !still && blink > 0 && Math.sin(t * 0.9 * blink + i * 1.7) > 0.93; // たまに消える
      if (off) return;
      ctx.globalAlpha = flick;
      ctx.fillStyle = "#ffcf5a";
      ctx.fillRect(x - w / 2, groundY - up - h / 2, w, h);
    });
    ctx.globalAlpha = 1;
    // かぼちゃの光（中の明かりが、ゆらゆら揺れる）
    const speed = conf().flicker == null ? 1 : conf().flicker;
    for (let i = 0; i < s.pumpkins; i++) {
      const [x, up, size] = PUMPKINS[i];
      const f = still ? 0.85 : 0.75 + 0.15 * Math.sin(t * 7 * speed + i * 3) + 0.1 * Math.sin(t * 13 * speed + i);
      const r = size * 1.6 * f;
      ctx.globalAlpha = f;
      ctx.drawImage(s.glow, x - r, groundY - up - size * 0.4 - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // 霧（ゆっくり流れる）
    const fog = conf().fog || {};
    const fx = still ? 0 : ((t * (fog.speed == null ? 8 : fog.speed)) % W + W) % W;
    ctx.globalAlpha = fog.alpha == null ? 0.8 : fog.alpha;
    // パソコンの横長の画面では、場の左右にも背景が広がるので、霧も左右に3つずつ多めに並べる
    for (let ox = -4 * W; ox <= 3 * W; ox += W) ctx.drawImage(s.fog.canvas, fx + ox, groundY - 70, s.fog.w, s.fog.h);
    ctx.globalAlpha = 1;
    drawGhosts(ctx, groundY, t, still);
  }

  // おばけ：ときどき、塔の左右のどちらかに、ふわっと出て、少し浮かびながら消える
  function drawGhosts(ctx, groundY, t, still) {
    const g = conf().ghosts || {};
    if (still || g.max === 0) {
      ghosts = [];
      return;
    }
    if (!nextGhostAt) nextGhostAt = t + between(g.firstAfter, [1.5, 3]);
    if (t >= nextGhostAt && ghosts.length < (g.max || 2)) {
      const left = Math.random() < 0.5;
      ghosts.push({
        x: left ? 20 + Math.random() * 60 : 330 + Math.random() * 90,
        up: 150 + Math.random() * 110,
        born: t,
        life: g.time || 3,
        size: 0.7 + Math.random() * 0.4,
        dir: left ? 1 : -1,
      });
      nextGhostAt = t + between(g.every, [3, 7]);
    }
    const s = sprites.ghost;
    ghosts = ghosts.filter((o) => t - o.born < o.life);
    for (const o of ghosts) {
      const k = (t - o.born) / o.life; // 0 → 1
      const alpha = Math.sin(k * Math.PI) * 0.85; // ふわっと出て、ふわっと消える
      const w = s.w * o.size;
      const h = s.h * o.size;
      const x = o.x + o.dir * k * 14 + Math.sin(t * 2.4 + o.born) * 3;
      const y = groundY - o.up - k * 18;
      ctx.globalAlpha = alpha;
      ctx.drawImage(s.canvas, x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  const between = (range, def) => {
    const [a, b] = Array.isArray(range) ? range : def;
    return a + Math.random() * (b - a);
  };

  // ホーム画面に使う見た目 { background, platform, bats, birds, drawBack }（config の id から探す。無ければ null）
  function scene() {
    const c = conf();
    const themes = window.GAME_CONFIG.themes || {};
    const background = (themes.backgrounds || []).find((d) => d.id === (c.background || "halloween_night"));
    const platform = (themes.platforms || []).find((d) => d.id === (c.platform || "pumpkin"));
    if (!background || !platform) return null;
    return { background, platform, bats: c.bats == null ? 3 : c.bats, birds: false, drawBack };
  }

  return { scene };
})();
