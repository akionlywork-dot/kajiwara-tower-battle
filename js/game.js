// =============================================
// game.js
// ゲーム本体：物理演算・描画・タッチ操作
// =============================================

const Game = (() => {
  const { Engine, Composite, Bodies, Body, Events, Query } = Matter;

  // ゲーム内の座標の広さ。横幅は 450 で固定、縦は画面の縦横比に合わせて決める
  const WORLD_W = 450;
  // 持っているキャラを表示する高さ（画面の上から）
  const HOLD_Y = 170;
  // 物理演算の1ステップの時間（ミリ秒）。60分の1秒ずつ進める
  const STEP_MS = 1000 / 60;
  // 1ステップをさらに何回に分けて計算するか。細かく分けるほど、めり込み→弾かれる が減って安定する
  const SUBSTEPS = 3;
  // 落としたキャラの落下速度の上限。速すぎると着地の衝撃で塔が吹っ飛ぶ
  const MAX_FALL_SPEED = 5;
  // キャラの物理的な性質
  const BODY_OPTIONS = {
    density: 0.004, // 重さ（密度）
    friction: 1.2, // 滑りにくさ
    frictionStatic: 1.8, // 止まっているときの滑りにくさ
    frictionAir: 0.02, // 空気抵抗（揺れや跳ねを少しずつ弱める）
    restitution: 0, // 跳ね返り（0 = 跳ねない）
  };
  // 落としてから、この時間が過ぎたら止まっていなくても次へ進む（ミリ秒）
  const SETTLE_TIMEOUT = 7000;
  // 落ちてから、ゲームオーバー画面を出すまでの時間（ミリ秒）。落ちていく様子を見せる
  const GAMEOVER_DELAY = 1500;
  // 1メートル＝ゲーム内の 100 （キャラの身長がだいたい 130 なので）
  const UNITS_PER_METER = 100;
  // 土台の大きさと位置（土台の上面が、画面の下からどれだけ上にあるか）
  const PLATFORM_W = 280;
  const PLATFORM_H = 40;
  const PLATFORM_FROM_BOTTOM = 230;
  // タイトル画面のデモでは、スタートボタンに隠れないよう土台を少し高くする
  const DEMO_PLATFORM_FROM_BOTTOM = 360;
  // 地面の位置（土台の上面から、どれだけ下にあるか）
  const GROUND_BELOW_PLATFORM = 160;
  // 端末の「視差効果を減らす」設定。ON のときは雲やデモの動きを止める
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let canvas, ctx;
  let engine;
  let worldH = 800;
  let viewScale = 1; // ゲーム座標 → 画面のピクセル の倍率
  let camY = 0; // カメラの位置（画面の一番上が、ゲーム内のどの y か）
  let camTargetY = 0; // カメラが向かう先
  let platform; // 土台
  let platformTop; // 土台の上面の y 座標

  let shapes = []; // 読み込んだキャラの形データ
  let held = null; // いま指で動かしているキャラ { shape, x, angle }
  let state = "idle"; // "aim"=位置決め中 / "falling"=落下中 / "over"=ゲームオーバー
  let dropped = null; // 最後に落としたボディ
  let stillFrames = 0; // 全員が止まっているフレーム数
  let lastShape = null; // 前回のキャラ（同じキャラが続かないように）
  let debug = false;
  let callbacks = {}; // main.js に知らせるための関数たち
  let paused = false; // ポーズ中か

  // ゲーム内の時計（ミリ秒）。ポーズ中は進まないので、時間に関わる処理はすべてこれで測る
  let simTime = 0;
  let droppedAt = 0; // 落とした時刻
  let fellAt = 0; // 土台から落ちた時刻
  let aimStartAt = 0; // 今の手番が始まった時刻
  let turnLimit = 0; // 1手の制限時間（ミリ秒）。0 なら制限なし
  // オンライン対戦のゲスト：ホストから届いた制限時間 { left: 残り（ミリ秒）, limit: 全部（ミリ秒）, at: 届いた時刻 }。無ければ null
  let remoteTime = null;

  let lastTime = 0;
  let frameDt = 0; // 前のフレームからの秒数（オーラの粒を出す量に使う。ポーズ中は 0）
  let acc = 0;

  // タイトル画面のデモの状態（デモ中でなければ null）
  let demo = null;
  // 今の特殊ルール（rules.js の Rules.get で作ったもの）。ふつうのルールなら null
  let rule = null;

  // 空に浮かぶ雲 { x, y, scale, speed, alpha, depth }。x, y は画面の割合（0〜1）
  // 奥（far）と手前（near）の2層。奥の雲は小さく、薄く、ゆっくり流れる（config.js の titleFx.clouds）
  const FX = window.GAME_CONFIG.titleFx || {};
  const clouds = [];
  for (const [layer, def] of [["far", { count: 4, speed: 0.004, scale: 0.6, alpha: 0.6 }], ["near", { count: 3, speed: 0.012, scale: 1.1, alpha: 1 }]]) {
    const c = Object.assign(def, (FX.clouds || {})[layer]);
    for (let i = 0; i < c.count; i++) {
      clouds.push({
        x: Math.random(),
        y: 0.05 + Math.random() * 0.6,
        scale: c.scale * (0.8 + Math.random() * 0.4),
        speed: c.speed * (0.8 + Math.random() * 0.4), // 1秒に画面の何割進むか
        alpha: c.alpha,
        depth: layer === "far" ? 0.08 : 0.2, // カメラが動いたときに、どれだけ一緒に動くか（奥ほど小さい）
      });
    }
  }
  clouds.sort((a, b) => a.depth - b.depth); // 奥の雲から先に描く

  // ---------- 初期化 ----------
  function init(canvasEl, loadedShapes) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    shapes = loadedShapes;
    window.addEventListener("resize", resize);
    resize();
    setupInput();
    requestAnimationFrame(loop);
  }

  // 画面サイズに合わせてキャンバスの大きさと倍率を決める
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    viewScale = cw / WORLD_W;
    worldH = ch / viewScale;
    // ゲームやデモをしていないときは、土台の位置を画面に合わせなおす（背景の絵のため）
    if (!engine) platformTop = worldH - DEMO_PLATFORM_FROM_BOTTOM;
  }

  // 物理の世界と土台を新しく作る（ゲームとデモで共通）
  // fromBottom: 土台の上面を、画面の下からどれだけ上に置くか
  function createWorld(fromBottom) {
    engine = Engine.create();
    engine.gravity.y = 1;
    // 計算の回数を増やして、積み重ねたときのめり込みやガタつきを減らす
    engine.positionIterations = 12;
    engine.velocityIterations = 10;

    // 土台：画面の下の方にある、柱に支えられた台
    platformTop = worldH - fromBottom;
    platform = Bodies.rectangle(WORLD_W / 2, platformTop + PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, {
      isStatic: true,
      friction: BODY_OPTIONS.friction, // キャラと同じにする（ぶつかった2つのうち小さい方が使われるため）
      label: "platform",
    });
    Composite.add(engine.world, platform);

    // 衝突を監視して、何かにぶつかったキャラに「着地した」印をつける
    Events.on(engine, "collisionStart", (e) => {
      for (const pair of e.pairs) {
        for (const b of [pair.bodyA.parent, pair.bodyB.parent]) {
          if (b.isStatic || b.landed) continue;
          b.landed = true;
          // 最後に落としたキャラが着地したら「置いた音」を鳴らす
          if (b === dropped && callbacks.onLand) callbacks.onLand();
        }
      }
    });

    camY = camTargetY = 0;
    Aura.clear(); // 前のゲームのオーラの粒を消す
    peakHeight = skyHeight = 0;
    skyStage = 0;
    simTime = 0;
    paused = false;
    dropped = null;
    held = null;
  }

  // ---------- ゲーム開始 ----------
  // cb: 出来事を main.js に知らせる関数たち
  //   { onDrop, onLand, onSettled(stats), onFall, onGameOver(stats), dropOnRelease() }
  // opts: { turnTimeLimit: 1手の制限時間（秒）。0 なら制限なし,
  //         seed: キャラの出る順番を決める番号（挑戦状で使う）。省略するとランダム }
  function start(cb, opts) {
    callbacks = cb || {};
    // 乱数は「キャラを選ぶ用」と「特殊ルール用（風の向きなど）」で分ける。
    // 1つにすると、風が吹いた回数でキャラの順番がずれてしまうため
    const seed = (opts && opts.seed) || Math.floor(Math.random() * 4294967295) + 1;
    pieceRandom = seededRandom(seed);
    ruleRandom = seededRandom(seed ^ 0x5bd1e995);
    demo = null;
    remote = false;
    remoteBodies = new Map();
    createWorld(PLATFORM_FROM_BOTTOM);
    setTurnTimeLimit(opts && opts.turnTimeLimit);

    // 特殊ルール（rules.js）。無ければ null
    rule = (opts && opts.rule) || null;
    // fair：オンライン対戦（相手にも同じキャラが出る）。管理者モードの「次に出すキャラ」や、
    //   テスト日付・イベントの確認表示を使わず、実際の日付で抽選する（相手に影響しないように）
    fair = !!(opts && opts.fair);
    if (rule) {
      rule.state = {};
      if (rule.platformOptions) Body.set(platform, rule.platformOptions(rule.params));
      if (rule.start) rule.start(ruleAPI, rule.params, rule.state);
    }

    lastShape = null;
    resetCounters();
    nextPiece();
  }

  // ---------- 特殊ルールに渡す窓口 ----------
  // ルール（rules.js）からは、ここにあるものだけを使う
  const ruleAPI = {
    get simTime() { return simTime; },
    get worldW() { return WORLD_W; },
    get worldH() { return worldH; },
    random: () => ruleRandom(), // 0 以上 1 未満の乱数（Math.random の代わりに使う）
    get camY() { return camY; }, // カメラの位置（キャラの y から引くと、画面の座標になる）
    Body,
    bodies: () => bodies(),
    // 明るくする場所（画面の座標）：持っているキャラと、落ちているキャラ（おばけ屋敷の暗闇で使う）
    lights: () => {
      const out = [];
      if (held && (state === "aim" || state === "remote")) out.push({ x: held.x, y: holdY() });
      for (const b of bodies()) if (!b.landed) out.push({ x: b.position.x, y: b.position.y - camY });
      return out;
    },
    setPlatformAngle: (angle) => Body.setAngle(platform, angle),
  };

  // キャラの物理的な性質（特殊ルールで変わることがある）
  function pieceOptions() {
    return rule && rule.bodyOptions ? rule.bodyOptions(BODY_OPTIONS, rule.params) : BODY_OPTIONS;
  }

  // キャラの形（特殊ルールで大きさが変わることがある）
  function ruleShape(shape) {
    const scale = rule && rule.shapeScale ? rule.shapeScale(rule.params) : 1;
    return scale === 1 ? shape : Shape.scaled(shape, scale);
  }

  // ゲームをやめる（タイトルに戻るとき）
  function stop() {
    engine = null;
    held = null;
    demo = null;
    rule = null;
    remote = false;
    remoteBodies = new Map();
    state = "idle";
    paused = false;
    peakHeight = skyHeight = 0;
    skyStage = 0;
    platformTop = worldH - DEMO_PLATFORM_FROM_BOTTOM;
  }

  // ---------- タイトル画面のデモ ----------
  // config.js の sequence のキャラを、いい感じに組み合わさるように積んでいく（落ちない・崩さない）。
  // ・1体ごとに、向き（4通り）と位置（7か所）を見えないところで試し、
  //   落ちずに、低く・まっすぐ・真ん中に収まる置き方を選ぶ（tryDemoPlacement）
  // ・選んだ置き方を試したときの動きを記録しておき、見せるときはそのとおりに動かす
  //   （物理の計算をやりなおさないので、試した結果とずれない ＝ 落ちることがない）
  // ・前のキャラが落ちきる前に、次のキャラを上から落とし始める（前のキャラが止まる場所は、もう分かっているので）
  // ・積み終わったら少し見せてから、ふわっと消して、順番を入れかえて最初から
  // opts: config.js の titleDemo { interval, holdTime, fadeTime, sequence: [{ file }, ...] }

  // キャラを落とし始める高さ（塔のてっぺんから、これだけ上）。スマホの縦画面なら、画面の上の外になる
  const DEMO_DROP_HEIGHT = 800;
  // 塔のてっぺんの上限：画面の上からこの割合の位置か、ハイスコアの表示の下（setDemoCeiling）の、低い方。
  // 最後のキャラだけは DEMO_OVERSHOOT まで、はみ出してよい（小さい画面で、タイトルロゴに塔が重ならないように）
  const DEMO_TOP_LIMIT = 0.38;
  const DEMO_OVERSHOOT = 50;
  // 置き方を試すとき：てっぺんの少し上から、落ちる速さの上限で落とす（本物も、着くころにはこの速さになっている）
  const DEMO_TRY_GAP = 40;
  const DEMO_TRY_STEPS = 240; // 1つの置き方を試す長さの上限（ステップ。60ステップ＝1秒）
  const DEMO_STILL_STEPS = 15; // これだけ続けて止まっていたら「止まった」
  const DEMO_ANGLES = [0, Math.PI / 2, -Math.PI / 2, Math.PI]; // 試す向き
  const DEMO_XS = [-80, -55, -30, 0, 30, 55, 80]; // 試す位置（土台の真ん中からのずれ。左右に並べて置けるように、端の近くまで）
  const DEMO_TRIES_PER_STEP = 1; // 1ステップで試す数（重くならないように、何ステップかに分けて試す）

  function startDemo(opts) {
    if (!shapes.length) return;
    callbacks = {};
    rule = null;
    createWorld(DEMO_PLATFORM_FROM_BOTTOM);
    state = "demo";
    demo = {
      opts: opts || {},
      sequence: [], // この回に積むキャラの形の並び
      phase: "stack", // "stack"=積んでいる / "hold"=積み終わって見せている / "fade"=消えていく
      phaseAt: 0, // 今の段階になった時刻
      count: 0, // 何体落としたか
      plan: null, // 次のキャラの置き方を試している途中 { shape, tries: [{ x, angle }], i, best }
      flying: [], // 落ちている途中のキャラ { body, path: [{ x, y, a }], i }
      nextAt: 600, // 次のキャラを落とし始めてよい時刻
      alpha: 1, // キャラの濃さ（消えていくとき）
      frozen: false, // 止まった絵にしているか（視差効果を減らす設定のとき）
    };
    newDemoRound(true);
    if (reducedMotion.matches) {
      // 動きを控えめにする設定なら、全部積んだ形を一気に作っておいて、あとは動かさない
      while (demo.count < demo.sequence.length) {
        const plan = newDemoPlan(demo.sequence[demo.count]);
        while (plan.i < plan.tries.length) planDemoStep(plan, plan.tries.length);
        if (!plan.best) break;
        launchDemoPiece(plan.best);
        const f = demo.flying.pop();
        setDemoPose(f.body, f.path[f.path.length - 1]);
        demo.count++;
      }
      demo.frozen = true;
    }
  }

  // 新しい回を始める：キャラの順番を決める（1回目は config の順番、2回目からは入れかえる）
  function newDemoRound(first) {
    const seq = buildDemoSequence(demo.opts.sequence);
    if (!first) {
      for (let i = seq.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
    }
    Object.assign(demo, { sequence: seq, count: 0, phase: "stack", alpha: 1, plan: null, flying: [] });
  }

  // config.js の sequence（ファイル名か id で指定）を、形データの並びに変換する
  // 見つからないキャラは飛ばす。sequence が空なら、ランダムに8体選ぶ
  function buildDemoSequence(list) {
    const seq = [];
    for (const item of list || []) {
      // ファイル名で書いたときは、その画像の元のキャラ（★4のオーラ版ではなく）
      const shape = item.id ? shapeById(item.id) : shapes.find((s) => s.file === item.file && !s.shared);
      if (shape) seq.push(shape);
      else console.warn("デモのキャラが見つかりません:", item.id || item.file);
    }
    if (!seq.length) {
      for (let i = 0; i < 8; i++) seq.push(randomShape());
    }
    return seq;
  }

  // 塔のてっぺんの上限（ゲーム内の y）
  function demoCeiling() {
    // 画面の上から DEMO_TOP_LIMIT の位置か、タイトルの文字の下端（setDemoCeiling）の、低い方まで
    return Math.max(worldH * DEMO_TOP_LIMIT, demoCeilingPx / viewScale + 10);
  }

  // デモの塔がこれより上に伸びないようにする（画面の上からの px）。
  // タイトル画面のハイスコア表示などに塔が重ならないよう、main.js から教えてもらう
  let demoCeilingPx = 0;
  function setDemoCeiling(px) {
    demoCeilingPx = px;
  }

  // 次のキャラの置き方を試す準備（向き × 位置の組み合わせ）
  function newDemoPlan(shape) {
    const tries = [];
    for (const angle of DEMO_ANGLES) for (const x of DEMO_XS) tries.push({ x: WORLD_W / 2 + x, angle });
    return { shape, tries, i: 0, best: null };
  }

  // 置き方を n 個試して、いちばん良いものを覚えておく
  function planDemoStep(plan, n) {
    for (let k = 0; k < n && plan.i < plan.tries.length; k++, plan.i++) {
      const t = plan.tries[plan.i];
      const r = tryDemoPlacement(plan.shape, t.x, t.angle);
      if (r && (!plan.best || r.cost < plan.best.cost)) plan.best = r;
    }
  }

  // 1つの置き方を、本物の世界で（見えないところで）試す。
  // 落ちている途中のキャラは、止まる場所に置いた状態にしてから試し、終わったら元に戻す。
  // 返り値：{ shape, path（動きの記録）, cost（小さいほど良い）}。落ちる・止まらない・高くなりすぎる置き方なら null
  function tryDemoPlacement(shape, x, angle) {
    const saved = demo.flying.map((f) => ({ x: f.body.position.x, y: f.body.position.y, a: f.body.angle }));
    for (const f of demo.flying) setDemoPose(f.body, f.path[f.path.length - 1]);
    const top = demoTowerTop();
    const body = Shape.spawnBody(shape, x, 0, angle, BODY_OPTIONS);
    Body.translate(body, { x: 0, y: top - DEMO_TRY_GAP - body.bounds.max.y }); // てっぺんの少し上から
    Body.setVelocity(body, { x: 0, y: MAX_FALL_SPEED });
    Composite.add(engine.world, body);
    const path = [];
    let still = 0;
    for (let i = 0; i < DEMO_TRY_STEPS && still < DEMO_STILL_STEPS; i++) {
      // 本物と同じ細かさで計算する（落下速度の上限・小さな揺れを弱める処理も同じ。動くのはこのキャラだけ）
      for (let k = 0; k < SUBSTEPS; k++) {
        limitFallSpeed();
        Engine.update(engine, STEP_MS / SUBSTEPS);
        dampSlowBodies();
      }
      path.push({ x: body.position.x, y: body.position.y, a: body.angle });
      still = body.landed && body.speed < 0.05 && body.angularSpeed < 0.002 ? still + 1 : 0;
      if (body.bounds.min.y > platformTop) break; // 土台より下へ落ちた
    }
    const b = { top: body.bounds.min.y, bottom: body.bounds.max.y, left: body.bounds.min.x, right: body.bounds.max.x, x: body.position.x, angle: body.angle };
    Composite.remove(engine.world, body);
    demo.flying.forEach((f, i) => setDemoPose(f.body, saved[i]));
    // 落ちた・止まらなかった・画面からはみ出した・高くなりすぎた置き方は使わない。
    // 足元が土台の上面より下に出る（土台の横に引っかかっている）置き方も、落ちそうに見えるので使わない
    if (still < DEMO_STILL_STEPS || b.bottom > platformTop + 4 || b.left < 0 || b.right > WORLD_W) return null;
    const newTop = Math.min(top, b.top);
    if (newTop < demoCeiling() - DEMO_OVERSHOOT) return null;
    // 低く積めるほど良い（すき間にはまる・寝かせる）。真ん中に近いほど、まっすぐ（90度ごとの向き）に近いほど良い。
    // 少しだけランダムを混ぜて、回ごとに違う組み合わせになるようにする
    const q = Math.PI / 2;
    const m = ((b.angle % q) + q) % q;
    const tilt = Math.min(m, q - m);
    const cost = (platformTop - newTop) + Math.abs(b.x - WORLD_W / 2) * 0.3 + tilt * 150 + Math.random() * 12;
    return { shape, path, cost };
  }

  // 選んだ置き方でキャラを落とし始める（試したときの動きの前に、上からまっすぐ落ちてくる部分を足す）
  function launchDemoPiece(best) {
    const first = best.path[0];
    const speed = Math.max(4, best.path.length > 1 ? best.path[1].y - first.y : 0); // 1ステップに落ちる量
    const pre = [];
    for (let y = first.y - DEMO_DROP_HEIGHT; y < first.y; y += speed) pre.push({ x: first.x, y, a: first.a });
    const path = pre.concat(best.path);
    const body = Shape.spawnBody(best.shape, path[0].x, path[0].y, path[0].a, BODY_OPTIONS);
    Body.setStatic(body, true); // 動きは記録どおりに動かす（物理の計算では動かさない）
    // 止まったときの、てっぺんの高さ（次のキャラを落としてよいかの判断に使う）
    setDemoPose(body, path[path.length - 1]);
    const finalTop = body.bounds.min.y;
    setDemoPose(body, path[0]);
    Composite.add(engine.world, body);
    demo.flying.push({ body, path, i: 0, finalTop });
  }

  function setDemoPose(body, p) {
    Body.setPosition(body, { x: p.x, y: p.y });
    Body.setAngle(body, p.a);
  }

  // 落ちている途中のキャラも、止まる場所にあるとしたときの、塔のてっぺんの y 座標
  function demoPlannedTop() {
    let top = platformTop;
    for (const b of pieces()) {
      const f = demo.flying.find((x) => x.body === b);
      top = Math.min(top, f ? f.finalTop : b.bounds.min.y);
    }
    return top;
  }

  // 固定ずみのキャラも含めた、塔のてっぺんの y 座標
  function demoTowerTop() {
    let top = platformTop;
    for (const b of pieces()) top = Math.min(top, b.bounds.min.y);
    return top;
  }

  // デモの進行（物理演算の1ステップごとに呼ばれる）
  function stepDemo() {
    if (!demo || demo.frozen) return;
    const o = demo.opts;
    // 落ちている途中のキャラを、記録どおりに1ステップ進める（最後まで来たら、そこで止まる）
    for (const f of demo.flying) setDemoPose(f.body, f.path[Math.min(++f.i, f.path.length - 1)]);
    demo.flying = demo.flying.filter((f) => f.i < f.path.length - 1);

    if (demo.phase === "stack") {
      if (!demo.plan) {
        // 全部落とした・塔が上限まで来た（止まる場所で数える）なら、積むのはおしまい
        if (demo.count >= demo.sequence.length || demoPlannedTop() <= demoCeiling() - DEMO_OVERSHOOT) return endDemoStack();
        demo.plan = newDemoPlan(demo.sequence[demo.count]);
      }
      planDemoStep(demo.plan, DEMO_TRIES_PER_STEP);
      if (demo.plan.i < demo.plan.tries.length || simTime < demo.nextAt) return;
      const best = demo.plan.best;
      demo.plan = null;
      if (!best) return endDemoStack(); // どこにも置けない（塔がいっぱい）
      launchDemoPiece(best);
      demo.count++;
      demo.nextAt = simTime + (o.interval == null ? 0.9 : o.interval) * 1000;
    } else if (demo.phase === "hold") {
      // 最後のキャラが止まってから数える
      if (demo.flying.length) demo.phaseAt = simTime;
      else if (simTime - demo.phaseAt > (o.holdTime == null ? 3 : o.holdTime) * 1000) {
        demo.phase = "fade";
        demo.phaseAt = simTime;
      }
    } else {
      // ふわっと消して、最初から
      const t = (simTime - demo.phaseAt) / ((o.fadeTime == null ? 0.8 : o.fadeTime) * 1000);
      demo.alpha = Math.max(0, 1 - t);
      if (t >= 1) {
        for (const b of pieces()) Composite.remove(engine.world, b);
        newDemoRound(false);
        demo.nextAt = simTime + 400;
      }
    }
  }

  // 積み終わった：少し見せてから消す
  function endDemoStack() {
    demo.plan = null;
    demo.phase = "hold";
    demo.phaseAt = simTime;
  }

  // ---------- 自由配置モード（管理者モード。sandbox.js が使う） ----------
  // 次に置くキャラ・角度・反転を決めて、画面をタップした場所（空中でもよい）にキャラを置く。
  // 置いたキャラは、ドラッグで動かす・回す・反転する・消すことができる。物理の計算は止めたり、1コマずつ進めたりできる。
  // ゲームの記録（ハイスコア・戦績・実績・図鑑）の処理（main.js の onSettled など）は通らないので、何も記録されない
  const sandbox = {
    paused: false,
    next: { id: null, angle: 0, flip: false }, // 次に置くキャラ
    selected: null, // 選んでいるキャラ（物理のボディ）
    drag: null, // ドラッグ中 { body, dx, dy }
  };

  function startSandbox() {
    callbacks = {};
    demo = null;
    rule = null;
    remote = false;
    remoteBodies = new Map();
    held = null;
    photo = null;
    paused = false;
    fair = false;
    createWorld(PLATFORM_FROM_BOTTOM);
    setTurnTimeLimit(0);
    state = "sandbox";
    Object.assign(sandbox, { paused: false, selected: null, drag: null });
    if (!sandbox.next.id && shapes.length) sandbox.next.id = shapes[0].id;
  }

  function sandboxDown(p) {
    const hit = Query.point(pieces(), p);
    const body = hit.length ? hit[hit.length - 1] : null;
    if (body) {
      // 置いたキャラをつかむ（つかんでいるあいだは、物理で動かないように固定する）
      sandbox.selected = body;
      sandbox.drag = { body, dx: body.position.x - p.x, dy: body.position.y - p.y };
      Body.setStatic(body, true);
      return;
    }
    // 何もない場所：次のキャラを、そこに置く
    const base = shapeById(sandbox.next.id);
    if (!base) return;
    const shape = sandbox.next.flip ? Shape.flipped(base) : base;
    const b = Shape.spawnBody(shape, p.x, p.y, sandbox.next.angle, BODY_OPTIONS);
    Composite.add(engine.world, b);
    sandbox.selected = b;
  }

  function sandboxMove(p) {
    const d = sandbox.drag;
    if (d) Body.setPosition(d.body, { x: p.x + d.dx, y: p.y + d.dy });
  }

  function sandboxUp() {
    const d = sandbox.drag;
    if (!d) return;
    sandbox.drag = null;
    Body.setStatic(d.body, false);
    Body.setVelocity(d.body, { x: 0, y: 0 });
    Body.setAngularVelocity(d.body, 0);
  }

  // 選んでいるキャラ（無ければ null。土台の下に落ちて消えたものも null）
  function sandboxSelected() {
    const b = sandbox.selected;
    return b && pieces().includes(b) ? b : null;
  }

  const sandboxAPI = {
    // 次に置くキャラ（id・角度・反転）
    setNext(next) {
      Object.assign(sandbox.next, next);
    },
    get next() {
      return Object.assign({}, sandbox.next);
    },
    // 回す（選んでいるキャラがあればそれを、無ければ次に置くキャラの角度を、45度）
    rotate() {
      const b = sandboxSelected();
      if (b) Body.setAngle(b, b.angle + Math.PI / 4);
      else sandbox.next.angle = (sandbox.next.angle + Math.PI / 4) % (Math.PI * 2);
    },
    // 反転する（選んでいるキャラは、反転した形に入れかえる。無ければ次に置くキャラを反転）
    flip() {
      const b = sandboxSelected();
      if (!b) {
        sandbox.next.flip = !sandbox.next.flip;
        return;
      }
      const nb = Shape.spawnBody(Shape.flipped(b.shape), b.position.x, b.position.y, b.angle, BODY_OPTIONS);
      Composite.remove(engine.world, b);
      Composite.add(engine.world, nb);
      sandbox.selected = nb;
    },
    // 選んでいるキャラを消す
    remove() {
      const b = sandboxSelected();
      if (b) Composite.remove(engine.world, b);
      sandbox.selected = null;
    },
    // 土台以外を全部消す
    clear() {
      for (const b of pieces()) Composite.remove(engine.world, b);
      sandbox.selected = null;
    },
    setPaused(on) {
      sandbox.paused = !!on;
    },
    get paused() {
      return sandbox.paused;
    },
    // 止めているあいだに、1コマ（60分の1秒）だけ進める
    step() {
      if (state !== "sandbox") return;
      physicsStep();
      checkFallen();
    },
    get selectedName() {
      const b = sandboxSelected();
      return b ? b.shape.name : null;
    },
  };

  // 選んでいるキャラの輪郭（黄色の点線）
  function drawSandboxSelection() {
    const b = sandboxSelected();
    if (!b) return;
    ctx.save();
    ctx.strokeStyle = "#ffd84d";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (const part of b.parts.length > 1 ? b.parts.slice(1) : b.parts) {
      ctx.beginPath();
      part.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- ポーズ ----------
  // ポーズ中は物理演算・時計・操作がすべて止まる（描画だけは続ける）
  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
  }

  // 制限時間（秒）を変える。0 なら制限なし。ゲームの途中で変えたときは、今の手番の最初から数えなおす
  function setTurnTimeLimit(sec) {
    turnLimit = (sec || 0) * 1000;
    aimStartAt = simTime;
  }

  // 次のキャラをランダムに選んで、画面上部に持たせる
  // 管理者モード：次に出すキャラを決めておく（キャラの ID。null ならふつうにランダム）
  let forcedId = null;
  let fair = false; // オンライン対戦のゲームか（start の opts.fair）
  function setForcedShape(id) {
    forcedId = id;
  }

  function nextPiece() {
    const forced = !fair && forcedId && shapeById(forcedId);
    held = { shape: ruleShape(forced || randomShape()), x: WORLD_W / 2, angle: 0 };
    drawn.push(held.shape.id); // 出た順（実績「デジャヴ」）。長くなりすぎないよう、最後の数体だけ残す
    if (drawn.length > 8) drawn.shift();
    flipRun = 0;
    clampHeld();
    state = "aim";
    aimStartAt = simTime;
    // レアキャラが出たら知らせる（main.js が「レア！」を表示する）
    if (rareInfo(held.shape) && callbacks.onRare) callbacks.onRare(held.shape, rareInfo(held.shape));
  }

  // 乱数（start で、シード値から作りなおす）
  let pieceRandom = Math.random; // キャラを選ぶ用
  let ruleRandom = Math.random; // 特殊ルール用

  // シード値から乱数を作る（同じシード値なら、毎回同じ順番の数が出る。mulberry32 という方法）
  function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // キャラの出やすさ（weight）。0 なら出ない
  const chance = (s) => (typeof s.weight === "number" ? Math.max(0, s.weight) : 1);

  // キャラを選ぶ。出やすさ（weight）に合わせて、くじ引きのように選ぶ（同じキャラが2回続かないように）
  function randomShape() {
    // 期間限定のキャラは、イベントの期間中だけ出る（events.js）
    const open = shapes.filter((s) => LimitedEvents.available(s, fair));
    const pool = open.length > 1 ? open.filter((s) => s !== lastShape) : open.length ? open : shapes;
    // 出やすさが 0 のキャラ（まぼろしなど、まだ登場しないキャラ）は選ばれない
    const total = pool.reduce((sum, s) => sum + chance(s), 0);
    let r = pieceRandom() * total; // 0〜合計 のどこかに当たりを置き、
    let shape = pool.filter((s) => chance(s) > 0).pop() || pool[pool.length - 1]; // 計算の端数で外れたときは、最後の出るキャラ
    for (const s of pool) {
      if (chance(s) <= 0) continue;
      r -= chance(s); // 出やすいキャラほど「幅」が広いので当たりやすい
      if (r < 0) {
        shape = s;
        break;
      }
    }
    lastShape = shape;
    return shape;
  }

  // 開発者用：n 回抽選して、キャラごとの出た回数を返す（Map：キャラの ID → 回数）。
  // 本物と同じ選び方（同じキャラが続かない決まりも同じ）。今のゲームの順番には影響しない
  function drawTest(n) {
    const saved = { last: lastShape, rand: pieceRandom };
    pieceRandom = Math.random;
    lastShape = null;
    const counts = new Map();
    for (let i = 0; i < n; i++) {
      const s = randomShape();
      counts.set(s.id, (counts.get(s.id) || 0) + 1);
    }
    lastShape = saved.last;
    pieceRandom = saved.rand;
    return counts;
  }

  // レア度の情報（config.js の rarity）。ノーマルや不明なら null
  function rareInfo(shape) {
    const id = shape && shape.rarity;
    if (!id || id === "N") return null;
    return (window.GAME_CONFIG.rarity || {})[id] || null;
  }

  // 制限時間の残り（ミリ秒）。制限なしのときは null
  function timeLeft() {
    // ゲスト：ホストから届いた残り時間から、届いてからたった時間を引く
    if (remote) return remoteTime && held ? Math.max(0, remoteTime.left - (performance.now() - remoteTime.at)) : null;
    if (!turnLimit || state !== "aim") return null;
    return Math.max(0, turnLimit - (simTime - aimStartAt));
  }

  // ---------- 操作 ----------
  // このゲームで回転を使った回数（実績「回さず勝負」の判定に使う）
  let rotations = 0;
  // 実績のための数（このゲームの分。どれも数えるだけなので軽い）
  let flips = 0; // 反転を使った回数
  let flipRun = 0; // 今のキャラで、続けて反転を押した回数（ほかの操作をするか、次のキャラで 0 に戻す）
  let flipStreak = 0; // flipRun の一番多かった数
  let drawn = []; // 出たキャラの ID（出た順。最後の数体）
  let lastDropLeft = null; // 最後に落としたときの、制限時間の残り（ミリ秒。制限時間がなければ null）

  function resetCounters() {
    rotations = flips = flipRun = flipStreak = 0;
    drawn = [];
    lastDropLeft = null;
  }

  function rotate() {
    if (paused || state !== "aim" || !held) return;
    held.angle += Math.PI / 4; // 45度
    rotations++;
    flipRun = 0;
    clampHeld();
  }

  // 左右反転（見た目の画像と当たり判定の両方）。反転は、くるっと裏返るアニメーションで見せる
  const FLIP_MS = 260;
  function flip() {
    if (paused || state !== "aim" || !held) return;
    flipHeld();
  }

  // 持っているキャラを反転する（アニメーションつき）
  function flipHeld() {
    flips++;
    flipRun++;
    flipStreak = Math.max(flipStreak, flipRun);
    const from = held.shape;
    held.shape = Shape.flipped(from);
    held.flipAnim = { from, at: performance.now() };
    clampHeld();
  }

  function moveBy(dx) {
    if (!held) return;
    held.x += dx;
    clampHeld();
  }

  // ---------- オンライン対戦 ----------
  // ホスト（部屋を作った側）はふつうに物理計算をして、snapshot() で今の状態を書き出す。
  // ゲスト（参加した側）は startRemote() で始め、物理計算はせずに、
  // applySnapshot() で受け取った位置にキャラを描くだけ。
  // 画面の高さは端末ごとに違うので、y は「土台の上面からの高さ」でやりとりする
  let remote = false; // ゲストとして表示しているか
  let remoteBodies = new Map(); // 体の番号 → { shape, x, y, angle（表示中）, tx, ty, ta（届いた位置） }
  let awaitingDrop = false; // ゲストが落としたあと、ホストで実際に落ちるまで待っている

  function startRemote(cb) {
    callbacks = cb || {};
    demo = null;
    rule = null;
    createWorld(PLATFORM_FROM_BOTTOM);
    setTurnTimeLimit(0);
    remoteTime = null;
    remote = true;
    remoteBodies = new Map();
    awaitingDrop = false;
    state = "remote";
    resetCounters();
  }

  // ID のキャラの形（知らない ID なら null。相手が新しいキャラのあるバージョンでも、落ちないように）
  const shapeById = (id) => shapes.find((s) => s.id === id) || null;
  const round = (v, k) => Math.round(v * k) / k;

  // ホスト：今の状態を書き出す（小さく送れるよう、数字の配列にする）
  function snapshot() {
    return {
      // [番号, キャラの ID, x, y, 角度, 反転（1 / 0）]
      b: pieces().map((b) => [b.id, b.shape.id, round(b.position.x, 10), round(b.position.y - platformTop, 10), round(b.angle, 1000), b.shape.flip ? 1 : 0]),
      h: held && state === "aim" ? [held.shape.id, round(held.x, 10), round(held.angle, 1000), held.shape.flip ? 1 : 0] : null,
      t: turnLimit && state === "aim" ? [Math.round(timeLeft()), turnLimit] : null, // 制限時間 [残り, 全部]（ミリ秒）
    };
  }

  // ゲスト：受け取った状態を反映する。myTurn: 自分（ゲスト）の手番か
  function applySnapshot(snap, myTurn) {
    if (!remote) return;
    // 制限時間（古いバージョンのホストからは届かない。おかしな値は使わない）
    const t = Array.isArray(snap.t) && snap.t[0] >= 0 && snap.t[1] > 0 && snap.t[1] <= 600000 ? snap.t : null;
    remoteTime = t ? { left: Math.min(t[0], t[1]), limit: t[1], at: performance.now() } : null;
    const seen = new Set();
    let top = platformTop;
    for (const [id, charId, x, yRel, a, f] of snap.b) {
      const y = yRel + platformTop;
      let r = remoteBodies.get(id);
      if (!r) {
        const base = shapeById(charId);
        if (!base) continue; // 知らないキャラは描かない
        const shape = f ? Shape.flipped(base) : base;
        r = { shape, x, y, angle: a };
        remoteBodies.set(id, r);
      }
      seen.add(id);
      r.tx = x;
      r.ty = y;
      r.ta = a;
      top = Math.min(top, y - Math.max(r.shape.w, r.shape.h) / 2);
    }
    for (const id of [...remoteBodies.keys()]) if (!seen.has(id)) remoteBodies.delete(id);
    camTargetY = Math.min(0, top - (HOLD_Y + 240));
    reachHeight((platformTop - top) / UNITS_PER_METER);

    // 持っているキャラ
    if (!snap.h) {
      awaitingDrop = false; // ホストで落ちた
      if (!(myTurn && state === "aim")) {
        held = null;
        state = "remote";
      }
      return;
    }
    if (awaitingDrop) return; // 自分が落としたキャラが、まだホストで落ちていない
    const [charId, x, angle, f] = snap.h;
    const base = shapeById(charId);
    if (!base) return; // 知らないキャラ
    const shape = f ? Shape.flipped(base) : base;
    if (myTurn) {
      // 自分の手番：最初の1回だけ受け取り、あとは自分の指で動かす
      if (!held || held.shape.id !== shape.id || state !== "aim") {
        held = { shape, x, angle };
        clampHeld();
        state = "aim";
      }
    } else {
      held = { shape, x, angle }; // 相手の手番：相手が動かしているのを、そのまま映す
      state = "remote";
    }
  }

  // ゲスト：届いた位置に向かって、表示中の位置をなめらかに近づける
  function smoothRemote() {
    for (const r of remoteBodies.values()) {
      r.x += (r.tx - r.x) * 0.4;
      r.y += (r.ty - r.y) * 0.4;
      let da = r.ta - r.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da)); // 一番近い回り方
      r.angle += da * 0.4;
    }
  }

  // ホスト：相手（ゲスト）が動かしているキャラの位置と角度を反映する
  // flip：反転しているか（相手から届いたもの。古いバージョンの相手からは届かないので、そのときはそのまま）
  function setHeldPose(x, angle, flip) {
    if (!held) return;
    held.angle = angle;
    if (typeof flip === "boolean" && !!held.shape.flip !== flip) flipHeld();
    moveHeldTo(x);
  }

  // 持っているキャラの位置と角度（ゲストが相手に送るため）。持っていなければ null
  function heldPose() {
    return held && state === "aim" ? { x: held.x, angle: held.angle, flip: !!held.shape.flip } : null;
  }

  // ---------- CPU 用 ----------
  // 持っているキャラを、指定した位置に動かす（画面からはみ出さないように調整される）
  function moveHeldTo(x) {
    if (!held) return;
    held.x = x;
    clampHeld();
  }

  // 置き方を試してみる：今の塔を別の世界にそっくり写し、
  // 持っているキャラを位置 x・角度 angle で落としてみて、どうなったかを返す。
  // 塔のキャラも本物と同じように動くので、ぶつかった衝撃で塔が崩れるかも分かる。
  // 本物のゲームには何も影響しない
  // flip：true なら、今の向きから左右反転して試す
  function evaluatePlacement(x, angle, flip = false) {
    if (!held || !engine) return null;
    const sim = Engine.create();
    sim.positionIterations = engine.positionIterations;
    sim.velocityIterations = engine.velocityIterations;
    const plat = Bodies.rectangle(platform.position.x, platform.position.y, PLATFORM_W, PLATFORM_H, {
      isStatic: true,
      angle: platform.angle,
      friction: platform.friction,
    });
    Composite.add(sim.world, plat);
    const tower = [];
    for (const b of pieces()) {
      const copy = Shape.spawnBody(b.shape, b.position.x, b.position.y, b.angle, pieceOptions());
      copy.landed = true;
      copy.startPos = { x: b.position.x, y: b.position.y };
      Composite.add(sim.world, copy);
      tower.push(copy);
    }
    // 画面からはみ出さない位置に直してから落とす（本物と同じ）
    const saved = { x: held.x, angle: held.angle, shape: held.shape };
    held.angle = angle;
    if (flip) held.shape = Shape.flipped(held.shape);
    moveHeldTo(x);
    const startX = held.x;
    const piece = Shape.spawnBody(held.shape, held.x, camY + holdY(), angle, pieceOptions());
    held.x = saved.x;
    held.angle = saved.angle;
    held.shape = saved.shape;
    Composite.add(sim.world, piece);

    // 本物と同じ細かさで計算する（落下速度の上限・小さな揺れを弱める処理も同じ）
    const all = [piece, ...tower];
    // ルールの動き（おばけ屋敷のおばけなど）も、本物と同じように試算に入れる
    const ruleSim = rule && rule.simulate ? rule.simulate(ruleAPI, rule.params, rule.state) : null;
    let landed = false, still = 0;
    for (let i = 0; i < 300 && still < 15; i++) {
      if (ruleSim) ruleSim.step(landed ? [] : [piece]);
      for (let k = 0; k < SUBSTEPS; k++) {
        if (!landed && piece.velocity.y > MAX_FALL_SPEED) Body.setVelocity(piece, { x: piece.velocity.x, y: MAX_FALL_SPEED });
        Engine.update(sim, STEP_MS / SUBSTEPS);
        for (const b of all) {
          if (b.speed < 0.3) Body.setVelocity(b, { x: b.velocity.x * 0.9, y: b.velocity.y * 0.9 });
          if (b.angularSpeed < 0.004) Body.setAngularVelocity(b, b.angularVelocity * 0.9);
        }
      }
      if (!landed && piece.speed < 1 && piece.position.y > camY + holdY() + 20) landed = true;
      const moving = all.some((b) => b.speed > 0.15 || b.angularSpeed > 0.01);
      still = landed && !moving ? still + 1 : 0;
      // どれかが土台から落ちたら、もうだめな置き方なので計算を打ち切る（時間の節約）
      if (all.some((b) => b.bounds.min.y > platformTop - 2)) break;
    }
    // 塔のキャラがどれだけ動いたか（大きいほど、置いた衝撃で塔がぐらついた）
    let towerMove = 0;
    for (const b of tower) towerMove += Math.hypot(b.position.x - b.startPos.x, b.position.y - b.startPos.y);
    const anyFell = all.some((b) => b.bounds.min.y > platformTop - 2);
    return {
      x: startX, // 実際に落とした位置
      fell: anyFell || still < 15, // どれかが土台から落ちた・止まらなかった
      drift: Math.abs(piece.position.x - startX), // 着地してから横にずれた量
      turn: Math.abs(piece.angle - angle), // 着地してから回った量
      towerMove,
      restY: piece.position.y, // 止まったときの重心の高さ（大きいほど低い＝安定）
      top: piece.bounds.min.y, // 止まったときの上端
      centerGap: Math.abs(piece.position.x - platform.position.x), // 土台の真ん中からのずれ
    };
  }

  // CPU が置き方を考えるときの、位置の候補（塔のてっぺん付近を中心に7か所）
  function candidateXs() {
    let top = null;
    for (const b of pieces()) if (!top || b.bounds.min.y < top.bounds.min.y) top = b;
    const center = top ? (top.position.x + WORLD_W / 2) / 2 : WORLD_W / 2;
    return [-75, -50, -25, 0, 25, 50, 75].map((d) => center + d);
  }

  // 人の操作を受け付けるか（CPU の手番では受け付けない）
  let inputEnabled = true;
  function setInputEnabled(on) {
    inputEnabled = on;
  }

  // 持っているキャラを表示する高さ（画面の上から）。
  // ふつうは HOLD_Y。大きいキャラ（ジャイアントなど）は、頭が画面の上の表示に隠れないよう少し下げる
  function holdY() {
    if (!held) return HOLD_Y;
    const cos = Math.cos(held.angle), sin = Math.sin(held.angle);
    let top = 0; // 重心から見た、キャラの一番上の位置（マイナスが上）
    for (const part of held.shape.parts) {
      for (const p of part) top = Math.min(top, p.x * sin + p.y * cos); // 回転したあとの y
    }
    return Math.max(HOLD_Y, 95 - top);
  }

  // 持っているキャラが画面の左右からはみ出さないようにする
  function clampHeld() {
    const cos = Math.cos(held.angle), sin = Math.sin(held.angle);
    let minX = Infinity, maxX = -Infinity;
    for (const part of held.shape.parts) {
      for (const p of part) {
        const rx = p.x * cos - p.y * sin; // 回転したあとの x
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
      }
    }
    held.x = Math.max(-minX, Math.min(WORLD_W - maxX, held.x));
  }

  function drop() {
    if (paused || state !== "aim" || !held) return false;
    lastDropLeft = timeLeft();
    flipRun = 0;
    if (remote) {
      // ゲスト：自分では落とさず、位置と角度をホストに送ってもらう（main.js 経由）
      if (callbacks.onRemoteDrop) callbacks.onRemoteDrop(held.x, held.angle, !!held.shape.flip);
      held = null;
      state = "remote";
      awaitingDrop = true;
      return true;
    }
    const body = Shape.spawnBody(held.shape, held.x, camY + holdY(), held.angle, pieceOptions());
    Composite.add(engine.world, body);
    dropped = body;
    lastAimMs = simTime - aimStartAt; // キャラが出てから落とすまでの時間（実績「早業」に使う）
    droppedAt = simTime;
    held = null;
    state = "falling";
    stillFrames = 0;
    if (callbacks.onDrop) callbacks.onDrop(body.shape); // どのキャラを落としたかも知らせる
    return true;
  }

  // ---------- 毎フレームの処理 ----------
  function loop(time) {
    requestAnimationFrame(loop);
    moveClouds(Math.min(time - lastTime, 100) / 1000);
    stepTitleFx(Math.min(time - lastTime, 100) / 1000);
    // オーラの粒を動かす（ポーズ中・フォトモード中は止める）
    frameDt = engine && !paused ? Math.min(time - lastTime, 100) / 1000 : 0;
    Aura.update(frameDt);
    if (engine && !paused && !(state === "sandbox" && sandbox.paused)) {
      // 画面のリフレッシュレート（60Hz/120Hz）に関係なく、一定の速さで物理演算を進める
      acc += Math.min(time - lastTime, 100);
      while (acc >= STEP_MS && engine) {
        physicsStep();
        acc -= STEP_MS;
        checkTurnTimer();
        checkFallen();
        checkSettled();
        checkGameOverDelay();
        stepDemo();
      }
      if (remote) smoothRemote();
      // カメラをなめらかに目標へ近づける
      camY += (camTargetY - camY) * 0.08;
      // 空の様子も、なめらかに今の高さへ近づける
      skyHeight += (peakHeight - skyHeight) * 0.03;
    }
    lastTime = time;
    draw();
  }

  // 物理演算を1ステップ（60分の1秒）進める
  function physicsStep() {
    for (let i = 0; i < SUBSTEPS; i++) {
      limitFallSpeed();
      Engine.update(engine, STEP_MS / SUBSTEPS);
      dampSlowBodies();
    }
    simTime += STEP_MS;
    // 特殊ルールの毎ステップの処理（風を吹かせる、土台を傾ける など）
    if (rule && rule.step && (state === "aim" || state === "falling" || state === "settled")) {
      rule.step(ruleAPI, rule.params, rule.state);
    }
  }

  // 落としたキャラが着地するまでは、落下速度に上限をつける（ふわっと置く感じにする）
  function limitFallSpeed() {
    for (const b of bodies()) {
      if (b.landed) continue;
      const v = b.velocity;
      if (v.y > MAX_FALL_SPEED) Body.setVelocity(b, { x: v.x, y: MAX_FALL_SPEED });
    }
  }

  // ほぼ止まっているキャラの細かい揺れ（プルプル震える動き）を弱める
  // 本当に倒れていく動きは重力でどんどん速くなるので、ここでは止まらない
  function dampSlowBodies() {
    for (const b of bodies()) {
      if (b.speed < 0.3) Body.setVelocity(b, { x: b.velocity.x * 0.9, y: b.velocity.y * 0.9 });
      if (b.angularSpeed < 0.004) Body.setAngularVelocity(b, b.angularVelocity * 0.9);
    }
  }

  // 土台から落ちたキャラがいないか調べる
  function checkFallen() {
    // ずっと下まで落ちたキャラは、計算の無駄なので消す
    for (const b of bodies()) {
      if (b.position.y > platformTop + 1500) Composite.remove(engine.world, b);
    }
    if (state !== "aim" && state !== "falling" && state !== "settled") return;
    for (const b of bodies()) {
      // キャラ全体が土台の上面より下にある ＝ 落ちた
      if (b.bounds.min.y > platformTop + 10) {
        state = "over";
        held = null;
        fellAt = simTime;
        if (callbacks.onFall) callbacks.onFall();
        return;
      }
    }
  }

  // 落ちていく様子を少し見せてから、ゲームオーバーを知らせる
  function checkGameOverDelay() {
    if (state !== "over" || simTime - fellAt < GAMEOVER_DELAY) return;
    state = "ended"; // 2回知らせないように
    if (callbacks.onGameOver) callbacks.onGameOver(getStats());
  }

  // 制限時間を過ぎたら、その場で自動的に落とす
  // （ゲストは数えない。時間切れで落とすのはホスト）
  function checkTurnTimer() {
    if (!remote && timeLeft() === 0) drop();
  }

  // 全部のキャラが止まったら、次のキャラへ
  function checkSettled() {
    if (state !== "falling") return;
    const moving = bodies().some((b) => b.speed > 0.15 || b.angularSpeed > 0.01);
    stillFrames = moving ? 0 : stillFrames + 1;
    const timeout = simTime - droppedAt > SETTLE_TIMEOUT;
    // 0.5秒止まっていたら（または時間切れなら）OK
    if (stillFrames > 30 || timeout) {
      state = "settled";
      updateCamera();
      reachHeight(getStats().height);
      // aimMs：その1手にかかった時間（ミリ秒）、edge：土台の端からどれだけの所に着地したか（土台の幅に対する割合）
      if (callbacks.onSettled) callbacks.onSettled(Object.assign(getStats(), { aimMs: lastAimMs, edge: edgeRatio(dropped) }));
      else nextPiece();
    }
  }

  let lastAimMs = 0; // 最後の1手にかかった時間（ミリ秒）

  // キャラ b が土台の上に直接乗っているとき、土台の端から一番近い接地点までの距離（土台の幅に対する割合）。
  // 土台に乗っていない（ほかのキャラの上・落ちた）ときは null（実績「崖っぷち」に使う）
  function edgeRatio(b) {
    if (!b || !engine || !Composite.get(engine.world, b.id, "body")) return null;
    const bottom = b.bounds.max.y;
    if (bottom < platformTop - 4 || bottom > platformTop + 8) return null; // 土台の上面にふれていない
    const left = platform.position.x - PLATFORM_W / 2;
    const right = platform.position.x + PLATFORM_W / 2;
    let best = null;
    const parts = b.parts.length > 1 ? b.parts.slice(1) : b.parts;
    for (const part of parts) {
      for (const v of part.vertices) {
        if (v.y < bottom - 4 || v.x < left || v.x > right) continue; // 一番下のあたりで、土台の上にある点だけ
        const d = Math.min(v.x - left, right - v.x);
        if (best === null || d < best) best = d;
      }
    }
    return best === null ? null : best / PLATFORM_W;
  }

  // 塔のてっぺんが、持っているキャラに近づいたらカメラを上げる
  function updateCamera() {
    camTargetY = Math.min(0, towerTop() - (HOLD_Y + 240));
  }

  // 塔のてっぺんの y 座標（何もなければ土台の上面）
  function towerTop() {
    let top = platformTop;
    for (const b of bodies()) top = Math.min(top, b.bounds.min.y);
    return top;
  }

  // 今の状況（積んだ数・高さ）
  function getStats() {
    const list = bodies();
    return {
      count: list.length,
      height: Math.max(0, (platformTop - towerTop()) / UNITS_PER_METER), // メートル
    };
  }

  // 動いているキャラ（土台や、固定したキャラ以外）。物理の処理に使う
  function bodies() {
    return Composite.allBodies(engine.world).filter((b) => !b.isStatic && b.parent === b);
  }

  // 土台以外のすべてのキャラ（固定したものも含む）。描画に使う
  function pieces() {
    return Composite.allBodies(engine.world).filter((b) => b !== platform && b.parent === b);
  }

  // ---------- 描画 ----------
  // 「どこを写すか」を view で表す：{ left, top, w, h } … 写すゲーム内の範囲（左上と、幅・高さ）
  // ふだんはカメラの位置の、画面ちょうどの範囲。フォトモードでは指で動かした範囲
  let view = { left: 0, top: 0, w: WORLD_W, h: 800 };
  // フォトモードの状態 { view: 写している範囲 }。フォトモードでなければ null
  let photo = null;

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    if (photo) photo.view.h = photo.view.w * (canvas.height / canvas.width); // 画面の形が変わっても合わせる
    const v = photo ? photo.view : { left: 0, top: camY, w: WORLD_W, h: worldH };
    renderScene(ctx, v, (canvas.width / v.w), !photo);
    // 特殊ルールの表示（風の筋など。画面の座標で描く）
    if (!photo && rule && rule.draw) {
      ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
      rule.draw(ctx, ruleAPI, rule.params, rule.state);
    }
  }

  // 範囲 v を、キャンバス c に描く。scale: ゲーム内の 1 が何ピクセルか
  // withUI: 持っているキャラ・目盛り・制限時間なども描くか（写真や画像を作るときは描かない）
  function renderScene(c, v, scale, withUI) {
    const prevCtx = ctx;
    ctx = c;
    view = v;
    // ゲーム内の座標のまま描けるように、拡大と位置をセットする
    ctx.setTransform(scale, 0, 0, scale, -v.left * scale, -v.top * scale);
    syncTheme();
    drawBackground();
    if (homeActive() && homeScene.drawBack) homeScene.drawBack(ctx, groundY()); // ホーム画面の飾り（丘・屋敷・かぼちゃ・霧・おばけ）

    ctx.save();
    if (withUI && engine && state !== "demo") drawHeightMarks();
    drawPillar();
    drawPlatform();

    // 積まれたキャラ（レアキャラは、落ちている途中は強く、積んだあとは控えめにオーラを出す）
    if (withUI) Aura.drawSmoke(ctx); // 闇のオーラのもやは、キャラの後ろに
    if (engine) {
      const alpha = state === "demo" && demo ? demo.alpha : 1; // タイトルのデモで、塔がふわっと消えていくとき
      for (const b of pieces()) {
        const falling = state !== "demo" && b === dropped && !b.landed;
        drawSprite(b.shape, b.position.x, b.position.y, b.angle, alpha, falling ? "strong" : "rest", withUI);
      }
      // ゲスト：ホストから届いた位置のキャラ
      if (remote) for (const r of remoteBodies.values()) drawSprite(r.shape, r.x, r.y, r.angle, 1, "rest", withUI);
    }
    // 地面はキャラより手前に描く（落ちたキャラが地面の向こうに消えていくように）
    drawGround();
    if (!engine || !withUI) {
      ctx.restore();
      ctx = prevCtx;
      return;
    }

    // 持っているキャラ（と、落ちる位置のガイド線）
    // （オンライン対戦のゲストでは、相手が動かしているキャラも state "remote" で描く）
    if (held && (state === "aim" || state === "remote")) {
      const y = camY + holdY();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(held.x, y);
      ctx.lineTo(held.x, platformTop);
      ctx.stroke();
      ctx.setLineDash([]);
      drawHeldSprite(held, y); // 持っている間は、オーラを強く
      if (debug) drawHeldDebug(held, y);
      drawTimer(held.x, y);
    }

    if (state === "sandbox") drawSandboxSelection();
    Aura.drawFront(ctx); // オーラの粒（光の粒・もや・キラッ）と稲妻
    if (debug) drawDebug();
    ctx.restore();
    ctx = prevCtx;
  }

  // ---------- 画像を作る（リザルトカード・フォトモード） ----------
  // 塔全体（土台と、積まれたキャラ）が入る範囲 { minX, maxX, minY, maxY }
  function sceneBounds() {
    const b = { minX: WORLD_W / 2 - PLATFORM_W / 2, maxX: WORLD_W / 2 + PLATFORM_W / 2, minY: platformTop, maxY: groundY() + 30 };
    const add = (x1, y1, x2, y2) => {
      b.minX = Math.min(b.minX, x1);
      b.maxX = Math.max(b.maxX, x2);
      b.minY = Math.min(b.minY, y1);
    };
    if (engine) {
      for (const p of pieces()) {
        if (p.position.y > groundY()) continue; // 地面の下まで落ちたキャラは入れない
        add(p.bounds.min.x, p.bounds.min.y, p.bounds.max.x, p.bounds.max.y);
      }
    }
    for (const r of remoteBodies.values()) {
      const s = Math.max(r.shape.w, r.shape.h) / 2;
      add(r.x - s, r.y - s, r.x + s, r.y + s);
    }
    return b;
  }

  // 範囲 b が全部入る、縦横比 aspect（幅÷高さ）の view を作る。まわりに少し余白をとる
  function fitView(aspect, b, margin = 0.08) {
    let w = (b.maxX - b.minX) * (1 + margin * 2);
    let h = (b.maxY - b.minY) * (1 + margin * 2);
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    const cx = (b.minX + b.maxX) / 2;
    // 下は地面ぎりぎりにそろえる（空を広く写す）
    return { left: cx - w / 2, top: b.maxY - h, w, h };
  }

  // 範囲 v を、幅 pxW × 高さ pxH の画像（キャンバス）にする
  function renderImage(pxW, pxH, v) {
    const c = document.createElement("canvas");
    c.width = pxW;
    c.height = pxH;
    renderScene(c.getContext("2d"), v, pxW / v.w, false);
    return c;
  }

  // 塔全体を写した画像
  function towerImage(pxW, pxH) {
    return renderImage(pxW, pxH, fitView(pxW / pxH, sceneBounds()));
  }

  // ---------- フォトモード ----------
  // 物理演算を止めて、塔全体が画面に収まるように縮小する。指でドラッグ・ピンチして構図を変えられる
  const PHOTO_MIN_W = 150; // 一番拡大したときに写す幅（ゲーム内の単位）

  function enterPhoto() {
    if (photo) return;
    const aspect = canvas.width / canvas.height;
    const fit = fitView(aspect, sceneBounds(), 0.06);
    // 塔が低いときも、ふだんの画面より拡大はしない（下の端はそのままで、幅を画面と同じにする）
    if (fit.w < WORLD_W) {
      const bottom = fit.top + fit.h;
      fit.left = fit.left + fit.w / 2 - WORLD_W / 2;
      fit.w = WORLD_W;
      fit.h = WORLD_W / aspect;
      fit.top = bottom - fit.h;
    }
    photo = { view: fit, fitW: fit.w, wasPaused: paused };
    paused = true;
  }

  function exitPhoto() {
    if (!photo) return;
    paused = photo.wasPaused;
    photo = null;
  }

  // 画面上で dx, dy ピクセル動かした（写す範囲を、指と同じ向きに動かす）
  function photoPan(dx, dy) {
    const k = photo.view.w / canvas.clientWidth;
    photo.view.left -= dx * k;
    photo.view.top -= dy * k;
    clampPhoto();
  }

  // 画面上の点 (sx, sy) を中心に、factor 倍に拡大する（1 より大きいと拡大）
  function photoZoom(factor, sx, sy) {
    const v = photo.view;
    const maxW = Math.max(photo.fitW * 1.5, WORLD_W * 1.5);
    const newW = Math.max(PHOTO_MIN_W, Math.min(maxW, v.w / factor));
    const k = v.w / canvas.clientWidth;
    const k2 = newW / canvas.clientWidth;
    const wx = v.left + sx * k, wy = v.top + sy * k; // 指の下にあるゲーム内の点は、拡大しても指の下のまま
    v.left = wx - sx * k2;
    v.top = wy - sy * k2;
    v.w = newW;
    v.h = newW * (canvas.height / canvas.width);
    clampPhoto();
  }

  // 塔から離れすぎないようにする（写す範囲の真ん中が、いつも塔の範囲の中にあるように）
  function clampPhoto() {
    const v = photo.view;
    const b = sceneBounds();
    const cx = Math.max(b.minX, Math.min(b.maxX, v.left + v.w / 2));
    const cy = Math.max(b.minY, Math.min(b.maxY, v.top + v.h / 2));
    v.left = cx - v.w / 2;
    v.top = cy - v.h / 2;
  }

  // 今写している範囲の画像（横 1080 ピクセル以上）
  function photoImage() {
    if (!photo) return null;
    const w = Math.max(1080, canvas.width);
    return renderImage(w, Math.round((w * canvas.height) / canvas.width), photo.view);
  }

  // ---------- 背景と土台の色（themes.js で選んだもの） ----------
  // 何も選ばれていないときの色（config.js の themes の「青空」「木の台」と同じ）
  let bgTheme = { top: "#7ec8f0", bottom: "#d8f0ff", cloud: "#f4faff", ground: "#7cc35a", groundDark: "#5fa845" };
  let platTheme = { body: "#8a5a3b", top: "#6fbf4a", pillar: "#a39587" };

  // bgTheme・platTheme は「今描くもの」。プロフィールで選んだものは chosenBg・chosenPlat に残しておく
  let chosenBg = bgTheme;
  let chosenPlat = platTheme;
  // ホーム画面だけの見た目（ハロウィンの期間中など。halloween-home.js の scene()）。null ならいつもの見た目
  //   { background, platform, bats（キャンバスのこうもりの数）, birds（false なら鳥を出さない）, drawBack(ctx, groundY) }
  let homeScene = null;

  function setTheme(background, platformDef) {
    if (background) chosenBg = background;
    if (platformDef) chosenPlat = platformDef;
    syncTheme();
  }

  // ホーム画面の見た目を入れる・外す（halloween.js から。タイトル画面が出ているあいだだけ入れる）
  function setHomeScene(scene) {
    homeScene = scene || null;
    syncTheme();
  }

  // ホーム画面の見た目を使うか（タイトルのデモのあいだだけ。ゲームが始まったら、選んだ背景・土台に戻る）
  function homeActive() {
    return !!homeScene && state === "demo";
  }

  function syncTheme() {
    bgTheme = homeActive() ? homeScene.background : chosenBg;
    platTheme = homeActive() ? homeScene.platform : chosenPlat;
  }

  // 空に散らばる星（星空の背景のとき）。位置は画面の割合
  const stars = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: 0.6 + Math.random() * 1.2 }));

  // ---------- 高さで変わる背景（config.js の sky） ----------
  // このゲームで一番高く積めた高さ（m）と、背景に使っている高さ（なめらかに追いかける）
  let peakHeight = 0;
  let skyHeight = 0;
  let skyStage = 0; // 到達した背景の番号（「〇〇に到達！」を1回だけ出すため）

  // 背景の段階の一覧。1つ目（地上）は、プロフィールで選んだ背景の色にする。
  // 書いていない色などは、1つ前の段階と同じにする
  function skyStages() {
    const conf = window.GAME_CONFIG.sky;
    const list = conf && conf.stages && conf.stages.length ? conf.stages : [{ height: 0, name: "" }];
    const result = [];
    list.forEach((s, i) => result.push(Object.assign({}, i === 0 ? Object.assign({ clouds: 1 }, bgTheme) : result[i - 1], s)));
    return result;
  }

  // 塔が高くなった：新しい背景に届いたら知らせる（main.js が「〇〇に到達！」を出す）
  function reachHeight(h) {
    if (state === "demo" || !(h > peakHeight)) return;
    syncTheme();
    peakHeight = h;
    const stages = skyStages();
    let i = 0;
    while (i + 1 < stages.length && h >= stages[i + 1].height) i++;
    if (i > skyStage) {
      skyStage = i;
      if (callbacks.onSkyStage) callbacks.onSkyStage(stages[i]);
    }
  }

  // 高さ h（m）での空の様子 { top, bottom, cloud, clouds, stars }。
  // 次の背景の blend m 手前から、少しずつ次の背景の色に変えていく
  function skyAt(h) {
    const stages = skyStages();
    const blend = Math.max(0.01, (window.GAME_CONFIG.sky && window.GAME_CONFIG.sky.blend) || 1);
    let i = 0;
    while (i + 1 < stages.length && h >= stages[i + 1].height) i++;
    const cur = stages[i];
    const next = stages[i + 1] || cur;
    const t = next === cur ? 0 : Math.max(0, Math.min(1, (h - (next.height - blend)) / blend));
    const num = (s, key, def) => (typeof s[key] === "number" ? s[key] : def);
    return {
      top: mix(cur.top, next.top, t),
      bottom: mix(cur.bottom, next.bottom, t),
      cloud: mix(cur.cloud, next.cloud, t),
      clouds: num(cur, "clouds", 1) * (1 - t) + num(next, "clouds", 1) * t,
      stars: (cur.stars ? 1 : 0) * (1 - t) + (next.stars ? 1 : 0) * t,
    };
  }

  // 空のグラデーション（塔が高くなるほど、config.js の sky のとおりに変わる）
  // 空・雲・星は「遠くにある」ので、写す範囲いっぱいに、画面上の大きさを変えずに描く
  // （k：ふだんの画面に比べて、何倍の範囲を写しているか）
  function drawBackground() {
    const k = view.w / WORLD_W;
    const sky = skyAt(skyHeight);
    const g = ctx.createLinearGradient(0, view.top, 0, view.top + view.h);
    g.addColorStop(0, sky.top);
    g.addColorStop(1, sky.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(view.left, view.top, view.w, view.h);
    if (sky.stars > 0) {
      ctx.fillStyle = "#ffffff";
      for (const s of stars) {
        ctx.globalAlpha = sky.stars * (0.5 + 0.5 * Math.sin(performance.now() / 700 + s.x * 40)); // ちかちか
        ctx.beginPath();
        ctx.arc(view.left + s.x * view.w, view.top + s.y * view.h, s.r * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (bgTheme.moon || bgTheme.bats) drawHalloweenSky(k);
    if (bgTheme.aurora) drawAurora(k);
    if (sky.clouds > 0) {
      ctx.globalAlpha = Math.min(1, sky.clouds);
      drawClouds(k, sky.cloud);
      ctx.globalAlpha = 1;
    }
    if (!photo && !(homeActive() && homeScene.birds === false)) drawBirds(); // ハロウィンのホームは、鳥の代わりにこうもり
  }

  // ---------- 雲 ----------
  // 雲をゆっくり右へ流す。画面の右から出たら左に戻る
  function moveClouds(dt) {
    if (reducedMotion.matches) return;
    for (const c of clouds) {
      c.x += c.speed * dt;
      if (c.x > 1.25) c.x = -0.25;
    }
  }

  // 雲の形：楕円を4つ重ねて、もこもこにする [中心x, 中心y, 横半径, 縦半径]
  const CLOUD_PUFFS = [[0, 0, 34, 16], [-26, 5, 22, 12], [28, 4, 24, 13], [4, -10, 20, 14]];

  function drawClouds(k, color) {
    ctx.fillStyle = color;
    const base = ctx.globalAlpha;
    for (const c of clouds) {
      // カメラが上に行くと、雲は少しだけ下に流れる（遠くにある感じを出す。奥の雲ほどゆっくり）
      const x = view.left + c.x * view.w;
      const y = view.top + c.y * view.h - camY * c.depth * k;
      const s = c.scale * k;
      ctx.globalAlpha = base * c.alpha;
      for (const [dx, dy, rx, ry] of CLOUD_PUFFS) {
        ctx.beginPath(); // 1つずつ塗る（まとめて塗ると、重なった部分が抜けてしまう）
        ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = base;
  }

  // ---------- タイトル画面の演出（鳥） ----------
  // タイトル画面が出ているあいだだけ動かす（title-fx.js が setTitleFx でオン・オフする）。
  // 「視差効果を減らす」が ON の端末では出さない。数値は config.js の titleFx
  let titleFxOn = false;
  const birds = []; // { x, y（画面の割合）, vx, size, phase }
  let nextBirdAt = 0; // 次に鳥が来る時刻（秒）
  const fxNow = () => performance.now() / 1000;
  // [最小, 最大] のあいだのランダムな数（書いていなければ def）
  const between = (range, def) => {
    const [a, b] = Array.isArray(range) ? range : def;
    return a + Math.random() * (b - a);
  };

  function setTitleFx(on) {
    titleFxOn = on && !reducedMotion.matches;
    if (!titleFxOn) {
      birds.length = 0;
    }
    nextBirdAt = fxNow() + between((FX.birds || {}).firstAfter, [2, 4]);
  }

  // 毎フレーム：鳥を飛ばす（dt：秒）
  function stepTitleFx(dt) {
    if (!titleFxOn) return;
    const conf = FX.birds || {};
    if (fxNow() >= nextBirdAt) {
      // 左右どちらかから、数羽の群れが横切る
      const dir = Math.random() < 0.5 ? 1 : -1;
      const n = Math.round(between(conf.count, [1, 4]));
      const y = 0.1 + Math.random() * 0.25;
      const speed = conf.speed || 70;
      for (let i = 0; i < n; i++) {
        birds.push({
          x: dir > 0 ? -20 - i * 22 : WORLD_W + 20 + i * 22,
          y: y + (i % 2) * 0.025 + Math.random() * 0.01,
          vx: dir * speed * (0.9 + Math.random() * 0.2),
          size: 5 + Math.random() * 3,
          phase: Math.random() * Math.PI * 2,
        });
      }
      nextBirdAt = fxNow() + between(conf.every, [6, 12]);
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.x += b.vx * dt;
      b.phase += dt * 12; // 羽ばたき
      if (b.x < -120 || b.x > WORLD_W + 120) birds.splice(i, 1);
    }
  }

  // 鳥（羽を上下に動かす「く」の字を2つつなげた形）。色は、選んだ背景の空の色を暗くしたもの
  function drawBirds() {
    if (!birds.length) return;
    ctx.strokeStyle = bgTheme.stars ? "#dfe6f7" : mix(bgTheme.top || "#7ec8f0", "#1d2433", 0.75);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const b of birds) {
      const x = view.left + b.x;
      const y = view.top + b.y * view.h;
      const flap = Math.sin(b.phase) * 0.6;
      ctx.beginPath();
      ctx.moveTo(x - b.size, y - b.size * flap);
      ctx.quadraticCurveTo(x - b.size * 0.4, y - b.size * 0.2, x, y);
      ctx.quadraticCurveTo(x + b.size * 0.4, y - b.size * 0.2, x + b.size, y - b.size * flap);
      ctx.stroke();
    }
  }

  // ---------- 地面・柱・土台 ----------
  function groundY() {
    return platformTop + GROUND_BELOW_PLATFORM;
  }

  // 土台と柱の大きさ（絵を作るときに使う。当たり判定は createWorld の四角）
  const PILLAR_W = 70;
  const platformSize = { w: PLATFORM_W, h: PLATFORM_H, pillarW: PILLAR_W, pillarH: GROUND_BELOW_PLATFORM - PLATFORM_H + 10 };

  // 今の土台の絵（platform-art.js。テーマごとに1回だけ描いて、あとは使い回す）
  function platformArt() {
    return PlatformArt.build(platTheme, platformSize);
  }

  // 土台を支える柱（土台の style に合わせた絵を貼る。下の端は地面に隠れる）
  function drawPillar() {
    const p = platformArt().pillar;
    ctx.drawImage(p.canvas, WORLD_W / 2 - p.w / 2, platformTop + PLATFORM_H, p.w, p.h);
  }

  // 土台（デモで傾いているときも、その角度で絵を回して貼る）。見た目だけで、当たり判定は四角のまま
  function drawPlatform() {
    const x = platform && engine ? platform.position.x : WORLD_W / 2;
    const y = platform && engine ? platform.position.y : platformTop + PLATFORM_H / 2;
    const angle = platform && engine ? platform.angle : 0;
    const p = platformArt().platform;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(p.canvas, -PLATFORM_W / 2 + p.x, -PLATFORM_H / 2 + p.y, p.w, p.h);
    if (platTheme.style === "gold") drawGoldShine();
    ctx.restore();
  }

  // 金の台：ときどき、光が横に走る（4.5秒ごとに0.9秒。ctx は土台の真ん中に合わせてある）
  function drawGoldShine() {
    if (reducedMotion.matches) return;
    const t = (performance.now() / 1000) % 4.5;
    if (t > 0.9) return;
    const cx = -PLATFORM_W / 2 - 40 + (t / 0.9) * (PLATFORM_W + 80);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-PLATFORM_W / 2, -PLATFORM_H / 2, PLATFORM_W, PLATFORM_H);
    ctx.clip();
    const g = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,240,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 14, -PLATFORM_H / 2);
    ctx.lineTo(cx + 24, -PLATFORM_H / 2);
    ctx.lineTo(cx + 14, PLATFORM_H / 2);
    ctx.lineTo(cx - 24, PLATFORM_H / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------- ハロウィンの夜（背景 moon・bats） ----------
  // 大きな満月（光のにじみも一緒に、最初に1回だけ画像にしておく）
  let moonSprite = null;
  function moonImage() {
    if (moonSprite) return moonSprite;
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(100, 100, 30, 100, 100, 100);
    glow.addColorStop(0, "rgba(255, 240, 190, 0.6)");
    glow.addColorStop(1, "rgba(255, 240, 190, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 200, 200);
    g.fillStyle = "#fff4c8";
    g.beginPath();
    g.arc(100, 100, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(220, 200, 140, 0.45)"; // もようのくぼみ
    for (const [x, y, r] of [[84, 90, 9], [112, 112, 12], [108, 80, 6], [88, 118, 5]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    moonSprite = c;
    return c;
  }

  // オーロラ（背景「オーロラ」）：空の上の方に、緑と水色の光の帯が3本、ゆっくりゆらめく。上に登るほど薄くなる。
  // 「視差効果を減らす」では止まった絵
  function drawAurora(k) {
    const fade = Math.max(0, 1 - skyHeight / 3);
    if (fade <= 0) return;
    const t = reducedMotion.matches ? 0 : performance.now() / 1000;
    const bands = [
      { y: 0.16, amp: 0.035, h: 0.16, color: "76, 255, 170", speed: 0.35 },
      { y: 0.24, amp: 0.03, h: 0.12, color: "90, 210, 255", speed: 0.25 },
      { y: 0.11, amp: 0.025, h: 0.1, color: "190, 120, 255", speed: 0.45 },
    ];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [i, b] of bands.entries()) {
      const top = (x) => view.top + view.h * (b.y + b.amp * Math.sin(x * 5 + t * b.speed + i * 2) + b.amp * 0.5 * Math.sin(x * 11 - t * b.speed * 1.7));
      const g = ctx.createLinearGradient(0, view.top + view.h * (b.y - b.amp), 0, view.top + view.h * (b.y + b.h));
      g.addColorStop(0, `rgba(${b.color}, 0)`);
      g.addColorStop(0.25, `rgba(${b.color}, ${0.32 * fade})`);
      g.addColorStop(1, `rgba(${b.color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const x = s / steps;
        ctx.lineTo(view.left + x * view.w, top(x));
      }
      for (let s = steps; s >= 0; s--) {
        const x = s / steps;
        ctx.lineTo(view.left + x * view.w, top(x) + view.h * b.h);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 満月とこうもり。上に登るほど薄くなる（高さで変わる背景に入れかわっていく）
  function drawHalloweenSky(k) {
    const fade = Math.max(0, 1 - skyHeight / 3);
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    if (bgTheme.moon) {
      const size = 130 * k; // タイトルのロゴ・ハイスコアにかからない、右上のあたり
      ctx.drawImage(moonImage(), view.left + view.w * 0.85 - size / 2, view.top + view.h * 0.28 - size / 2 - camY * 0.05 * k, size, size);
    }
    if (bgTheme.bats) {
      // 5羽のこうもりが、ゆっくり輪を描くように飛び回る（「視差効果を減らす」では止まった絵）。
      // ホーム画面では CSS のこうもりもいるので、数を減らす（config.js の events.halloween2026.home.bats）
      const t = reducedMotion.matches ? 0 : performance.now() / 1000;
      const count = homeActive() && typeof homeScene.bats === "number" ? homeScene.bats : 5;
      ctx.fillStyle = "#140a1f";
      for (let i = 0; i < count; i++) {
        const x = view.left + (((t * (18 + i * 5) + i * 97) % (WORLD_W + 120)) - 60) * k;
        const y = view.top + (0.12 + i * 0.07 + Math.sin(t * 1.3 + i * 2) * 0.03) * view.h;
        drawBat(x, y, (7 + (i % 3) * 2) * k, Math.sin(t * 10 + i * 3));
      }
    }
    ctx.globalAlpha = 1;
  }

  // こうもり（体と、ぱたぱたする羽）。flap：-1〜1（羽の上がり具合）
  function drawBat(x, y, s, flap) {
    const up = flap * s * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - s * 0.8, y - s * 0.6 - up, x - s * 1.8, y - up);
    ctx.quadraticCurveTo(x - s * 1.2, y + s * 0.1, x - s * 0.9, y + s * 0.4);
    ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.1, x, y + s * 0.5);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.1, x + s * 0.9, y + s * 0.4);
    ctx.quadraticCurveTo(x + s * 1.2, y + s * 0.1, x + s * 1.8, y - up);
    ctx.quadraticCurveTo(x + s * 0.8, y - s * 0.6 - up, x, y);
    ctx.fill();
  }

  // 地面（なだらかな丘）
  // 写す範囲が画面より広いとき（フォトモードで縮小したとき）は、左右にまっすぐのばす
  function drawGround() {
    const top = groundY();
    const left = Math.min(-10, view.left - 10);
    const right = Math.max(WORLD_W + 10, view.left + view.w + 10);
    const bottom = Math.max(top + 3000, view.top + view.h + 10);
    ctx.fillStyle = bgTheme.ground;
    ctx.beginPath();
    ctx.moveTo(left, top + 14);
    ctx.lineTo(-10, top + 14);
    ctx.quadraticCurveTo(WORLD_W * 0.25, top - 10, WORLD_W / 2, top);
    ctx.quadraticCurveTo(WORLD_W * 0.75, top + 10, WORLD_W + 10, top - 6);
    ctx.lineTo(right, top - 6);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bgTheme.groundDark; // 少し下に濃い色の帯
    ctx.fillRect(left, top + 40, right - left, bottom - top - 40);
  }

  // 2つの色を t の割合で混ぜる
  function mix(c1, c2, t) {
    const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // 高さの目盛り（1mごと）
  function drawHeightMarks() {
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (let m = 1; m < 100; m++) {
      const y = platformTop - m * UNITS_PER_METER;
      if (y < view.top + 90) break; // 画面の上の方はスコア表示と重なるので描かない
      if (y > view.top + view.h) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(30, y);
      ctx.stroke();
      ctx.fillText(m + "m", 4, y - 4);
    }
  }

  // 制限時間：持っているキャラの横に、残り時間の円と秒数を描く
  function drawTimer(x, y) {
    const left = timeLeft();
    if (left === null) return;
    const ratio = left / (remote ? remoteTime.limit : turnLimit);
    // キャラと重ならないよう、画面の空いている側に描く
    const tx = x < WORLD_W / 2 ? Math.min(x + 95, WORLD_W - 30) : Math.max(x - 95, 30);
    const color = left < 3000 ? "#ff4d4d" : "#ffffff"; // 残り3秒で赤くする
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.arc(tx, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(tx, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.ceil(left / 1000), tx, y + 1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // 持っているキャラ。反転したばかりなら、横に縮んでから裏返って広がるアニメーション（半分まで来たら絵を入れかえる）
  function drawHeldSprite(h, y) {
    const a = h.flipAnim;
    const t = a ? (performance.now() - a.at) / FLIP_MS : 1;
    if (t >= 1) {
      h.flipAnim = null;
      drawSprite(h.shape, h.x, y, h.angle, 1, "strong", true);
      return;
    }
    const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * t))); // 1 → 0 → 1
    ctx.save();
    ctx.translate(h.x, y);
    ctx.scale(sx, 1);
    ctx.translate(-h.x, -y);
    drawSprite(t < 0.5 ? a.from : h.shape, h.x, y, h.angle, 1, "strong", true);
    ctx.restore();
  }

  // 画像を、重心 (x, y) を中心に angle だけ回して描く。shape.flip なら左右反転して描く
  // aura：レア度のオーラの強さ（"strong"＝持っている間・落ちている間 / "rest"＝積んだあと / null＝なし）。
  // オーラの光は aura.js が、一度作った画像を貼るだけなので軽い。
  // emit が true なら、オーラの粒（光の粒・もや・キラッ）も出す（ゲーム画面だけ。写真・画像には出さない）
  function drawSprite(shape, x, y, angle, alpha, aura, emit) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (shape.flip) ctx.scale(-1, 1); // 左右反転（当たり判定の頂点も、同じ線で反転してある。shape.js の flipped）
    if (aura) Aura.drawBack(ctx, shape, aura);
    // 画像の左上は「重心から com だけ左上」にある
    ctx.drawImage(shape.img, -shape.com.x, -shape.com.y, shape.w, shape.h);
    ctx.restore();
    if (aura && emit) Aura.emit(shape, x, y, angle, aura, frameDt);
  }

  // デバッグ：当たり判定の線と重心を表示
  function drawDebug() {
    ctx.lineWidth = 1.5;
    for (const b of Composite.allBodies(engine.world)) {
      if (b.parent !== b) continue;
      // 複数のかけらでできたボディは parts[0] が全体（外枠）なので飛ばす
      const parts = b.parts.length > 1 ? b.parts.slice(1) : b.parts;
      ctx.strokeStyle = "#00ff66";
      for (const p of parts) strokePoly(p.vertices);
      dot(b.position.x, b.position.y);
    }
  }

  // デバッグ：持っているキャラの当たり判定も表示
  function drawHeldDebug(h, y) {
    ctx.save();
    ctx.translate(h.x, y);
    ctx.rotate(h.angle);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = h.shape.rough ? "#ff3333" : "#00ff66";
    for (const part of h.shape.parts) strokePoly(part);
    dot(0, 0);
    ctx.restore();
  }

  function strokePoly(verts) {
    ctx.beginPath();
    verts.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
    ctx.stroke();
  }

  function dot(x, y) {
    ctx.fillStyle = "#ff0066";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- タッチ操作 ----------
  // 画面のどこでも、指を左右に動かすとキャラが動く
  function setupInput() {
    let lastX = 0;
    let dragging = false;
    let moved = 0; // ドラッグした距離（タップとドラッグを区別するため）
    // フォトモード：画面にふれている指（id → 位置）と、2本指の間の距離
    const fingers = new Map();
    let pinchDist = 0;
    const fingerDist = () => {
      const [a, b] = [...fingers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // 自由配置モード（管理者モード）：タップした場所にキャラを置く・置いたキャラをドラッグで動かす
    const worldPoint = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / viewScale, y: camY + (e.clientY - r.top) / viewScale };
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (state === "sandbox") {
        canvas.setPointerCapture(e.pointerId);
        sandboxDown(worldPoint(e));
        return;
      }
      if (photo) {
        canvas.setPointerCapture(e.pointerId);
        fingers.set(e.pointerId, local(e));
        if (fingers.size === 2) pinchDist = fingerDist();
        return;
      }
      if (paused || state !== "aim" || !inputEnabled) return;
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (state === "sandbox") return sandboxMove(worldPoint(e));
      if (photo) {
        if (!fingers.has(e.pointerId)) return;
        const prev = fingers.get(e.pointerId);
        const now = local(e);
        fingers.set(e.pointerId, now);
        if (fingers.size === 1) photoPan(now.x - prev.x, now.y - prev.y);
        else if (fingers.size === 2) {
          // 2本指：つまんだ幅に合わせて拡大し、2本の指の真ん中の動きで移動する
          const d = fingerDist();
          const [a, b] = [...fingers.values()];
          photoPan((now.x - prev.x) / 2, (now.y - prev.y) / 2);
          if (pinchDist > 0) photoZoom(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
          pinchDist = d;
        }
        return;
      }
      if (!dragging || paused) return;
      const dx = (e.clientX - lastX) / viewScale;
      lastX = e.clientX;
      moved += Math.abs(dx);
      moveBy(dx);
    });
    canvas.addEventListener("pointerup", () => {
      if (state === "sandbox") return sandboxUp();
      if (!dragging) return;
      dragging = false;
      // 「指を離したら落とす」設定のときは、ドラッグのあとに指を離すと落とす
      if (callbacks.dropOnRelease && callbacks.dropOnRelease() && moved > 5) drop();
    });
    canvas.addEventListener("pointercancel", () => (dragging = false));
    const release = (e) => {
      fingers.delete(e.pointerId);
      pinchDist = fingers.size === 2 ? fingerDist() : 0;
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    // パソコン：マウスのホイールで拡大・縮小
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!photo) return;
        e.preventDefault();
        const p = local(e);
        photoZoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      { passive: false }
    );
  }

  function setDebug(on) {
    debug = on;
  }

  function setShapes(list) {
    shapes = list;
  }

  // 今のゲーム画面のキャンバス（タワーの画像は towerImage・photoImage で作る）
  function getCanvas() {
    return canvas;
  }

  return {
    init, start, stop, startDemo, flip, drawTest, startSandbox, sandbox: sandboxAPI, setTitleFx, towerImage, enterPhoto, exitPhoto, photoImage, setForcedShape, setDemoCeiling, setTheme, setHomeScene, startRemote, snapshot, applySnapshot, setHeldPose, heldPose, moveHeldTo, evaluatePlacement, candidateXs, setInputEnabled, pause, resume, setTurnTimeLimit, drop, rotate, nextPiece, setDebug, setShapes, getStats, getCanvas,
    get platformSize() { return platformSize; }, // 土台と柱の大きさ（プロフィールの見本の絵に使う）
    get state() { return state; },
    get rotations() { return rotations; }, // このゲームで回転を使った回数
    // 実績のための数：反転を使った回数・続けて反転を押した一番多い数・出たキャラの ID（最後の数体）・最後に落としたときの制限時間の残り
    get flips() { return flips; },
    get flipStreak() { return flipStreak; },
    get drawn() { return drawn.slice(); },
    get lastDropLeft() { return lastDropLeft; },
    get paused() { return paused; },
    get heldX() { return held ? held.x : WORLD_W / 2; }, // 持っているキャラの位置
    // ゲーム中（ポーズできる状態）か
    get playing() { return !!engine && ["aim", "falling", "settled"].includes(state); },
    // デバッグ用：ブラウザのコンソールから Game.debugInfo() で中身を確認できる
    debugInfo: () => ({
      state, camY, platformTop,
      demo: demo && { phase: demo.phase, count: demo.count, flying: demo.flying.length, planning: !!demo.plan },
      rule: rule && { id: rule.id, state: rule.state },
      platformAngle: platform ? platform.angle : 0,
      platformFriction: platform ? platform.friction : 0,
      held: held && { x: held.x, angle: held.angle, name: held.shape.name, flip: !!held.shape.flip },
      bodies: engine ? pieces().map((b) => ({ x: Math.round(b.position.x), y: Math.round(b.position.y), top: Math.round(b.bounds.min.y), speed: b.speed, angularSpeed: b.angularSpeed, name: b.shape.name, rough: b.shape.rough, flip: !!b.shape.flip })) : [],
      remote: remote ? [...remoteBodies.values()].map((r) => ({ name: r.shape.name, flip: !!r.shape.flip })) : [],
    }),
  };
})();
