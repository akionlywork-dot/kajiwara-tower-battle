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
  // data: { name, titleText, icon, modeName, score（無ければ null）, headline（スコアの代わりの文字）, count, height }
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
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
    ctx.stroke();

    const tx = x + size + 24;
    const tw = w - size - 24;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOR.text;
    ctx.font = `bold ${fitFont(ctx, info.name, tw, 46)}px ${FONT}`;
    ctx.fillText(info.name, tx, y + (info.titleText ? 2 : r - 26));
    if (info.titleText) {
      pill(ctx, info.titleText, tx, y + 58, 24, COLOR.gold, "#2b3a55");
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
