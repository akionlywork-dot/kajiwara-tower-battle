// =============================================
// card.js
// リザルトカード：ゲームの結果を1枚の画像にまとめて、SNS で共有する
//
// 画像の中身：ゲームタイトル・名前・アイコン・称号・スコア・積んだ数・高さ・モード・タワーの絵・URL
// 大きさは「横長 1200×630」と「縦長 1080×1350」から選べる。
// 写真アイコンは、載せるかどうかを選べる（初めは載せない。プライバシーのため）
// =============================================

const Card = (() => {
  const $ = (id) => document.getElementById(id);
  const SIZES = {
    landscape: { w: 1200, h: 630 },
    portrait: { w: 1080, h: 1350 },
  };
  const FONT = '"Hiragino Maru Gothic ProN", "Rounded Mplus 1c", "BIZ UDPGothic", "Yu Gothic", sans-serif';
  // 色（style.css の :root と同じ）
  const COLOR = { bg1: "#2b3a55", bg2: "#45618f", text: "#ffffff", sub: "#c9d3e6", primary: "#ff7a59", gold: "#ffd84d", panel: "rgba(255,255,255,0.12)" };

  let info = null; // カードに載せる内容（open で受け取る）
  let canvas = null; // 作った画像
  let previewUrl = null;

  function init() {
    for (const btn of document.querySelectorAll("[data-card-size]")) {
      btn.addEventListener("click", () => {
        Settings.set("cardSize", btn.dataset.cardSize);
        render();
      });
    }
    $("toggle-card-icon").addEventListener("click", () => {
      Settings.set("cardIcon", !Settings.get("cardIcon"));
      render();
    });
    $("btn-card-share").addEventListener("click", share);
  }

  // カードの画面を開く
  // data: { name, titleText, frame（称号の枠。frames.js）, icon, modeName, score（無ければ null）, headline（スコアの代わりの文字）, count, height }
  function open(data) {
    info = data;
    UI.show("card");
    render();
  }

  // 公開ページの URL（index.html の og:url）。無ければ今のページ
  function gameUrl() {
    const meta = document.querySelector('meta[property="og:url"]');
    return (meta && meta.content) || location.origin + location.pathname;
  }

  // 画像を作りなおして、見本を表示する
  async function render() {
    const sizeId = SIZES[Settings.get("cardSize")] ? Settings.get("cardSize") : "landscape";
    for (const btn of document.querySelectorAll("[data-card-size]")) {
      btn.classList.toggle("selected", btn.dataset.cardSize === sizeId);
    }
    // 写真アイコンのスイッチは、写真を設定しているときだけ出す
    $("card-icon-row").classList.toggle("hidden", !info.icon);
    $("toggle-card-icon").setAttribute("aria-checked", String(!!Settings.get("cardIcon")));

    const useIcon = info.icon && Settings.get("cardIcon");
    const avatar = useIcon ? await loadImage(info.icon) : null;
    // 称号の飾り（カボチャなど。星なら null）
    const decoSrc = info.frame ? Frames.decorationImage(info.frame.decoration) : null;
    decoImg = decoSrc ? await loadImage(decoSrc) : null;
    canvas = draw(SIZES[sizeId], sizeId, avatar);
    canvas.toBlob((blob) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      $("card-img").src = previewUrl;
      $("card-img").className = `card-img ${sizeId}`;
    }, "image/png");
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // ---------- 描く ----------
  function draw(size, sizeId, avatar) {
    const c = document.createElement("canvas");
    c.width = size.w;
    c.height = size.h;
    const ctx = c.getContext("2d");
    // 背景
    const g = ctx.createLinearGradient(0, 0, size.w * 0.3, size.h);
    g.addColorStop(0, COLOR.bg1);
    g.addColorStop(1, COLOR.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size.w, size.h);

    if (sizeId === "landscape") {
      // 左にタワー、右に結果
      drawTower(ctx, 40, 40, 440, 550);
      let y = 70;
      y = drawTitle(ctx, 530, y, 640, 34);
      y = drawPlayer(ctx, 530, y + 30, 640, avatar, 88);
      y = drawScore(ctx, 530, y + 30, 640, 96);
      drawStats(ctx, 530, y + 20, 640, 96);
      drawUrl(ctx, 530, size.h - 46, 640, "left");
    } else {
      // 上に名前、まん中にタワー、下に結果
      let y = 70;
      y = drawTitle(ctx, 60, y, 960, 40);
      y = drawPlayer(ctx, 60, y + 28, 960, avatar, 100);
      drawTower(ctx, 60, y + 32, 960, 690);
      y += 32 + 690 + 30;
      y = drawScore(ctx, 60, y, 960, 96, "center");
      drawStats(ctx, 60, y + 20, 960, 100);
      drawUrl(ctx, 60, size.h - 40, 960, "center");
    }
    return c;
  }

  // ゲームタイトル。返り値は、描いたものの下端の y
  function drawTitle(ctx, x, y, w, fontSize) {
    ctx.fillStyle = COLOR.primary;
    ctx.font = `bold ${fontSize}px ${FONT}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("かじわらタワーバトル", x, y, w);
    return y + fontSize;
  }

  // アイコン・名前・称号・モード
  function drawPlayer(ctx, x, y, w, avatar, size) {
    const r = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.closePath();
    if (avatar) {
      ctx.clip();
      ctx.drawImage(avatar, x, y, size, size);
    } else {
      ctx.fillStyle = COLOR.primary;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(size * 0.5)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText([...info.name][0] || "?", x + r, y + r + 2);
    }
    ctx.restore();
    drawFrameRing(ctx, x + r, y + r, r, info.frame);

    const tx = x + size + 24;
    const tw = w - size - 24;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOR.text;
    ctx.font = `bold ${fitFont(ctx, info.name, tw, 46)}px ${FONT}`;
    ctx.fillText(info.name, tx, y + (info.titleText ? 2 : r - 26));
    if (info.titleText) {
      // 称号の札（称号の枠と同じ色。枠なしなら、前と同じ金色）
      titlePill(ctx, info.titleText, tx, y + 58, 24, info.frame);
    }
    // モードは、アイコンの下に
    pill(ctx, info.modeName, x, y + size + 20, 24, "rgba(142,92,240,0.9)", "#fff");
    return y + size + 20 + 40;
  }

  // スコア（対戦なら「〇〇の勝ち！」）
  function drawScore(ctx, x, y, w, fontSize, align = "left") {
    ctx.textBaseline = "top";
    ctx.textAlign = align;
    const ax = align === "center" ? x + w / 2 : x;
    ctx.fillStyle = COLOR.gold;
    if (info.score !== null) {
      ctx.font = `bold ${fontSize}px ${FONT}`;
      const num = String(info.score);
      const unit = " 点";
      const numW = ctx.measureText(num).width;
      ctx.font = `bold ${fontSize * 0.4}px ${FONT}`;
      const unitW = ctx.measureText(unit).width;
      const left = align === "center" ? ax - (numW + unitW) / 2 : ax;
      ctx.textAlign = "left";
      ctx.font = `bold ${fontSize}px ${FONT}`;
      ctx.fillText(num, left, y);
      ctx.font = `bold ${fontSize * 0.4}px ${FONT}`;
      ctx.fillText(unit, left + numW, y + fontSize * 0.52);
    } else {
      ctx.font = `bold ${fitFont(ctx, info.headline, w, fontSize * 0.7)}px ${FONT}`;
      ctx.fillText(info.headline, ax, y + 10);
    }
    return y + fontSize;
  }

  // 積んだ数・高さ
  function drawStats(ctx, x, y, w, h) {
    const items = [["積んだ数", `${info.count}体`], ["高さ", `${info.height.toFixed(2)}m`]];
    const gap = 16;
    const bw = (w - gap * (items.length - 1)) / items.length;
    items.forEach(([label, value], i) => {
      const bx = x + i * (bw + gap);
      ctx.fillStyle = COLOR.panel;
      roundRect(ctx, bx, y, bw, h, 18);
      ctx.fill();
      ctx.fillStyle = COLOR.sub;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText(label, bx + bw / 2, y + 12);
      ctx.fillStyle = COLOR.text;
      ctx.font = `bold ${Math.round(h * 0.42)}px ${FONT}`;
      ctx.fillText(value, bx + bw / 2, y + 40);
    });
  }

  // タワーの絵（角を丸くした枠の中に）
  function drawTower(ctx, x, y, w, h) {
    const img = Game.towerImage(w, h);
    ctx.save();
    roundRect(ctx, x, y, w, h, 24);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, h, 24);
    ctx.stroke();
  }

  function drawUrl(ctx, x, y, w, align) {
    ctx.fillStyle = COLOR.sub;
    ctx.font = `bold 24px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    ctx.fillText(gameUrl().replace(/^https?:\/\//, "").replace(/\/$/, ""), align === "center" ? x + w / 2 : x, y, w);
  }

  // 角の丸い四角の形（塗る・線を引くのは呼んだ側）
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 称号の枠（frames.js の rank。画面の CSS と同じ形・同じ色を、キャンバスに描く） ----------
  // 形はどの格も同じ（輪＋てっぺんの小さな星）。色は style.css の「格ごとの色」と同じ
  //   color：輪・星の色、dark：輪の外側のふち・札のふち、light：札の上側の明るい色、text：札の文字の色
  //   rainbow：虹色（輪・星・札）、badge：札の塗り（ふだんは light → color。badgeAcross なら左から右へ）
  //   ring：輪の塗り（札と同じ色にするとき。上から下へ。無ければ color）
  const FRAME_COLORS = {
    bronze: { color: "#cd8a4f", dark: "#6e4019", light: "#f2c79c", text: "#3d2208" },
    silver: { color: "#c9d1da", dark: "#6f7984", light: "#ffffff", text: "#2b3a55" },
    gold: { color: "#ffd84d", dark: "#a87700", light: "#fff3b0", text: "#4a3500", glow: "rgba(255, 216, 77, 0.9)" },
    legend: { color: "#b65cf0", dark: "#4a2470", light: "#ffffff", text: "#ffffff", rainbow: true },
    event: { color: "#ff8a1f", dark: "#3b1458", light: "#ffc27a", text: "#ffb15c", badge: ["#5a2380", "#3b1458"], ring: ["#5a2380", "#3b1458"] },
    mythic: { color: "#fff6d6", dark: "#fff6d6", light: "#ffffff", text: "#ffffff", glow: "rgba(255, 246, 214, 0.95)", badge: ["#2a1660", "#4b2a9a", "#1d4f8a"], badgeAcross: true, ring: ["#4b2a9a", "#2a1660", "#1d4f8a"] },
    secret: { color: "#8f5bff", dark: "#1a0b2e", light: "#c9a8ff", text: "#f3e6ff", badge: ["#3a1a66", "#1a0b2e"], ring: ["#3a1a66", "#1a0b2e"] },
  };
  const RAINBOW = ["#ff5d73", "#ffc21a", "#4cd964", "#3d8bff", "#b65cf0", "#ff5d73"];
  let decoImg = null; // 称号の飾りの画像（カボチャなど。星なら null。render で読み込む）

  // グラデーションに、色を等間隔に並べる
  function stops(g, colors) {
    colors.forEach((c, i) => g.addColorStop(colors.length > 1 ? i / (colors.length - 1) : 0, c));
    return g;
  }

  // 虹色（輪・星は丸く回る虹、対応していないブラウザでは、ななめの虹色）
  function rainbow(ctx, cx, cy, r) {
    const g = ctx.createConicGradient ? ctx.createConicGradient(0, cx, cy) : ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    return g;
  }

  // アイコンのまわりの枠（枠なしなら、前と同じ白い輪）。太さ・星の大きさは、画面の CSS と同じ割合
  function drawFrameRing(ctx, cx, cy, r, frame) {
    if (frame && frame.rank === "dev") return drawDevRing(ctx, cx, cy, r);
    if (frame && STAFF_COLORS[frame.rank]) return drawStaffRing(ctx, cx, cy, r, frame);
    const f = frame && FRAME_COLORS[frame.rank];
    if (!f) {
      ring(ctx, cx, cy, r, "#fff", 4);
      return;
    }
    const d = r * 2; // アイコンの大きさ（CSS の --av）
    const w = Math.max(2, d * 0.07); // 輪の太さ
    const edge = Math.max(1, d * 0.025); // 外側のふち
    ctx.save();
    if (f.glow) {
      // 金：外側に光のにじみ
      ctx.shadowColor = f.glow;
      ctx.shadowBlur = d * 0.12;
    }
    ring(ctx, cx, cy, r + w / 2 + edge / 2, f.dark, w + edge * 2);
    ctx.restore();
    ring(ctx, cx, cy, r + w / 2, f.rainbow ? rainbow(ctx, cx, cy, r) : f.ring ? stops(ctx.createLinearGradient(0, cy - r, 0, cy + r), f.ring) : f.color, w);
    // ふちに並ぶ星（格の数だけ。画面の CSS と同じ大きさ・並び。frames.js の STAR_LAYOUT）
    const n = Frames.starCount(frame.rank);
    const lay = Frames.starLayout(n);
    const sr = (d * lay.s) / 2;
    const starR = d * 0.52; // 星の真ん中を置く円の半径
    const sy = cy - starR; // 虹色のぬりの基準（いちばん上）
    const fill = f.rainbow ? (() => {
      // 虹：星の列の左から右へ（画面の CSS と同じ）
      const g = ctx.createLinearGradient(cx - starR, 0, cx + starR, 0);
      RAINBOW.slice(0, -1).forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      return g;
    })() : (() => {
      const g = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
      g.addColorStop(0, f.light);
      g.addColorStop(1, f.color);
      return g;
    })();
    for (const deg of lay.angles) {
      const t = (deg * Math.PI) / 180;
      const sx = cx + starR * Math.sin(t);
      const syy = cy - starR * Math.cos(t);
      if (decoImg) {
        ctx.drawImage(decoImg, sx - sr, syy - sr, sr * 2, sr * 2); // 称号の飾り（カボチャなど）
        continue;
      }
      star(ctx, sx, syy, sr + edge, f.dark);
      star(ctx, sx, syy, sr, fill);
    }
  }

  // スタッフの称号（管理者・社員・運営）の枠と札の色（画面の style.css の .frame-staff-〇〇・.rank-staff-〇〇 と同じ）
  //   ring：輪、edge：輪の外側のふち、tag：枠の下の札の地 / 文字、badge：称号の札の地 / 文字 / ふち
  const STAFF_COLORS = {
    "staff-admin": { ring: "#141414", edge: "#e8c25a", tag: ["#e8c25a", "#141414"], badge: ["#141414", "#f3d27a", "#e8c25a"] },
    "staff-employee": { ring: "#1d3a6e", edge: "#ffffff", tag: ["#ffffff", "#1d3a6e"], badge: ["#1d3a6e", "#ffffff", "#ffffff"] },
    "staff-operator": { ring: "#d62f3a", edge: "#ffffff", tag: ["#ffffff", "#d62f3a"], badge: ["#d62f3a", "#ffffff", "#ffffff"] },
  };

  // スタッフの枠：色の輪に、外側のふち。星の代わりに、枠の下に札（ADMIN・STAFF・運営）
  function drawStaffRing(ctx, cx, cy, r, frame) {
    const c = STAFF_COLORS[frame.rank];
    const d = r * 2;
    const w = Math.max(3, d * 0.08);
    ring(ctx, cx, cy, r + w / 2 + 1.5, c.edge, w + 3);
    ring(ctx, cx, cy, r + w / 2, c.ring, w);
    const label = frame.label || "";
    if (!label) return;
    const size = Math.max(9, d * 0.16);
    ctx.save();
    ctx.font = `bold ${size}px ${FONT}`;
    const tw = ctx.measureText(label).width + size;
    const th = size * 1.35;
    const ty = cy + r + w - th / 2;
    ctx.fillStyle = c.tag[0];
    roundRect(ctx, cx - tw / 2, ty, tw, th, th / 2);
    ctx.fill();
    ctx.fillStyle = c.tag[1];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, ty + th / 2 + 1);
    ctx.restore();
  }

  // 開発者の枠：黒っぽい輪に、緑に光るふち。ふちの外側に </> と 0・1 を並べる（画面の .frame-dev と同じ）
  function drawDevRing(ctx, cx, cy, r) {
    const d = r * 2;
    const w = Math.max(2, d * 0.07);
    ctx.save();
    ctx.shadowColor = "rgba(57, 255, 136, 0.8)";
    ctx.shadowBlur = d * 0.12;
    ring(ctx, cx, cy, r + w + 1, "#39ff88", 2);
    ctx.restore();
    ring(ctx, cx, cy, r + w / 2, "#0b1410", w);
    // ふちに沿った文字
    const text = "</> 1 0 1 1 0 </> 0 1 0 0 1 </> 1 1 0 1 0 </> 0 0 1 0 1";
    const R = r + w + d * 0.1;
    const size = Math.max(9, d * 0.11);
    ctx.save();
    ctx.font = `bold ${size}px Menlo, Consolas, monospace`;
    ctx.fillStyle = "#39ff88";
    ctx.shadowColor = "rgba(57, 255, 136, 0.7)";
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = (size * 0.66) / R; // 1文字ぶんの角度
    let a = -Math.PI / 2 - (step * text.length) / 2;
    for (const ch of text) {
      if (a > Math.PI * 1.5 - step) break; // 1周を超えない
      ctx.save();
      ctx.translate(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      a += step;
    }
    ctx.restore();
  }

  function ring(ctx, cx, cy, r, style, width) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 五角の星（真ん中 x, y、外側の半径 r）
  function star(ctx, x, y, r, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // 称号の札（枠と同じ色。星は枠の方に付く）
  function titlePill(ctx, text, x, y, fontSize, frame) {
    const f = frame && FRAME_COLORS[frame.rank];
    if (frame && frame.rank === "dev") return devPill(ctx, text, x, y, fontSize);
    if (frame && STAFF_COLORS[frame.rank]) {
      // スタッフの称号の札：専用の色の地に、ふち
      const [bgColor, fg, line] = STAFF_COLORS[frame.rank].badge;
      ctx.font = `bold ${fontSize}px ${FONT}`;
      const h = fontSize + 16;
      const pw = ctx.measureText(text).width + 32;
      pill(ctx, text, x, y, fontSize, bgColor, fg);
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      roundRect(ctx, x + 1, y + 1, pw - 2, h - 2, (h - 2) / 2);
      ctx.stroke();
      return;
    }
    if (!f) return pill(ctx, text, x, y, fontSize, COLOR.gold, "#2b3a55"); // 枠なしなら、前と同じ金色
    const label = text;
    ctx.font = `bold ${fontSize}px ${FONT}`;
    const h = fontSize + 16;
    const pw = ctx.measureText(label).width + 32;
    let bg;
    if (f.rainbow) {
      bg = ctx.createLinearGradient(x, y, x + pw, y);
      RAINBOW.forEach((c, i) => bg.addColorStop(i / (RAINBOW.length - 1), c));
    } else {
      bg = stops(f.badgeAcross ? ctx.createLinearGradient(x, y, x + pw, y) : ctx.createLinearGradient(0, y, 0, y + h), f.badge || [f.light, f.color]);
    }
    pill(ctx, label, x, y, fontSize, bg, f.text);
    ctx.strokeStyle = f.dark;
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, pw - 2, h - 2, (h - 2) / 2);
    ctx.stroke();
  }

  // 開発者の札（コード風：黒地に緑の文字と </>）
  function devPill(ctx, text, x, y, fontSize) {
    const label = `</> ${text}_`;
    ctx.font = `bold ${fontSize}px Menlo, Consolas, monospace`;
    const h = fontSize + 16;
    const pw = ctx.measureText(label).width + 32;
    ctx.save();
    ctx.shadowColor = "rgba(57, 255, 136, 0.7)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#07110c";
    roundRect(ctx, x, y, pw, h, 8);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#39ff88";
    ctx.lineWidth = 2;
    roundRect(ctx, x + 1, y + 1, pw - 2, h - 2, 8);
    ctx.stroke();
    ctx.fillStyle = "#39ff88";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 16, y + h / 2 + 1);
  }

  // 丸い札（称号・モード）
  function pill(ctx, text, x, y, fontSize, bg, fg) {
    ctx.font = `bold ${fontSize}px ${FONT}`;
    const tw = ctx.measureText(text).width;
    const h = fontSize + 16;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, tw + 32, h, h / 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 16, y + h / 2 + 1);
  }

  // 幅 maxW に収まる文字の大きさ（base から小さくしていく）
  function fitFont(ctx, text, maxW, base) {
    let size = base;
    while (size > 16) {
      ctx.font = `bold ${size}px ${FONT}`;
      if (ctx.measureText(text).width <= maxW) break;
      size -= 2;
    }
    return size;
  }

  // ---------- 共有 ----------
  function share() {
    if (!canvas) return;
    const text = info.score !== null
      ? `かじわらタワーバトルで ${info.score}点！（${info.count}体・${info.height.toFixed(2)}m）\n${gameUrl()}`
      : `かじわらタワーバトルで対戦！${info.headline}\n${gameUrl()}`;
    canvas.toBlob((blob) => Share.image(blob, "kajiwara-tower-battle.png", text), "image/png");
  }

  return { init, open };
})();
