// =============================================
// aura.js
// レア度ごとのオーラ（キャラのまわりの光・もや・粒）
//
// ・★2：うすい色のふち ／ ★3：ふち＋ときどきキラッ ／ ★4：キャラごとのオーラ（光・闇など。下の TYPES）
// ・強さは2段階：「strong」＝持っている間・落ちている間（強め） ／「rest」＝積んだあと（控えめ）
// ・軽くするため、キャラの形に沿った光（ぼかし）は、キャラ・色・強さごとに一度だけ別のキャンバスに作り、
//   毎フレームはそれを貼るだけにする（shadowBlur を毎フレーム使わない）。粒の数にも上限をつける
// ・見た目だけ。当たり判定には関係しない
// =============================================

const Aura = (() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_PARTICLES = 160; // 粒の数の上限（キャラがたくさん積まれても重くならないように）
  const SPRITE_SCALE = 2; // ぼかしの画像を作るときの細かさ（画面のピクセルに合わせて少し大きめに作る）

  // ---------- オーラの種類（ここに足すと、characters.js の aura で使えるようになる） ----------
  //   glow      : 形に沿った光。内側から外側の順に重ねる { color, blur（ぼかしの大きさ）, alpha（濃さ） }
  //   spread    : true にすると、光が外へ広がっていく
  //   wobble    : true にすると、光がゆらゆら揺れる
  //   particles : 立ちのぼる粒 { kind: "spark"（光の粒）| "smoke"（もや）, colors, rate（1秒あたりの数） }
  //   lightning : ときどき走る稲妻 { colors: [外側, 内側], rate（1秒あたりの回数） }
  const TYPES = {
    // 光のオーラ：白〜金色の光が外へ広がり、光の粒が上へ昇る
    light: {
      glow: {
        strong: [{ color: "#fffbe8", blur: 10, alpha: 1 }, { color: "#ffc93c", blur: 26, alpha: 0.9 }],
        rest: [{ color: "#fff4cc", blur: 6, alpha: 0.85 }, { color: "#ffc93c", blur: 14, alpha: 0.5 }],
      },
      spread: true,
      particles: { kind: "spark", colors: ["#ffffff", "#fff1b8", "#ffd34d"], rate: { strong: 36, rest: 3 } },
    },
    // 闇のオーラ：紫〜黒のもやがゆらゆら立ちのぼり、ときどき暗い稲妻が走る
    dark: {
      glow: {
        strong: [{ color: "#1a0429", blur: 10, alpha: 1 }, { color: "#9b4dff", blur: 26, alpha: 0.85 }],
        rest: [{ color: "#2b0a40", blur: 6, alpha: 0.85 }, { color: "#8a3dff", blur: 14, alpha: 0.45 }],
      },
      wobble: true,
      particles: { kind: "smoke", colors: ["#9b5cff", "#6a2bb0", "#3b0f5c"], rate: { strong: 18, rest: 2 } },
      lightning: { colors: ["#2a0040", "#c9a4ff"], rate: { strong: 1, rest: 0.12 } },
    },
  };

  const has = (type) => !!TYPES[type];

  // キャラのレア度の情報（config.js の rarity）。ノーマルや不明なら null
  function rarityOf(shape) {
    const id = shape && shape.rarity;
    if (!id || id === "N") return null;
    return (window.GAME_CONFIG.rarity || {})[id] || null;
  }

  // ---------- 形に沿った光（一度作って使い回す） ----------
  const sprites = new Map();

  // layers の光を重ねた画像 { canvas, pad }。pad：まわりの余白（ゲーム内の単位）
  function glowSprite(shape, layers) {
    const key = `${shape.file}|${shape.w}|${shape.h}|${JSON.stringify(layers)}`;
    if (sprites.has(key)) return sprites.get(key);
    const pad = Math.max(...layers.map((l) => l.blur)) * 1.6 + 4;
    const c = document.createElement("canvas");
    c.width = Math.ceil((shape.w + pad * 2) * SPRITE_SCALE);
    c.height = Math.ceil((shape.h + pad * 2) * SPRITE_SCALE);
    const g = c.getContext("2d");
    // 画像そのものは画面の外に描き、影（ぼかした形）だけを画面の中に落とす
    const FAR = 10000;
    for (const l of layers) {
      g.save();
      g.globalAlpha = l.alpha;
      g.shadowColor = l.color;
      g.shadowBlur = l.blur * SPRITE_SCALE;
      g.shadowOffsetX = FAR;
      for (let i = 0; i < 2; i++) g.drawImage(shape.img, pad * SPRITE_SCALE - FAR, pad * SPRITE_SCALE, shape.w * SPRITE_SCALE, shape.h * SPRITE_SCALE); // 2回重ねて濃く
      g.restore();
    }
    const sprite = { canvas: c, pad };
    sprites.set(key, sprite);
    return sprite;
  }

  // 光の画像を、キャラの真ん中を中心に scale 倍・alpha の濃さで貼る（ctx はキャラの重心に合わせて回してある）
  function paste(ctx, shape, sprite, scale, alpha, sx = 1, sy = 1) {
    const cx = -shape.com.x + shape.w / 2;
    const cy = -shape.com.y + shape.h / 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale * sx, scale * sy);
    ctx.translate(-cx, -cy);
    ctx.drawImage(sprite.canvas, -shape.com.x - sprite.pad, -shape.com.y - sprite.pad, shape.w + sprite.pad * 2, shape.h + sprite.pad * 2);
    ctx.restore();
  }

  // ★2・★3 のふち（レア度の色）
  function ringLayers(color, level) {
    return level === "strong" ? [{ color, blur: 18, alpha: 1 }] : [{ color, blur: 5, alpha: 0.9 }];
  }

  // ---------- キャラの後ろに光を描く ----------
  // ctx はキャラの重心に移動・回転してある（キャラの画像を描く直前に呼ぶ）。level："strong" | "rest"
  function drawBack(ctx, shape, level) {
    const info = rarityOf(shape);
    if (!info || info.stars < 2) return;
    const t = performance.now() / 1000;
    const calm = reducedMotion.matches; // 動きを控えめにする設定
    const type = info.stars >= 4 && TYPES[shape.aura];
    if (type) {
      const sprite = glowSprite(shape, type.glow[level]);
      if (type.spread && !calm) {
        // 光が外へ広がる：少しずつ大きく、薄くなる光を2つずらして重ねる
        for (const offset of [0, 0.5]) {
          const p = (t * (level === "strong" ? 0.9 : 0.45) + offset) % 1;
          paste(ctx, shape, sprite, 1 + p * (level === "strong" ? 0.35 : 0.15), (1 - p) * 0.8);
        }
      }
      if (type.wobble && !calm) {
        // ゆらゆら：縦横に少し伸び縮みして、上に少しずれる
        const sx = 1 + Math.sin(t * 3.1) * 0.05;
        const sy = 1 + Math.sin(t * 2.3 + 1) * 0.07;
        paste(ctx, shape, sprite, 1.04, 0.9, sx, sy);
      }
      paste(ctx, shape, sprite, 1, calm ? 1 : 0.8 + 0.2 * Math.sin(t * 4));
      return;
    }
    // ★2・★3（★4でオーラが無いキャラも）：レア度の色のふち。持っている間は、ふわふわ強さを変える
    const sprite = glowSprite(shape, ringLayers(info.color, level));
    paste(ctx, shape, sprite, 1, level === "strong" && !calm ? 0.75 + 0.25 * Math.sin(t * 6) : 1);
  }

  // ---------- 粒（光の粒・もや・キラッ）と稲妻 ----------
  const particles = []; // { kind, x, y, vx, vy, size, life, decay, color, phase }
  const bolts = []; // { points, life, colors }

  // キャラのまわりに、粒を出す（ゲーム画面だけ。dt：前のフレームからの秒数）
  // (x, y)：キャラの重心、angle：回転、level："strong" | "rest"
  function emit(shape, x, y, angle, level, dt) {
    const info = rarityOf(shape);
    if (!info || info.stars < 3 || reducedMotion.matches || dt <= 0) return;
    const type = info.stars >= 4 && TYPES[shape.aura];
    // キャラのふちのあたりの、ランダムな位置（回転も合わせる。キャラの上に粒が乗って見えないように、ふちから出す）
    const spot = () => {
      const a = Math.random() * Math.PI * 2;
      const lx = Math.cos(a) * shape.w * 0.42;
      const ly = Math.sin(a) * shape.h * 0.42;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return { x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos };
    };
    if (!type) {
      // ★3：キラッ（持っている間はたくさん、積んだあとはときどき）
      spawn(dt * (level === "strong" ? 20 : 0.5), () => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.max(shape.w, shape.h) * 0.5;
        return { kind: "sparkle", x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: (Math.random() - 0.5) * 36, vy: -24 - Math.random() * 36, size: 3 + Math.random() * 4, life: 1, decay: 1.2, color: "#fff6c2" };
      });
      return;
    }
    const pc = type.particles;
    if (pc) {
      spawn(dt * pc.rate[level], () => {
        const p = spot();
        const color = pc.colors[Math.floor(Math.random() * pc.colors.length)];
        if (pc.kind === "smoke") {
          return { kind: "smoke", x: p.x, y: p.y, vx: (Math.random() - 0.5) * 12, vy: -14 - Math.random() * 22, size: 4 + Math.random() * 5, life: 1, decay: 1 / (1.1 + Math.random() * 0.9), color, phase: Math.random() * 6 };
        }
        return { kind: "spark", x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 45, size: 1.4 + Math.random() * 2, life: 1, decay: 1 / (0.7 + Math.random() * 0.7), color };
      });
    }
    const lc = type.lightning;
    if (lc && Math.random() < lc.rate[level] * dt) {
      // 稲妻：キャラのまわりの1点から、ギザギザに走る
      const from = spot();
      const dir = Math.random() * Math.PI * 2;
      const len = 25 + Math.random() * 35;
      const points = [from];
      for (let i = 1; i <= 6; i++) {
        const d = (len * i) / 6;
        points.push({ x: from.x + Math.cos(dir) * d + (Math.random() - 0.5) * 12, y: from.y + Math.sin(dir) * d + (Math.random() - 0.5) * 12 });
      }
      bolts.push({ points, life: 1, colors: lc.colors });
      if (bolts.length > 12) bolts.shift();
    }
  }

  // n 個（小数の分は確率で）の粒を作る
  function spawn(n, make) {
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (count-- > 0 && particles.length < MAX_PARTICLES) particles.push(make());
  }

  // 粒を動かす（ゲーム画面の毎フレーム）
  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "smoke") {
        p.phase += dt * 3;
        p.x += Math.sin(p.phase) * 8 * dt; // ゆらゆら
        p.size += 10 * dt; // ふくらむ
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i].life -= dt / 0.2; // 0.2秒で消える
      if (bolts[i].life <= 0) bolts.splice(i, 1);
    }
  }

  // もや（キャラの後ろに描く。キャラが隠れないように）
  function drawSmoke(ctx) {
    for (const p of particles) {
      if (p.kind !== "smoke") continue;
      // うすい丸を重ねて、やわらかいもやに見せる
      ctx.globalAlpha = Math.min(1, p.life * 1.4) * 0.22;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 光の粒・キラッ・稲妻を描く（キャラの手前に。ゲーム内の座標で）
  function drawFront(ctx) {
    for (const p of particles) {
      if (p.kind === "smoke") continue;
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      ctx.fillStyle = p.color;
      if (p.kind === "sparkle") {
        // 4つのとんがりがある星の形
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const rr = k % 2 === 0 ? p.size : p.size * 0.3;
          const ang = (k * Math.PI) / 4;
          ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
        }
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const b of bolts) {
      ctx.globalAlpha = b.life;
      ctx.lineJoin = "round";
      for (const [color, width] of [[b.colors[0], 4], [b.colors[1], 1.4]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        b.points.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // 粒をすべて消す（ゲームを始めなおしたとき）
  function clear() {
    particles.length = 0;
    bolts.length = 0;
  }

  return { has, drawBack, emit, update, drawSmoke, drawFront, clear, get count() { return particles.length; } };
})();
