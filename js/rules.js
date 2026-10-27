// =============================================
// rules.js
// 特殊ルールの動き（名前・説明・数値は config.js の rules）
//
// 新しいルールを足すとき：
//   1. config.js の rules に { name, icon, description, 数値… } を足す
//   2. 下の BEHAVIORS に、同じ名前で動きを書く。使える入口（フック）は次のとおり。
//      どれも省略してよい（必要なものだけ書く）
//        bodyOptions(options, p)   … キャラの物理的な性質を変える（options を変えて返す）
//        platformOptions(p)        … 土台の物理的な性質（{ friction: … } など）
//        shapeScale(p)             … キャラの大きさの倍率
//        start(game, p, state)     … ゲーム開始のとき
//        step(game, p, state)      … 物理演算の1ステップ（60分の1秒）ごと
//                                    （乱数は Math.random ではなく game.random() を使う。挑戦状で同じ展開にするため）
//        draw(ctx, game, p, state) … 画面に何か描く（画面の座標で描く）
//        simulate(game, p, state)  … CPU が置き方を試すときの、ルールの動き（{ step(落ちているキャラの配列) } を返す。
//                                    試し用の世界の1ステップ（60分の1秒）ごとに step が呼ばれる。乱数は使わない）
//      p は config.js の数値、state はそのルールが自由に使える入れ物、
//      game はゲーム本体の情報（下の Game.ruleAPI を参照）
// =============================================

const Rules = (() => {
  const BEHAVIORS = {
    // ---------- 風 ----------
    // interval 秒ごとに、duration 秒のあいだ、左か右から風が吹く。
    // 着地する前の（落ちている途中の）キャラだけが流される
    wind: {
      start(game, p, s) {
        s.nextAt = p.interval * 1000; // 次の風が吹き始める時刻
        s.endAt = 0; // 今の風が止む時刻
        s.dir = 0; // 風の向き（-1:左へ / 1:右へ / 0:無風）
      },
      step(game, p, s) {
        const t = game.simTime;
        if (s.dir === 0 && t >= s.nextAt) {
          s.dir = game.random() < 0.5 ? -1 : 1;
          s.endAt = t + p.duration * 1000;
        } else if (s.dir !== 0 && t >= s.endAt) {
          s.dir = 0;
          s.nextAt = t + p.interval * 1000;
        }
        if (s.dir === 0) return;
        for (const b of game.bodies()) {
          if (b.landed) continue; // 着地したキャラは流さない
          game.Body.setVelocity(b, { x: b.velocity.x + s.dir * p.strength, y: b.velocity.y });
        }
      },
      draw(ctx, game, p, s) {
        const t = game.simTime;
        const W = game.worldW;
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 22px sans-serif";
        if (s.dir !== 0) {
          // 風の筋（横に流れる線）
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 2;
          for (let i = 0; i < 9; i++) {
            const y = 140 + i * 70 + Math.sin(i * 7) * 20;
            const x = ((t * 0.5 * s.dir + i * 137) % (W + 200) + W + 200) % (W + 200) - 100;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - s.dir * 60, y);
            ctx.stroke();
          }
          ctx.fillStyle = "#fff";
          ctx.fillText(s.dir > 0 ? "風 →→→" : "←←← 風", W / 2, 120);
        } else if (s.nextAt - t < 1500) {
          // 吹く直前の予告
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillText("風が来る！", W / 2, 120);
        }
        ctx.restore();
      },
    },

    // ---------- 傾く土台 ----------
    // 土台が、左右に maxAngle 度まで、period 秒で1往復するように傾く
    tilt: {
      step(game, p) {
        const angle = ((p.maxAngle * Math.PI) / 180) * Math.sin((game.simTime / (p.period * 1000)) * Math.PI * 2);
        game.setPlatformAngle(angle);
      },
    },

    // ---------- つるつる ----------
    slippery: {
      bodyOptions(options, p) {
        return Object.assign({}, options, { friction: p.friction, frictionStatic: p.frictionStatic });
      },
      platformOptions(p) {
        return { friction: p.friction };
      },
    },

    // ---------- ジャイアント ----------
    giant: {
      shapeScale(p) {
        return p.scale;
      },
    },

    // ---------- おばけ屋敷（ハロウィンイベントのステージ） ----------
    // 暗闇：画面全体を暗くし、持っているキャラ・落ちているキャラのまわりだけ丸く明るくする
    // 稲妻：数秒おきに光り、一瞬だけ全体がよく見える
    // おばけ：ときどき画面を横切り、通り道にいる落下中のキャラを横に押す（CPU の試算でも同じように押す）
    haunted: {
      start(game, p, s) {
        s.nextBolt = between(game, p.lightningEvery) * 1000;
        s.flashAt = -1e9; // 最後に光った時刻
        s.ghosts = []; // { x, y（画面の割合）, dir, age }
        s.nextGhost = 1500 + between(game, p.ghostEvery) * 1000;
      },
      step(game, p, s) {
        const t = game.simTime;
        if (t >= s.nextBolt) {
          s.flashAt = t;
          s.boltX = 60 + game.random() * (game.worldW - 120); // 稲妻の見た目の位置
          s.nextBolt = t + between(game, p.lightningEvery) * 1000;
        }
        if (t >= s.nextGhost) {
          const dir = game.random() < 0.5 ? 1 : -1;
          s.ghosts.push({ x: dir > 0 ? -60 : game.worldW + 60, y: 0.25 + game.random() * 0.4, dir, age: 0 });
          s.nextGhost = t + between(game, p.ghostEvery) * 1000;
        }
        stepGhosts(s.ghosts, p, game.worldW);
        const falling = game.bodies().filter((b) => !b.landed);
        pushByGhosts(s.ghosts, falling, p, game);
      },
      // CPU の試算用：今画面にいるおばけが、この先も同じように動いて押す（新しく出てくるおばけは予想しない）
      simulate(game, p, s) {
        const ghosts = s.ghosts.map((g) => Object.assign({}, g));
        return {
          step(falling) {
            stepGhosts(ghosts, p, game.worldW);
            pushByGhosts(ghosts, falling, p, game);
          },
        };
      },
      draw(ctx, game, p, s) {
        const W = game.worldW, H = game.worldH;
        // 稲妻：光った直後ほど明るい（1 → 0）
        const flash = Math.max(0, 1 - (game.simTime - s.flashAt) / (p.flashTime * 1000));
        const dark = p.darkness * (1 - flash);
        if (dark > 0.01) drawDarkness(ctx, game, p, dark);
        for (const g of s.ghosts) drawGhost(ctx, g, H);
        if (flash > 0) {
          ctx.fillStyle = `rgba(235, 230, 255, ${flash * 0.45})`;
          ctx.fillRect(0, 0, W, H);
          if (flash > 0.6) drawBolt(ctx, s.boltX, H, flash);
        }
      },
    },
  };

  // ---------- おばけ屋敷で使う部品 ----------
  // [最小, 最大] のあいだのランダムな数（ルールの乱数を使う）
  function between(game, range) {
    const [a, b] = Array.isArray(range) ? range : [range, range];
    return a + game.random() * (b - a);
  }

  // おばけを動かす（60分の1秒ぶん）。画面の外に出たら消す
  function stepGhosts(ghosts, p, W) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.x += (g.dir * p.ghostSpeed) / 60;
      g.age += 1 / 60;
      if (g.x < -80 || g.x > W + 80) ghosts.splice(i, 1);
    }
  }

  // おばけの今の位置（画面の座標。ふわふわ上下に揺れる）
  function ghostPos(g, H) {
    return { x: g.x, y: g.y * H + Math.sin(g.age * 3) * 12 };
  }

  // おばけの近くにいる、落ちているキャラを横に押す
  function pushByGhosts(ghosts, falling, p, game) {
    for (const g of ghosts) {
      const gp = ghostPos(g, game.worldH);
      for (const b of falling) {
        const dx = b.position.x - gp.x;
        const dy = b.position.y - game.camY - gp.y; // キャラの位置を、画面の座標に直してくらべる
        if (dx * dx + dy * dy < p.ghostRadius * p.ghostRadius) {
          game.Body.setVelocity(b, { x: b.velocity.x + g.dir * p.ghostPush, y: b.velocity.y });
        }
      }
    }
  }

  // 暗闇：画面の4分の1の大きさの「暗い面」を用意し、光の丸をくり抜いて、引きのばして重ねる。
  // 毎フレームの作業は、塗りつぶし1回と、くり抜く丸の画像を数枚貼るだけ（ぼかしの計算はしない）
  const MASK_SCALE = 0.5; // 暗い面の細かさ（ゲーム内の単位 → ピクセル）
  let mask = null;
  let hole = null; // 光の丸（真ん中ほどくっきりくり抜く、ぼかした丸の画像。最初に1回だけ作る）
  function drawDarkness(ctx, game, p, dark) {
    const w = Math.ceil(game.worldW * MASK_SCALE), h = Math.ceil(game.worldH * MASK_SCALE);
    if (!mask || mask.width !== w || mask.height !== h) {
      mask = document.createElement("canvas");
      mask.width = w;
      mask.height = h;
    }
    if (!hole) {
      hole = document.createElement("canvas");
      hole.width = hole.height = 128;
      const hg = hole.getContext("2d");
      const grad = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.85)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      hg.fillStyle = grad;
      hg.fillRect(0, 0, 128, 128);
    }
    const m = mask.getContext("2d");
    m.globalCompositeOperation = "source-over";
    m.clearRect(0, 0, w, h);
    m.fillStyle = `rgba(10, 4, 24, ${dark})`;
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = "destination-out";
    const r = p.lightRadius;
    for (const l of game.lights()) {
      m.drawImage(hole, (l.x - r) * MASK_SCALE, (l.y - r) * MASK_SCALE, r * 2 * MASK_SCALE, r * 2 * MASK_SCALE);
    }
    ctx.drawImage(mask, 0, 0, game.worldW, game.worldH);
  }

  // おばけ（白くて丸い頭、すそがひらひら、黒い目）
  function drawGhost(ctx, g, H) {
    const { x, y } = ghostPos(g, H);
    const s = 26;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(g.dir, 1); // 進む向きを向く
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#f4f2ff";
    ctx.beginPath();
    ctx.arc(0, -s * 0.2, s, Math.PI, 0);
    ctx.lineTo(s, s);
    for (let i = 0; i < 4; i++) {
      const x1 = s - (i + 0.5) * (s / 2);
      const wave = Math.sin(g.age * 8 + i) * 4;
      ctx.quadraticCurveTo(x1, s + 10 + wave, s - (i + 1) * (s / 2), s);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1a1030";
    ctx.beginPath();
    ctx.ellipse(s * 0.15, -s * 0.25, 4, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.55, -s * 0.25, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 稲妻の線（光った直後だけ）
  function drawBolt(ctx, x, H, flash) {
    ctx.save();
    ctx.globalAlpha = flash;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let px = x, py = 0;
    ctx.moveTo(px, py);
    for (let i = 0; i < 7; i++) {
      px += (i % 2 ? 1 : -1) * (10 + (i * 7) % 13);
      py += H * 0.06;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 遊べるルールの一覧（config.js にあって、動きも書いてあるもの）
  // 特殊ルールの一覧（期間限定のルールは、イベントの期間中だけ入る。events.js）
  function list() {
    const conf = window.GAME_CONFIG.rules || {};
    return Object.keys(conf)
      .filter((id) => BEHAVIORS[id] && !conf[id].stage && LimitedEvents.available(conf[id])) // stage はイベントのステージ用なので一覧に出さない
      .map((id) => get(id));
  }

  // ルールを1つ取り出す。{ id, params（config の数値）, フック… }。無ければ null
  function get(id) {
    const params = (window.GAME_CONFIG.rules || {})[id];
    if (!id || !params || !BEHAVIORS[id]) return null;
    return Object.assign({ id, params, state: {} }, BEHAVIORS[id]);
  }

  return { list, get };
})();
