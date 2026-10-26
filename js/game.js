// =============================================
// game.js
// ゲーム本体：物理演算・描画・タッチ操作
// =============================================

const Game = (() => {
  const { Engine, Composite, Bodies, Body, Events } = Matter;

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
    friction: 0.9, // 滑りにくさ
    frictionStatic: 1.2, // 止まっているときの滑りにくさ
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

  let lastTime = 0;
  let acc = 0;

  // タイトル画面のデモの状態（デモ中でなければ null）
  let demo = null;

  // 空に浮かぶ雲 { x, y, scale, speed }。x, y は画面の割合（0〜1）
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random(),
      y: 0.06 + i * 0.12 + Math.random() * 0.05,
      scale: 0.7 + Math.random() * 0.6,
      speed: 0.004 + Math.random() * 0.008, // 1秒に画面の何割進むか
    });
  }

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
      friction: 1,
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
    simTime = 0;
    paused = false;
    dropped = null;
    held = null;
  }

  // ---------- ゲーム開始 ----------
  // cb: 出来事を main.js に知らせる関数たち
  //   { onDrop, onLand, onSettled(stats), onFall, onGameOver(stats), dropOnRelease() }
  // opts: { turnTimeLimit: 1手の制限時間（秒）。0 なら制限なし }
  function start(cb, opts) {
    callbacks = cb || {};
    demo = null;
    createWorld(PLATFORM_FROM_BOTTOM);
    setTurnTimeLimit(opts && opts.turnTimeLimit);

    lastShape = null;
    nextPiece();
  }

  // ゲームをやめる（タイトルに戻るとき）
  function stop() {
    engine = null;
    held = null;
    demo = null;
    state = "idle";
    paused = false;
    platformTop = worldH - DEMO_PLATFORM_FROM_BOTTOM;
  }

  // ---------- タイトル画面のデモ ----------
  // config.js の sequence の順番どおりにキャラを落として積む。
  // 1体落とすごとに、止まるのを待ってからその場で固定する → いつも同じ形に安定して積み上がる。
  // 全部積んだら固定を外し、土台を傾けて崩す → 最初からくり返し
  // opts: { interval: 止まってから次が落ちてくるまでの時間（秒）, sequence: [{ file, x, angle }, ...] }

  // 「止まった」とみなすまでに、止まっている必要があるステップ数（60ステップ＝1秒）
  const DEMO_SETTLE_STEPS = 20;
  // これだけ待っても止まらなければ、あきらめて次へ（ミリ秒）
  const DEMO_SETTLE_TIMEOUT = 6000;
  // キャラを落とし始める高さ（塔のてっぺんから、これだけ上）。
  // 画面の高さに関係なく落下距離が同じになるので、どの端末でも同じ形に積み上がる。
  // スマホの縦画面なら、この高さは画面の上の外になる
  const DEMO_DROP_HEIGHT = 800;
  // 塔のてっぺんが、画面の上からこの割合より上まで来たら、残りは落とさずに崩す
  //（小さい画面で、タイトルロゴに塔が重ならないように）
  const DEMO_TOP_LIMIT = 0.38;

  function startDemo(opts) {
    if (!shapes.length) return;
    callbacks = {};
    createWorld(DEMO_PLATFORM_FROM_BOTTOM);
    state = "demo";
    demo = {
      interval: opts.interval * 1000,
      sequence: buildDemoSequence(opts.sequence),
      phase: "stack", // "stack"=積んでいる / "collapse"=崩れている
      phaseAt: 0, // 今の段階になった時刻
      nextAt: 600, // 次のキャラを落とす時刻
      count: 0, // 何体落としたか
      current: null, // いま落ちている（まだ固定していない）キャラ
      spawnedAt: 0,
      stillSteps: 0,
      frozen: false, // 止まった絵にしているか（視差効果を減らす設定のとき）
      dropOffset: opts.dropOffset || 0, // 確認用：落とし始める高さを少しずらす（安定するか調べるため）
    };
    if (reducedMotion.matches) {
      // 動きを控えめにする設定なら、裏で一気に全部積んでおいて、あとは動かさない
      while (demoHasRoom()) {
        spawnDemoPiece();
        while (demo.current) {
          physicsStep();
          checkDemoPieceSettled();
        }
      }
      demo.frozen = true;
    }
  }

  // config.js の sequence（ファイル名で指定）を、形データの並びに変換する
  // 見つからないキャラは飛ばす。sequence が空なら、ランダムに8体選ぶ
  function buildDemoSequence(list) {
    const seq = [];
    for (const item of list || []) {
      const shape = shapes.find((s) => s.file === item.file);
      if (shape) seq.push({ shape, x: item.x || 0, angle: ((item.angle || 0) * Math.PI) / 180 });
      else console.warn("デモのキャラが見つかりません:", item.file);
    }
    if (!seq.length) {
      for (let i = 0; i < 8; i++) seq.push({ shape: randomShape(), x: 0, angle: Math.PI / 2 });
    }
    return seq;
  }

  // デモ用：順番どおりに、次のキャラを落とす
  function spawnDemoPiece() {
    const item = demo.sequence[demo.count];
    const y = demoTowerTop() - DEMO_DROP_HEIGHT + (demo.dropOffset || 0);
    const body = Shape.spawnBody(item.shape, WORLD_W / 2 + item.x, y, item.angle, BODY_OPTIONS);
    Composite.add(engine.world, body);
    demo.current = body;
    demo.spawnedAt = simTime;
    demo.stillSteps = 0;
    demo.count++;
  }

  // 固定ずみのキャラも含めた、塔のてっぺんの y 座標
  function demoTowerTop() {
    let top = platformTop;
    for (const b of pieces()) top = Math.min(top, b.bounds.min.y);
    return top;
  }

  // 次のキャラを落としてよいか（まだ順番が残っていて、塔が高くなりすぎていない）
  function demoHasRoom() {
    // 画面の上から DEMO_TOP_LIMIT の位置か、タイトルの文字の下端（setDemoCeiling）の、低い方まで
    const ceiling = Math.max(worldH * DEMO_TOP_LIMIT, demoCeilingPx / viewScale + 10);
    return demo.count < demo.sequence.length && demoTowerTop() > ceiling;
  }

  // デモの塔がこれより上に伸びないようにする（画面の上からの px）。
  // タイトル画面のハイスコア表示などに塔が重ならないよう、main.js から教えてもらう
  let demoCeilingPx = 0;
  function setDemoCeiling(px) {
    demoCeilingPx = px;
  }

  // 落としたキャラが止まったら、その場で固定する（台から落ちていたら片付ける）
  function checkDemoPieceSettled() {
    const b = demo.current;
    const still = b.landed && b.speed < 0.05 && b.angularSpeed < 0.002;
    demo.stillSteps = still ? demo.stillSteps + 1 : 0;
    if (demo.stillSteps < DEMO_SETTLE_STEPS && simTime - demo.spawnedAt < DEMO_SETTLE_TIMEOUT) return;
    if (b.bounds.min.y > platformTop) Composite.remove(engine.world, b);
    else Body.setStatic(b, true);
    demo.current = null;
    demo.nextAt = simTime + demo.interval;
  }

  // デモの進行（物理演算の1ステップごとに呼ばれる）
  function stepDemo() {
    if (!demo || demo.frozen) return;
    if (demo.phase === "stack") {
      if (demo.current) return checkDemoPieceSettled();
      if (simTime < demo.nextAt) return;
      if (demoHasRoom()) {
        spawnDemoPiece();
      } else {
        // 積み終わったら、固定を外して、土台をぐらっと傾けて崩す
        for (const b of pieces()) Body.setStatic(b, false);
        demo.phase = "collapse";
        demo.phaseAt = simTime;
      }
    } else {
      const t = (simTime - demo.phaseAt) / 1000;
      // 最初の0.5秒は左右に揺らし、そのあと一方に傾ける
      const angle = t < 0.5 ? Math.sin(t * 40) * 0.03 : Math.min(0.5, (t - 0.5) * 0.5);
      Body.setAngle(platform, angle);
      // 3.5秒たったら、残っているキャラを片付けて最初から
      if (t > 3.5) {
        for (const b of pieces()) Composite.remove(engine.world, b);
        Body.setAngle(platform, 0);
        demo.phase = "stack";
        demo.count = 0;
        demo.nextAt = simTime + 400;
      }
    }
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
  function nextPiece() {
    held = { shape: randomShape(), x: WORLD_W / 2, angle: 0 };
    clampHeld();
    state = "aim";
    aimStartAt = simTime;
  }

  // キャラをランダムに選ぶ（同じキャラが2回続かないように）
  function randomShape() {
    let shape;
    do {
      shape = shapes[Math.floor(Math.random() * shapes.length)];
    } while (shapes.length > 1 && shape === lastShape);
    lastShape = shape;
    return shape;
  }

  // 制限時間の残り（ミリ秒）。制限なしのときは null
  function timeLeft() {
    if (!turnLimit || state !== "aim") return null;
    return Math.max(0, turnLimit - (simTime - aimStartAt));
  }

  // ---------- 操作 ----------
  function rotate() {
    if (paused || state !== "aim" || !held) return;
    held.angle += Math.PI / 4; // 45度
    clampHeld();
  }

  function moveBy(dx) {
    if (!held) return;
    held.x += dx;
    clampHeld();
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
    const body = Shape.spawnBody(held.shape, held.x, camY + HOLD_Y, held.angle, BODY_OPTIONS);
    Composite.add(engine.world, body);
    dropped = body;
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
    if (engine && !paused) {
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
      // カメラをなめらかに目標へ近づける
      camY += (camTargetY - camY) * 0.08;
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
  function checkTurnTimer() {
    if (timeLeft() === 0) drop();
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
      if (callbacks.onSettled) callbacks.onSettled(getStats());
      else nextPiece();
    }
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
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    // ゲーム座標で描けるように、拡大率をセットする
    ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
    drawBackground();

    // ここから先はカメラの位置に合わせてずらして描く
    ctx.save();
    ctx.translate(0, -camY);

    if (engine && state !== "demo") drawHeightMarks();
    drawPillar();
    drawPlatform();

    // 積まれたキャラ
    if (engine) {
      for (const b of pieces()) drawSprite(b.shape, b.position.x, b.position.y, b.angle, 1);
    }
    // 地面はキャラより手前に描く（落ちたキャラが地面の向こうに消えていくように）
    drawGround();
    if (!engine) {
      ctx.restore();
      return;
    }

    // 持っているキャラ（と、落ちる位置のガイド線）
    if (held && state === "aim") {
      const y = camY + HOLD_Y;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(held.x, y);
      ctx.lineTo(held.x, platformTop);
      ctx.stroke();
      ctx.setLineDash([]);
      drawSprite(held.shape, held.x, y, held.angle, 1);
      if (debug) drawHeldDebug(held, y);
      drawTimer(held.x, y);
    }

    if (debug) drawDebug();
    ctx.restore();
  }

  // 空のグラデーション（高く登るほど濃い青に）
  function drawBackground() {
    const t = Math.min(1, -camY / 3000);
    const g = ctx.createLinearGradient(0, 0, 0, worldH);
    g.addColorStop(0, mix("#7ec8f0", "#1d2b64", t));
    g.addColorStop(1, mix("#d8f0ff", "#4a6fb5", t));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, worldH);
    drawClouds();
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

  function drawClouds() {
    ctx.fillStyle = "#f4faff";
    for (const c of clouds) {
      // カメラが上に行くと、雲は少しだけ下に流れる（遠くにある感じを出す）
      const x = c.x * WORLD_W;
      const y = c.y * worldH - camY * 0.15;
      const s = c.scale;
      for (const [dx, dy, rx, ry] of CLOUD_PUFFS) {
        ctx.beginPath(); // 1つずつ塗る（まとめて塗ると、重なった部分が抜けてしまう）
        ctx.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- 地面・柱・土台 ----------
  function groundY() {
    return platformTop + GROUND_BELOW_PLATFORM;
  }

  // 土台を支える石の柱
  function drawPillar() {
    const w = 70;
    const x = WORLD_W / 2 - w / 2;
    const top = platformTop + PLATFORM_H;
    ctx.fillStyle = "#a39587";
    ctx.fillRect(x, top, w, groundY() - top + 10);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; // 右側に影
    ctx.fillRect(x + w - 16, top, 16, groundY() - top + 10);
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; // 石の継ぎ目
    ctx.lineWidth = 2;
    for (let y = top + 30; y < groundY(); y += 30) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    }
  }

  // 土台（デモで傾いているときも、その角度で描く）
  function drawPlatform() {
    const x = platform && engine ? platform.position.x : WORLD_W / 2;
    const y = platform && engine ? platform.position.y : platformTop + PLATFORM_H / 2;
    const angle = platform && engine ? platform.angle : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "#8a5a3b";
    ctx.fillRect(-PLATFORM_W / 2, -PLATFORM_H / 2, PLATFORM_W, PLATFORM_H);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(-PLATFORM_W / 2, PLATFORM_H / 2 - 8, PLATFORM_W, 8);
    ctx.fillStyle = "#6fbf4a"; // 上の芝生
    ctx.fillRect(-PLATFORM_W / 2, -PLATFORM_H / 2, PLATFORM_W, 8);
    ctx.restore();
  }

  // 地面（なだらかな丘）
  function drawGround() {
    const top = groundY();
    ctx.fillStyle = "#7cc35a";
    ctx.beginPath();
    ctx.moveTo(-10, top + 14);
    ctx.quadraticCurveTo(WORLD_W * 0.25, top - 10, WORLD_W / 2, top);
    ctx.quadraticCurveTo(WORLD_W * 0.75, top + 10, WORLD_W + 10, top - 6);
    ctx.lineTo(WORLD_W + 10, top + 3000);
    ctx.lineTo(-10, top + 3000);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#5fa845"; // 少し下に濃い色の帯
    ctx.fillRect(-10, top + 40, WORLD_W + 20, 3000);
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
      if (y < camY + 90) break; // 画面の上の方はスコア表示と重なるので描かない
      if (y > camY + worldH) continue;
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
    const ratio = left / turnLimit;
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

  // 画像を、重心 (x, y) を中心に angle だけ回して描く
  function drawSprite(shape, x, y, angle, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    // 画像の左上は「重心から com だけ左上」にある
    ctx.drawImage(shape.img, -shape.com.x, -shape.com.y, shape.w, shape.h);
    ctx.restore();
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

    canvas.addEventListener("pointerdown", (e) => {
      if (paused || state !== "aim") return;
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging || paused) return;
      const dx = (e.clientX - lastX) / viewScale;
      lastX = e.clientX;
      moved += Math.abs(dx);
      moveBy(dx);
    });
    canvas.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      // 「指を離したら落とす」設定のときは、ドラッグのあとに指を離すと落とす
      if (callbacks.dropOnRelease && callbacks.dropOnRelease() && moved > 5) drop();
    });
    canvas.addEventListener("pointercancel", () => (dragging = false));
  }

  function setDebug(on) {
    debug = on;
  }

  function setShapes(list) {
    shapes = list;
  }

  // 今のゲーム画面のキャンバス（将来、SNS共有でタワーの画像を作るときに使う予定）
  function getCanvas() {
    return canvas;
  }

  return {
    init, start, stop, startDemo, setDemoCeiling, pause, resume, setTurnTimeLimit, drop, rotate, nextPiece, setDebug, setShapes, getStats, getCanvas,
    get state() { return state; },
    get paused() { return paused; },
    // ゲーム中（ポーズできる状態）か
    get playing() { return !!engine && ["aim", "falling", "settled"].includes(state); },
    // デバッグ用：ブラウザのコンソールから Game.debugInfo() で中身を確認できる
    debugInfo: () => ({
      state, camY, platformTop,
      demo: demo && { phase: demo.phase, count: demo.count, settling: !!demo.current },
      held: held && { x: held.x, angle: held.angle, name: held.shape.name },
      bodies: engine ? pieces().map((b) => ({ x: Math.round(b.position.x), y: Math.round(b.position.y), top: Math.round(b.bounds.min.y), speed: b.speed, angularSpeed: b.angularSpeed, name: b.shape.name, rough: b.shape.rough })) : [],
    }),
  };
})();
