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
//        draw(ctx, game, p, state) … 画面に何か描く（画面の座標で描く）
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
          s.dir = Math.random() < 0.5 ? -1 : 1;
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
  };

  // 遊べるルールの一覧（config.js にあって、動きも書いてあるもの）
  function list() {
    const conf = window.GAME_CONFIG.rules || {};
    return Object.keys(conf)
      .filter((id) => BEHAVIORS[id])
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
