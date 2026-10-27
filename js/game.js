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
    if (rule) {
      rule.state = {};
      if (rule.platformOptions) Body.set(platform, rule.platformOptions(rule.params));
      if (rule.start) rule.start(ruleAPI, rule.params, rule.state);
    }

    lastShape = null;
    nextPiece();
  }

  // ---------- 特殊ルールに渡す窓口 ----------
  // ルール（rules.js）からは、ここにあるものだけを使う
  const ruleAPI = {
    get simTime() { return simTime; },
    get worldW() { return WORLD_W; },
    get worldH() { return worldH; },
    random: () => ruleRandom(), // 0 以上 1 未満の乱数（Math.random の代わりに使う）
    Body,
    bodies: () => bodies(),
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
    rule = null;
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

  // config.js の sequence（ファイル名か id で指定）を、形データの並びに変換する
  // 見つからないキャラは飛ばす。sequence が空なら、ランダムに8体選ぶ
  function buildDemoSequence(list) {
    const seq = [];
    for (const item of list || []) {
      // ファイル名で書いたときは、その画像の元のキャラ（★4のオーラ版ではなく）
      const shape = item.id ? shapeById(item.id) : shapes.find((s) => s.file === item.file && !s.shared);
      if (shape) seq.push({ shape, x: item.x || 0, angle: ((item.angle || 0) * Math.PI) / 180 });
      else console.warn("デモのキャラが見つかりません:", item.id || item.file);
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
      // 地面まで落ちたキャラ：砂ぼこりと、画面の揺れ（1体につき1回）
      for (const b of pieces()) {
        if (!b.hitGround && b.bounds.max.y > groundY()) {
          b.hitGround = true;
          landImpact(b.position.x);
        }
      }
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
  // 管理者モード：次に出すキャラを決めておく（キャラの ID。null ならふつうにランダム）
  let forcedId = null;
  function setForcedShape(id) {
    forcedId = id;
  }

  function nextPiece() {
    const forced = forcedId && shapeById(forcedId);
    held = { shape: ruleShape(forced || randomShape()), x: WORLD_W / 2, angle: 0 };
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
    const open = shapes.filter((s) => LimitedEvents.available(s));
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

  // レア度の情報（config.js の rarity）。ノーマルや不明なら null
  function rareInfo(shape) {
    const id = shape && shape.rarity;
    if (!id || id === "N") return null;
    return (window.GAME_CONFIG.rarity || {})[id] || null;
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
    remote = true;
    remoteBodies = new Map();
    awaitingDrop = false;
    state = "remote";
  }

  // ID のキャラの形（知らない ID なら null。相手が新しいキャラのあるバージョンでも、落ちないように）
  const shapeById = (id) => shapes.find((s) => s.id === id) || null;
  const round = (v, k) => Math.round(v * k) / k;

  // ホスト：今の状態を書き出す（小さく送れるよう、数字の配列にする）
  function snapshot() {
    return {
      b: pieces().map((b) => [b.id, b.shape.id, round(b.position.x, 10), round(b.position.y - platformTop, 10), round(b.angle, 1000)]),
      h: held && state === "aim" ? [held.shape.id, round(held.x, 10), round(held.angle, 1000)] : null,
    };
  }

  // ゲスト：受け取った状態を反映する。myTurn: 自分（ゲスト）の手番か
  function applySnapshot(snap, myTurn) {
    if (!remote) return;
    const seen = new Set();
    let top = platformTop;
    for (const [id, charId, x, yRel, a] of snap.b) {
      const y = yRel + platformTop;
      let r = remoteBodies.get(id);
      if (!r) {
        const shape = shapeById(charId);
        if (!shape) continue; // 知らないキャラは描かない
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
    const [charId, x, angle] = snap.h;
    const shape = shapeById(charId);
    if (!shape) return; // 知らないキャラ
    if (myTurn) {
      // 自分の手番：最初の1回だけ受け取り、あとは自分の指で動かす
      if (!held || held.shape !== shape || state !== "aim") {
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
  function setHeldPose(x, angle) {
    if (!held) return;
    held.angle = angle;
    moveHeldTo(x);
  }

  // 持っているキャラの位置と角度（ゲストが相手に送るため）。持っていなければ null
  function heldPose() {
    return held && state === "aim" ? { x: held.x, angle: held.angle } : null;
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
  function evaluatePlacement(x, angle) {
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
    const saved = { x: held.x, angle: held.angle };
    held.angle = angle;
    moveHeldTo(x);
    const startX = held.x;
    const piece = Shape.spawnBody(held.shape, held.x, camY + holdY(), angle, pieceOptions());
    held.x = saved.x;
    held.angle = saved.angle;
    Composite.add(sim.world, piece);

    // 本物と同じ細かさで計算する（落下速度の上限・小さな揺れを弱める処理も同じ）
    const all = [piece, ...tower];
    let landed = false, still = 0;
    for (let i = 0; i < 300 && still < 15; i++) {
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
    if (remote) {
      // ゲスト：自分では落とさず、位置と角度をホストに送ってもらう（main.js 経由）
      if (callbacks.onRemoteDrop) callbacks.onRemoteDrop(held.x, held.angle);
      held = null;
      state = "remote";
      awaitingDrop = true;
      return true;
    }
    const body = Shape.spawnBody(held.shape, held.x, camY + holdY(), held.angle, pieceOptions());
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
    stepTitleFx(Math.min(time - lastTime, 100) / 1000);
    // オーラの粒を動かす（ポーズ中・フォトモード中は止める）
    frameDt = engine && !paused ? Math.min(time - lastTime, 100) / 1000 : 0;
    Aura.update(frameDt);
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
      reachHeight(getStats().height);
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
  // 「どこを写すか」を view で表す：{ left, top, w, h } … 写すゲーム内の範囲（左上と、幅・高さ）
  // ふだんはカメラの位置の、画面ちょうどの範囲。フォトモードでは指で動かした範囲
  let view = { left: 0, top: 0, w: WORLD_W, h: 800 };
  // フォトモードの状態 { view: 写している範囲 }。フォトモードでなければ null
  let photo = null;

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    if (photo) photo.view.h = photo.view.w * (canvas.height / canvas.width); // 画面の形が変わっても合わせる
    const v = photo ? photo.view : { left: 0, top: camY, w: WORLD_W, h: worldH };
    // タイトルのデモで塔が崩れたときの、画面の揺れ
    const s = photo ? null : shakeOffset();
    if (s) {
      v.left += s.x;
      v.top += s.y;
    }
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
    drawBackground();

    ctx.save();
    if (withUI && engine && state !== "demo") drawHeightMarks();
    drawPillar();
    drawPlatform();

    // 積まれたキャラ（レアキャラは、落ちている途中は強く、積んだあとは控えめにオーラを出す）
    if (withUI) Aura.drawSmoke(ctx); // 闇のオーラのもやは、キャラの後ろに
    if (engine) {
      for (const b of pieces()) {
        const falling = state !== "demo" && b === dropped && !b.landed;
        drawSprite(b.shape, b.position.x, b.position.y, b.angle, 1, falling ? "strong" : "rest", withUI);
      }
      // ゲスト：ホストから届いた位置のキャラ
      if (remote) for (const r of remoteBodies.values()) drawSprite(r.shape, r.x, r.y, r.angle, 1, "rest", withUI);
    }
    // 地面はキャラより手前に描く（落ちたキャラが地面の向こうに消えていくように）
    drawGround();
    if (withUI) drawDust();
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
      drawSprite(held.shape, held.x, y, held.angle, 1, "strong", true); // 持っている間は、オーラを強く
      if (debug) drawHeldDebug(held, y);
      drawTimer(held.x, y);
    }

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

  function setTheme(background, platformDef) {
    if (background) bgTheme = background;
    if (platformDef) platTheme = platformDef;
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
    if (sky.clouds > 0) {
      ctx.globalAlpha = Math.min(1, sky.clouds);
      drawClouds(k, sky.cloud);
      ctx.globalAlpha = 1;
    }
    if (!photo) drawBirds();
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

  // ---------- タイトル画面の演出（鳥・画面の揺れ・砂ぼこり） ----------
  // タイトル画面が出ているあいだだけ動かす（title-fx.js が setTitleFx でオン・オフする）。
  // 「視差効果を減らす」が ON の端末では出さない。数値は config.js の titleFx
  let titleFxOn = false;
  const birds = []; // { x, y（画面の割合）, vx, size, phase }
  const dusts = []; // 砂ぼこりの粒 { x, y, vx, vy, r, life }
  let nextBirdAt = 0; // 次に鳥が来る時刻（秒）
  let shake = { until: 0, time: 1, strength: 0 }; // 画面の揺れ
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
      dusts.length = 0;
      shake.until = 0;
    }
    nextBirdAt = fxNow() + between((FX.birds || {}).firstAfter, [2, 4]);
  }

  // 毎フレーム：鳥を飛ばす・砂ぼこりを動かす（dt：秒）
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
    for (let i = dusts.length - 1; i >= 0; i--) {
      const d = dusts[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 0.95;
      d.vy *= 0.95;
      d.r += dt * 26; // ふくらみながら
      d.life -= dt / ((FX.dust || {}).time || 1); // 消えていく
      if (d.life <= 0) dusts.splice(i, 1);
    }
  }

  // デモの塔が崩れて、キャラが地面に落ちた：砂ぼこりを出して、画面を揺らす
  function landImpact(x) {
    if (!titleFxOn) return;
    const conf = FX.dust || {};
    const n = conf.count || 12;
    for (let i = 0; i < n; i++) {
      // 地面から、もくもくと上に舞い上がる（地面のあたりはスタートボタンに隠れるので、高めに上げる）
      dusts.push({
        x: x + (Math.random() - 0.5) * 40,
        y: groundY() - 4,
        vx: (Math.random() - 0.5) * 140,
        vy: -50 - Math.random() * 110,
        r: 6 + Math.random() * 8,
        life: 1,
      });
    }
    const s = FX.shake || {};
    shake = { until: fxNow() + (s.time || 0.45), time: s.time || 0.45, strength: s.strength || 6 };
  }

  // 画面の揺れの、今のずれ（ゲーム内の単位）。だんだん弱くなる
  function shakeOffset() {
    const left = shake.until - fxNow();
    if (left <= 0) return null;
    const amp = shake.strength * (left / shake.time);
    return { x: (Math.random() - 0.5) * 2 * amp, y: (Math.random() - 0.5) * 2 * amp };
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

  // 砂ぼこり（選んだ背景の地面の色を明るくした、ふわっと広がる丸）
  function drawDust() {
    if (!dusts.length) return;
    ctx.fillStyle = mix(bgTheme.groundDark || "#5fa845", "#efe3c8", 0.75);
    for (const d of dusts) {
      ctx.globalAlpha = Math.max(0, d.life) * 0.7;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
    ctx.fillStyle = platTheme.pillar;
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
    ctx.fillStyle = platTheme.body;
    ctx.fillRect(-PLATFORM_W / 2, -PLATFORM_H / 2, PLATFORM_W, PLATFORM_H);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(-PLATFORM_W / 2, PLATFORM_H / 2 - 8, PLATFORM_W, 8);
    ctx.fillStyle = platTheme.top; // 上の面（木の台なら芝生）
    ctx.fillRect(-PLATFORM_W / 2, -PLATFORM_H / 2, PLATFORM_W, 8);
    ctx.restore();
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
  // aura：レア度のオーラの強さ（"strong"＝持っている間・落ちている間 / "rest"＝積んだあと / null＝なし）。
  // オーラの光は aura.js が、一度作った画像を貼るだけなので軽い。
  // emit が true なら、オーラの粒（光の粒・もや・キラッ）も出す（ゲーム画面だけ。写真・画像には出さない）
  function drawSprite(shape, x, y, angle, alpha, aura, emit) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
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

    canvas.addEventListener("pointerdown", (e) => {
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
    init, start, stop, startDemo, setTitleFx, towerImage, enterPhoto, exitPhoto, photoImage, setForcedShape, setDemoCeiling, setTheme, startRemote, snapshot, applySnapshot, setHeldPose, heldPose, moveHeldTo, evaluatePlacement, candidateXs, setInputEnabled, pause, resume, setTurnTimeLimit, drop, rotate, nextPiece, setDebug, setShapes, getStats, getCanvas,
    get state() { return state; },
    get paused() { return paused; },
    get heldX() { return held ? held.x : WORLD_W / 2; }, // 持っているキャラの位置
    // ゲーム中（ポーズできる状態）か
    get playing() { return !!engine && ["aim", "falling", "settled"].includes(state); },
    // デバッグ用：ブラウザのコンソールから Game.debugInfo() で中身を確認できる
    debugInfo: () => ({
      state, camY, platformTop,
      demo: demo && { phase: demo.phase, count: demo.count, settling: !!demo.current },
      rule: rule && { id: rule.id, state: rule.state },
      platformAngle: platform ? platform.angle : 0,
      platformFriction: platform ? platform.friction : 0,
      held: held && { x: held.x, angle: held.angle, name: held.shape.name },
      bodies: engine ? pieces().map((b) => ({ x: Math.round(b.position.x), y: Math.round(b.position.y), top: Math.round(b.bounds.min.y), speed: b.speed, angularSpeed: b.angularSpeed, name: b.shape.name, rough: b.shape.rough })) : [],
    }),
  };
})();
