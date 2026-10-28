// =============================================
// platform-art.js
// 土台と柱の絵（config.js の themes.platforms の style ごとに描き方を変える）
//
// ・見た目だけ。当たり判定（物理の形）は game.js の四角（幅 PLATFORM_W × 高さ PLATFORM_H）のまま
// ・軽くするため、テーマごとに1回だけ別のキャンバスに描いておき、ゲームでは毎フレームそれを貼るだけ
//   （build の結果を覚えておく。テーマを変えると、新しいテーマの絵を1回描く）
// ・style（描き方）：
//     wood    … 板を並べた木目、上は芝生、ふちから草がたれる、側面に小さな花。柱は丸太
//     stone   … れんがのように石を積んだ模様、すき間にこけ。柱も石積み
//     ice     … 半透明の青、表面にななめの光、下につららがたれる。柱は氷の柱
//     gold    … 金の板に彫り模様（ゲーム中は、ときどき光が横に走る）。柱は金の円柱
//     crystal … 宝石のような面と光。柱は水晶の柱
//     pumpkin … かぼちゃのすじ・顔の模様・つるとはっぱ。柱はつるが巻いた木の柱
//     steel   … 鉄の板にリベット、ふちに黄色と黒の注意のしま。柱は赤い鉄骨（ななめの筋交い）
//     cardboard … ダンボールの箱（波の断面・ガムテープ・「天地無用」の印）。柱もダンボールを積んだもの
//   style を書いていない土台は、色だけの四角（前の描き方）になる。
//   使う色は、その土台の body（正面）・top（上の面）・pillar（柱）
// =============================================

const PlatformArt = (() => {
  const SCALE = 2; // 絵の細かさ（ゲーム内の 1 を何ピクセルで描くか）
  // 四角のまわりの余白（たれる草・つらら・つるなどを描くところ。ゲーム内の単位）
  const PAD = { x: 18, top: 16, bottom: 34 };
  const cache = new Map();

  // 土台 def の絵 { platform: { canvas, x, y, w, h }, pillar: { canvas, w, h } } を作る（作ったものは覚えておく）
  // size：{ w, h（土台の四角）, pillarW, pillarH（柱） }。x・y は、四角の左上から見た、絵の左上の位置
  function build(def, size) {
    const key = JSON.stringify([def.id, def.style, def.body, def.top, def.pillar, size]);
    if (cache.has(key)) return cache.get(key);
    const plat = canvasOf(size.w + PAD.x * 2, size.h + PAD.top + PAD.bottom);
    plat.ctx.translate(PAD.x, PAD.top); // 四角の左上を (0, 0) にして描く
    (STYLES[def.style] || STYLES.plain).platform(plat.ctx, size.w, size.h, def);
    drawEdge(plat.ctx, size.w, size.h); // 乗れる範囲（上の面のふち）を見やすく
    const pil = canvasOf(size.pillarW, size.pillarH);
    (STYLES[def.style] || STYLES.plain).pillar(pil.ctx, size.pillarW, size.pillarH, def);
    const art = {
      platform: { canvas: plat.canvas, x: -PAD.x, y: -PAD.top, w: size.w + PAD.x * 2, h: size.h + PAD.top + PAD.bottom },
      pillar: { canvas: pil.canvas, w: size.pillarW, h: size.pillarH },
    };
    cache.set(key, art);
    return art;
  }

  function canvasOf(w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * SCALE);
    canvas.height = Math.ceil(h * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    return { canvas, ctx };
  }

  // ---------- 色の計算 ----------
  // "#rrggbb" を明るく（amount > 0）・暗く（amount < 0）する
  function shade(hex, amount) {
    const n = parseInt(String(hex || "#888888").slice(1), 16);
    const ch = (s) => {
      const v = (n >> s) & 255;
      return Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount));
    };
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // 上の面のふち：明るい線と、両はしの小さな印（どこまで乗れるかが分かるように）
  function drawEdge(ctx, w) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillRect(0, 0, w, 1.6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(0, 0, 2, 6);
    ctx.fillRect(w - 2, 0, 2, 6);
  }

  // 下に影の帯（どの土台にも）
  function bottomShade(ctx, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, h - 6, w, 6);
  }

  // 柱の右側の影
  function pillarShade(ctx, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    ctx.fillRect(w - 16, 0, 16, h);
  }

  // ---------- style ごとの描き方 ----------
  const STYLES = {
    // 鉄骨の台：鉄の板にリベット、上のふちに黄色と黒の注意のしま。柱は赤い鉄骨
    steel: {
      platform(ctx, w, h, d) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, shade(d.body, 0.12));
        g.addColorStop(1, shade(d.body, -0.2));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // 板のつなぎ目と、リベット
        ctx.strokeStyle = shade(d.body, -0.4);
        ctx.lineWidth = 1.2;
        for (let x = 56; x < w; x += 56) line(ctx, x, 8, x, h);
        for (let x = 6; x < w; x += 14) {
          ctx.fillStyle = shade(d.body, -0.35);
          dot(ctx, x, 14, 1.8);
          dot(ctx, x, h - 9, 1.8);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          dot(ctx, x - 0.5, 13.4, 0.8);
          dot(ctx, x - 0.5, h - 9.6, 0.8);
        }
        bottomShade(ctx, w, h);
        // 上の面：注意のしま（黄色と黒のななめ）
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, 7);
        ctx.clip();
        ctx.fillStyle = "#f2c230";
        ctx.fillRect(0, 0, w, 7);
        ctx.fillStyle = "#1d1f22";
        for (let x = -10; x < w + 10; x += 14) {
          ctx.beginPath();
          ctx.moveTo(x, 7);
          ctx.lineTo(x + 7, 0);
          ctx.lineTo(x + 13, 0);
          ctx.lineTo(x + 6, 7);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 7, w, 1.5);
      },
      // 赤い鉄骨の柱：両側の柱と、ななめの筋交い
      pillar(ctx, w, h, d) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = d.pillar;
        ctx.fillRect(0, 0, 9, h);
        ctx.fillRect(w - 9, 0, 9, h);
        ctx.strokeStyle = d.pillar;
        ctx.lineWidth = 5;
        for (let y = 0; y < h; y += 40) {
          line(ctx, 6, y, w - 6, y + 40);
          line(ctx, w - 6, y, 6, y + 40);
          ctx.fillRect(0, y, w, 4);
        }
        ctx.fillStyle = shade(d.pillar, 0.3);
        ctx.fillRect(1.5, 0, 2, h);
        ctx.fillRect(w - 7.5, 0, 2, h);
        pillarShade(ctx, w, h);
      },
    },

    // ダンボールの台：箱の正面に、ガムテープと「天地無用」の印。上の面は、ダンボールの波の断面
    cardboard: {
      platform(ctx, w, h, d) {
        ctx.fillStyle = d.body;
        ctx.fillRect(0, 0, w, h);
        // 紙のすじ（うすい横線）
        ctx.strokeStyle = shade(d.body, -0.08);
        ctx.lineWidth = 1;
        for (let y = 12; y < h; y += 5) line(ctx, 0, y, w, y);
        // ガムテープ（真ん中を縦に）
        ctx.fillStyle = "rgba(214, 170, 105, 0.95)";
        ctx.fillRect(w / 2 - 14, 6, 28, h - 6);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(w / 2 - 14, 6, 28, 3);
        // 「天地無用」の矢印の印（左）と、こわれもののグラスの印（右）
        ctx.strokeStyle = shade(d.body, -0.55);
        ctx.fillStyle = shade(d.body, -0.55);
        ctx.lineWidth = 1.6;
        for (const ax of [w * 0.18, w * 0.18 + 10]) {
          line(ctx, ax, h - 6, ax, 15);
          ctx.beginPath();
          ctx.moveTo(ax - 4, 19);
          ctx.lineTo(ax, 13);
          ctx.lineTo(ax + 4, 19);
          ctx.fill();
        }
        const gx = w * 0.8;
        ctx.beginPath();
        ctx.moveTo(gx - 6, 13);
        ctx.lineTo(gx + 6, 13);
        ctx.quadraticCurveTo(gx + 6, 22, gx, 23);
        ctx.quadraticCurveTo(gx - 6, 22, gx - 6, 13);
        ctx.stroke();
        line(ctx, gx, 23, gx, h - 7);
        line(ctx, gx - 5, h - 7, gx + 5, h - 7);
        bottomShade(ctx, w, h);
        // 上の面：波の断面（ダンボールの切り口）
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 6);
        ctx.strokeStyle = shade(d.top, -0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) ctx.lineTo(x, 3 + Math.sin(x * 0.8) * 2);
        ctx.stroke();
      },
      // ダンボールの箱を積んだ柱
      pillar(ctx, w, h, d) {
        for (let y = 0, i = 0; y < h; y += 34, i++) {
          ctx.fillStyle = shade(d.pillar, (i % 2) * 0.06);
          ctx.fillRect(0, y, w, 33);
          ctx.fillStyle = "rgba(214, 170, 105, 0.9)"; // ガムテープ
          ctx.fillRect(0, y + 13, w, 7);
          ctx.fillStyle = shade(d.pillar, -0.3);
          ctx.fillRect(0, y + 33, w, 1);
        }
        pillarShade(ctx, w, h);
      },
    },

    // 色だけの四角（style を書いていない土台）
    plain: {
      platform(ctx, w, h, d) {
        ctx.fillStyle = d.body;
        ctx.fillRect(0, 0, w, h);
        bottomShade(ctx, w, h);
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 8);
      },
      pillar(ctx, w, h, d) {
        ctx.fillStyle = d.pillar;
        ctx.fillRect(0, 0, w, h);
        pillarShade(ctx, w, h);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 2;
        for (let y = 30; y < h; y += 30) line(ctx, 0, y, w, y);
      },
    },

    // 木の台：板を並べた木目、上は芝生、ふちから草がたれ下がる、側面に小さな花
    wood: {
      platform(ctx, w, h, d) {
        // 板（たて板を並べる）
        const boards = 10;
        for (let i = 0; i < boards; i++) {
          const x = (w / boards) * i;
          ctx.fillStyle = shade(d.body, (i % 3 - 1) * 0.06);
          ctx.fillRect(x, 6, w / boards, h - 6);
          ctx.strokeStyle = shade(d.body, -0.35); // 板のすき間
          ctx.lineWidth = 1.2;
          line(ctx, x, 6, x, h);
          // 木目（ゆるい曲線）
          ctx.strokeStyle = shade(d.body, -0.18);
          ctx.lineWidth = 0.8;
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            const gx = x + 6 + k * 10;
            ctx.moveTo(gx, 10);
            ctx.quadraticCurveTo(gx + 4, h / 2, gx - 1, h - 3);
            ctx.stroke();
          }
          // 釘
          ctx.fillStyle = shade(d.body, -0.5);
          dot(ctx, x + w / boards / 2, 11, 1.2);
        }
        bottomShade(ctx, w, h);
        // 芝生（上の面）と、ふちからたれる草
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 8);
        ctx.fillStyle = shade(d.top, -0.2);
        for (let x = 2; x < w - 2; x += 7) {
          const len = 4 + ((x * 7) % 9);
          tri(ctx, x, 7, x + 5, 7, x + 2.5, 7 + len);
        }
        ctx.fillStyle = shade(d.top, 0.25); // 芝生のつや
        for (let x = 4; x < w; x += 11) ctx.fillRect(x, 1.5, 3, 1.5);
        // 側面の小さな花
        const flowers = [[22, 20, "#ff8fb1"], [70, 28, "#ffe066"], [150, 22, "#ffffff"], [214, 30, "#ff8fb1"], [258, 19, "#b8a6ff"]];
        for (const [fx, fy, color] of flowers) {
          if (fx > w - 6) continue;
          ctx.fillStyle = color;
          for (let a = 0; a < 5; a++) dot(ctx, fx + Math.cos((a * Math.PI * 2) / 5) * 2.4, fy + Math.sin((a * Math.PI * 2) / 5) * 2.4, 1.7);
          ctx.fillStyle = "#f5b400";
          dot(ctx, fx, fy, 1.3);
        }
      },
      // 丸太の柱
      pillar(ctx, w, h, d) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, shade(d.pillar, -0.1));
        g.addColorStop(0.35, shade(d.pillar, 0.15));
        g.addColorStop(1, shade(d.pillar, -0.35));
        ctx.fillStyle = g;
        ctx.fillRect(4, 0, w - 8, h);
        ctx.strokeStyle = shade(d.pillar, -0.4); // 木の皮のすじ
        ctx.lineWidth = 1;
        for (let x = 10; x < w - 8; x += 9) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(x + 3, h * 0.3, x - 3, h * 0.6, x + 1, h);
          ctx.stroke();
        }
        ctx.fillStyle = shade(d.pillar, -0.45); // 節
        ellipse(ctx, w * 0.35, h * 0.45, 4, 6);
      },
    },

    // 石の台：れんがのように石を積んだ模様、すき間にこけ
    stone: {
      platform(ctx, w, h, d) {
        ctx.fillStyle = shade(d.body, -0.3); // 目地
        ctx.fillRect(0, 0, w, h);
        const rows = [[6, 17], [17, 28], [28, h]];
        rows.forEach(([y1, y2], r) => {
          const bw = 34;
          for (let x = r % 2 ? -bw / 2 : 0; x < w; x += bw) {
            const x1 = Math.max(0, x + 1), x2 = Math.min(w, x + bw - 1);
            ctx.fillStyle = shade(d.body, ((x * 13 + r * 7) % 5 - 2) * 0.05);
            ctx.fillRect(x1, y1 + 1, x2 - x1, y2 - y1 - 2);
            ctx.fillStyle = "rgba(255,255,255,0.12)"; // 石の上のふちの光
            ctx.fillRect(x1, y1 + 1, x2 - x1, 1.2);
          }
        });
        // すき間のこけ
        ctx.fillStyle = "rgba(96, 150, 70, 0.85)";
        for (const [mx, my] of [[33, 17], [101, 28], [170, 17], [238, 28], [68, 28], [204, 17]]) {
          if (mx > w) continue;
          ellipse(ctx, mx, my, 5, 2);
          dot(ctx, mx + 4, my + 1.5, 1.6);
        }
        bottomShade(ctx, w, h);
        ctx.fillStyle = d.top; // 上の石の板
        ctx.fillRect(0, 0, w, 6);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(0, 0, w, 1.5);
      },
      // 石積みの柱
      pillar(ctx, w, h, d) {
        ctx.fillStyle = shade(d.pillar, -0.3);
        ctx.fillRect(0, 0, w, h);
        for (let y = 0, r = 0; y < h; y += 22, r++) {
          for (let x = r % 2 ? -17 : 0; x < w; x += 35) {
            const x1 = Math.max(0, x + 1), x2 = Math.min(w, x + 34);
            ctx.fillStyle = shade(d.pillar, ((x + r * 5) % 3 - 1) * 0.06);
            ctx.fillRect(x1, y + 1, x2 - x1, 20);
          }
        }
        ctx.fillStyle = "rgba(96, 150, 70, 0.8)";
        ellipse(ctx, 18, 44, 6, 2.5);
        ellipse(ctx, 50, 88, 5, 2);
        pillarShade(ctx, w, h);
      },
    },

    // 氷の台：半透明の青、表面にななめの光、下につららがたれる
    ice: {
      platform(ctx, w, h, d) {
        ctx.globalAlpha = 0.85;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, shade(d.body, 0.35));
        g.addColorStop(1, shade(d.body, -0.15));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // つらら（四角の下にたれる）
        ctx.fillStyle = shade(d.body, 0.2);
        for (let x = 8; x < w - 6; x += 17) {
          const len = 8 + ((x * 11) % 22);
          tri(ctx, x, h - 1, x + 9, h - 1, x + 4, h + len);
        }
        ctx.globalAlpha = 1;
        // ななめの光
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        for (const x of [30, 46, 120, 200, 214]) {
          if (x > w - 20) continue;
          ctx.beginPath();
          ctx.moveTo(x, 4);
          ctx.lineTo(x + 6, 4);
          ctx.lineTo(x - 6, h - 4);
          ctx.lineTo(x - 12, h - 4);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = d.top; // 上の面（雪のように白く）
        ctx.fillRect(0, 0, w, 6);
      },
      // 氷の柱
      pillar(ctx, w, h, d) {
        ctx.globalAlpha = 0.8;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, shade(d.pillar, 0.3));
        g.addColorStop(0.5, shade(d.pillar, 0.05));
        g.addColorStop(1, shade(d.pillar, -0.25));
        ctx.fillStyle = g;
        ctx.fillRect(6, 0, w - 12, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(16, 0, 4, h);
        ctx.fillRect(24, 0, 1.5, h);
      },
    },

    // 金の台：金の板に彫り模様（ゲーム中は game.js が、ときどき光を横に走らせる）
    gold: {
      platform(ctx, w, h, d) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, shade(d.body, 0.35));
        g.addColorStop(0.5, d.body);
        g.addColorStop(1, shade(d.body, -0.3));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        // 彫り模様：内側のわく、ひし形、うず
        ctx.strokeStyle = shade(d.body, -0.35);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(5, 10, w - 10, h - 16);
        ctx.strokeStyle = shade(d.body, 0.45);
        ctx.strokeRect(6, 11, w - 12, h - 18);
        ctx.fillStyle = shade(d.body, -0.3);
        for (let x = 30; x < w - 20; x += 44) {
          ctx.beginPath();
          ctx.moveTo(x, 21);
          ctx.lineTo(x + 6, 15);
          ctx.lineTo(x + 12, 21);
          ctx.lineTo(x + 6, 27);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = shade(d.body, -0.25);
          ctx.beginPath();
          ctx.arc(x + 25, 21, 4, 0.3, Math.PI * 1.7);
          ctx.stroke();
        }
        bottomShade(ctx, w, h);
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 6);
      },
      // 金の円柱（たてのみぞ）
      pillar(ctx, w, h, d) {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, shade(d.pillar, -0.1));
        g.addColorStop(0.3, shade(d.pillar, 0.4));
        g.addColorStop(1, shade(d.pillar, -0.35));
        ctx.fillStyle = g;
        ctx.fillRect(4, 0, w - 8, h);
        ctx.strokeStyle = shade(d.pillar, -0.3);
        ctx.lineWidth = 1.2;
        for (let x = 14; x < w - 8; x += 10) line(ctx, x, 0, x, h);
      },
    },

    // 宝石の台（ダイヤの台）：三角の面と、白い光
    crystal: {
      platform(ctx, w, h, d) {
        // 三角の面が、乗れる四角の外にはみ出さないように切り抜く
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        for (let x = 0, i = 0; x < w; x += 20, i++) {
          ctx.fillStyle = shade(d.body, i % 2 ? 0.25 : -0.05);
          tri(ctx, x, 0, x + 20, 0, x + 10, h);
          ctx.fillStyle = shade(d.body, i % 2 ? -0.15 : 0.12);
          tri(ctx, x + 10, h, x + 30, h, x + 20, 0);
        }
        ctx.fillStyle = shade(d.body, 0.05);
        tri(ctx, -10, h, 10, h, 0, 0);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (const [sx, sy] of [[40, 14], [130, 24], [215, 12]]) {
          if (sx > w) continue;
          star(ctx, sx, sy, 5);
        }
        ctx.restore();
        bottomShade(ctx, w, h);
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 5);
      },
      // 水晶の柱
      pillar(ctx, w, h, d) {
        ctx.fillStyle = shade(d.pillar, 0.2);
        ctx.fillRect(8, 0, w / 2 - 8, h);
        ctx.fillStyle = shade(d.pillar, -0.15);
        ctx.fillRect(w / 2, 0, w / 2 - 8, h);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(16, 0, 3, h);
      },
    },

    // かぼちゃの台：すじ・顔の模様・つるとはっぱ
    pumpkin: {
      platform(ctx, w, h, d) {
        ctx.fillStyle = d.body;
        ctx.fillRect(0, 0, w, h);
        // たてのすじ
        ctx.strokeStyle = "rgba(120, 50, 0, 0.35)";
        ctx.lineWidth = 2;
        for (let i = -3; i <= 3; i++) {
          const cx = w / 2 + i * 40;
          ctx.beginPath();
          ctx.moveTo(cx, 8);
          ctx.quadraticCurveTo(cx + (i < 0 ? -6 : 6), h / 2, cx, h - 8);
          ctx.stroke();
        }
        bottomShade(ctx, w, h);
        // くり抜いた顔（中から光っている）
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.fillStyle = "#ffd23a";
        tri(ctx, -62, 6, -46, -10, -30, 6);
        tri(ctx, 30, 6, 46, -10, 62, 6);
        tri(ctx, -7, 8, 0, -1, 7, 8);
        ctx.beginPath();
        ctx.moveTo(-40, 10);
        for (const [tx, ty] of [[-30, 15], [-20, 10], [-10, 15], [0, 10], [10, 15], [20, 10], [30, 15], [40, 10]]) ctx.lineTo(tx, ty);
        ctx.lineTo(30, 16);
        ctx.quadraticCurveTo(0, 22, -30, 16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // 上の面（へた）と、つる・はっぱ（ふちの外側に、たれ下がる）
        ctx.fillStyle = d.top;
        ctx.fillRect(0, 0, w, 6);
        ctx.strokeStyle = shade(d.top, -0.1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 4);
        ctx.bezierCurveTo(-14, 14, -2, 22, -12, 30);
        ctx.moveTo(w + 4, 3);
        ctx.bezierCurveTo(w + 14, 10, w + 2, 20, w + 12, 26);
        ctx.stroke();
        ctx.fillStyle = shade(d.top, 0.1);
        leaf(ctx, -8, 12, 7, -0.6);
        leaf(ctx, w + 8, 10, 7, 0.6);
        leaf(ctx, 60, 3, 6, -0.2);
        leaf(ctx, w - 70, 3, 6, 0.3);
      },
      // つるが巻いた木の柱
      pillar(ctx, w, h, d) {
        ctx.fillStyle = d.pillar;
        ctx.fillRect(6, 0, w - 12, h);
        pillarShade(ctx, w - 6, h);
        ctx.strokeStyle = "#4f8a2b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 4) {
          const x = w / 2 + Math.sin(y / 14) * (w / 2 - 10);
          if (y === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#5c9c33";
        leaf(ctx, 20, 30, 6, -0.8);
        leaf(ctx, 52, 82, 6, 0.8);
      },
    },
  };

  // ---------- 小さな部品 ----------
  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function tri(ctx, x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }
  function dot(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function star(ctx, x, y, s) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const r = k % 2 === 0 ? s : s * 0.3;
      const a = (k * Math.PI) / 4;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.fill();
  }
  // はっぱ（しずくの形。angle で向きを変える）
  function leaf(ctx, x, y, s, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s, 0, 0, s);
    ctx.quadraticCurveTo(-s, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  return { build, PAD };
})();
