// =============================================
// main.js
// 起動処理・画面の流れ・モード（1人／2人）のルール
//
// 画面の流れ：
//   タイトル → モード選択 → ゲーム → リザルト
//                             ↕
//                           ポーズ  ← アプリを切りかえたときも自動でポーズ
//   設定画面は、タイトルとポーズから開ける（「もどる」で開いた画面に戻る）
// =============================================

(async () => {
  const DEFAULT_SIZE = 130; // characters.js で size を省略したときの大きさ
  const CONFIG = window.GAME_CONFIG;
  const $ = (id) => document.getElementById(id);

  // ---------- ゲームの進行状況 ----------
  let mode = "solo"; // "solo"=ひとりで（スコアアタック・特殊ルール） / "versus"=2人対戦
  let ruleId = null; // 特殊ルールの名前（ふつうのルールなら null）
  let comp = false; // 競技モードか（1人モードの、特殊ルールでないときだけ。config.js の competitive）
  let cpuLevel = null; // CPU対戦の強さ（"easy" / "normal" / "hard"）。人どうしなら null
  // オンライン対戦の情報。{ role: "host"|"guest", me: 自分のプレイヤー番号, names: { 1: 名前, 2: 名前 } }
  // オンライン対戦をしていなければ null
  let online = null;
  let gameToken = 0; // ゲームごとに変わる番号（前のゲームの CPU の処理を止めるため）
  let player = 1; // 2人対戦で、いま操作している人（1 か 2）
  let lastDropper = 1; // 最後にキャラを落とした人
  let stacked = 0; // 積むのに成功した数
  let maxHeight = 0; // いちばん高く積めた高さ（m）
  let droppedShape = null; // 最後に落としたキャラ
  // 1回のゲームの中の記録（実績「早業」「崖っぷち」の判定に使う）
  let aimTimes = []; // 1手ごとの、キャラが出てから落とすまでの時間（ミリ秒）
  let lastEdge = null; // 最後に積んだキャラが、土台の端からどれだけの所に着地したか（土台の幅に対する割合。null なら土台に乗っていない）
  let settingsReturnTo = "title"; // 設定画面を閉じたときに戻る画面
  let shapesReady = false; // キャラの読み込みが終わったか

  // 最後のゲームの結果（リザルトカード・挑戦状で使う）
  let lastResult = null;
  // キャラの出る順番を決める番号（ゲームごとに変わる。挑戦状に入れて、相手も同じ順番にする）
  let seed = 0;
  // 受け取った挑戦状 { seed, rule, score, name }。挑戦中でなければ null
  let challenge = null;

  // ---------- 音 ----------
  // 最初に画面をさわったときに、音を使えるようにする（スマホのブラウザの制限への対策）
  const unlockOnce = () => Sound.unlock();
  window.addEventListener("pointerdown", unlockOnce, { capture: true });
  window.addEventListener("touchend", unlockOnce, { capture: true });

  // メニューのボタンを押したら「プッ」と鳴らす
  document.addEventListener("click", (e) => {
    if (e.target.closest(".screen .btn, .menu-icon, .profile-chip, .dialog .btn")) Sound.play("click");
  });

  // ---------- 設定 ----------
  // 設定の値を、音やゲームに反映する
  function applySettings() {
    Sound.setBgmEnabled(Settings.get("bgm"));
    Sound.setSeEnabled(Settings.get("se"));
    // 当たり判定の表示は開発用。公開版（devMode: false）では、設定に関係なく常にOFF
    Game.setDebug((CONFIG.devMode || Admin.unlocked) && Settings.get("debug"));
    // 管理者モード：イベント期間中として表示（確認用）
    LimitedEvents.setPreview((CONFIG.devMode || Admin.unlocked) && Settings.get("eventPreview"));
    Admin.applyDisplay(); // 管理者モード：FPS・キャラの数と高さ・読み込み状況の表示
    if (Game.playing && !isCpuTurn()) Game.setTurnTimeLimit(turnTimeLimit());
  }

  // 1手の制限時間（秒）。ともだちと対戦（config.js の versus.turnTimeLimit）・オンライン対戦（online.turnTime）は、いつも制限時間あり。
  // CPU対戦・ひとりモードは制限なし
  function turnTimeLimit() {
    if (mode === "online") return Number(CONFIG.online.turnTime) || 0;
    if (mode === "versus" && !cpuLevel) return Number((CONFIG.versus || {}).turnTimeLimit) || 0;
    return 0;
  }

  // 設定画面のスイッチ（data-setting="bgm" などの名前で、どの設定か分かる）
  const toggles = document.querySelectorAll(".toggle[data-setting]");
  function updateToggles() {
    for (const t of toggles) t.setAttribute("aria-checked", String(Settings.get(t.dataset.setting)));
    const vs = Number((CONFIG.versus || {}).turnTimeLimit) || 0;
    const on = Number(CONFIG.online.turnTime) || 0;
    $("setting-time-note").textContent =
      `ともだちと・オンライン対戦は、いつも制限時間あり（1手 ${vs === on ? `${vs}秒` : `ともだちと ${vs}秒・オンライン ${on}秒`}。時間切れになると、その場で自動で落ちる）。CPU対戦・ひとりで遊ぶときは、制限時間なし`;
    Ranking.renderConsent();
    // data-needs="ranking" の行（プロフィールを公開・写真アイコン）は、ランキングに参加しているときだけ選べる
    for (const row of document.querySelectorAll(".setting-row[data-needs]")) {
      const off = !Settings.get(row.dataset.needs);
      row.classList.toggle("disabled", off);
      row.querySelector(".toggle").disabled = off;
    }
  }
  // スイッチの行は、行のどこを押しても切りかわる（小さなスイッチをねらって押さなくてよいように）
  for (const t of toggles) {
    const row = t.closest(".setting-row");
    row.classList.add("setting-tap");
    row.addEventListener("click", (e) => {
      if (e.target !== t && !t.disabled) t.click();
    });
  }
  for (const t of toggles) {
    t.addEventListener("click", () => {
      const name = t.dataset.setting;
      Settings.set(name, !Settings.get(name));
      updateToggles();
      applySettings();
      // ランキングに参加した・写真アイコンを載せる／外した・プロフィールを公開する／やめたら、今のハイスコアとプロフィールを送る
      if (name === "ranking" || name === "rankingIcon" || name === "rankingProfile") Ranking.submitBest();
      Sound.play("click");
    });
  }

  function openSettings(from) {
    settingsReturnTo = from;
    UI.show("settings");
  }
  UI.onShow("settings", updateToggles); // 設定画面が開いたら、スイッチを今の設定に合わせる

  // ---------- 各画面へ ----------
  function goTitle() {
    gameToken++; // CPU が考え中なら、やめさせる
    challenge = null; // タイトルに戻ったら、挑戦状はおしまい
    showThinking(false);
    if (online) leaveOnline(); // オンライン対戦中なら、接続を切る
    VsIntro.cancel();
    if (mode === "online") mode = "solo";
    Game.stop();
    UI.clearConfetti();
    Stamps.end();
    $("turn-banner").className = "hidden";
    $("rare-banner").className = "hidden"; // ゲーム中に出た「レア！」が残らないように
    updateBestCard();
    UI.show("title");
    UI.replayAnimations("title");
    updateDemoCeiling();
    // 背景でデモを流す（キャラの読み込みが終わっていなければ、終わったときに始める）
    if (shapesReady) Game.startDemo(CONFIG.titleDemo);
    Sound.startBgm();
  }

  // デモの塔が、ハイスコアの表示より上に伸びないようにする
  function updateDemoCeiling() {
    const card = $("best-score").getBoundingClientRect();
    const app = $("app").getBoundingClientRect();
    Game.setDemoCeiling(card.bottom - app.top);
  }
  window.addEventListener("resize", updateDemoCeiling);

  function updateBestCard() {
    const best = Save.data.stats.best;
    $("best-score").innerHTML = best
      ? `ハイスコア<b>${best.score}</b>${best.count}体・${best.height.toFixed(2)}m`
      : `ハイスコア<b>---</b>まだ記録がありません`;
  }

  function pauseGame() {
    if (mode === "online") return; // オンライン対戦は相手がいるので止められない
    if (!Game.playing || Game.paused) return;
    Game.pause();
    UI.show("pause");
  }

  function resumeGame() {
    Game.resume();
    UI.show(null);
  }

  // アプリを切りかえたり、画面を消したりしたら自動でポーズ
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && UI.current === null) pauseGame();
  });
  window.addEventListener("pagehide", () => {
    if (UI.current === null) pauseGame();
  });
  // 横向きのスマホ（高さが低く、指で操作する画面）では「縦向きにすると遊べます」を出すので、ゲーム中ならポーズする
  const landscapePhone = window.matchMedia("(orientation: landscape) and (max-height: 500px) and (pointer: coarse)");
  landscapePhone.addEventListener("change", (e) => {
    if (e.matches && UI.current === null) pauseGame();
  });

  // ---------- ゲーム開始 ----------
  // newRuleId: 特殊ルールの名前（config.js の rules の名前）。ふつうのルールなら null
  // newCpu: CPU対戦の強さ。人どうしの対戦や1人モードなら null
  // first: 先攻（1 か 2）。オンライン対戦のホストが、演出の前に決めておいた先攻。null なら、ここでランダムに決める
  // newComp: 競技モードか（1人モードのときだけ）
  function startGame(newMode, newRuleId = null, newCpu = null, first = null, newComp = false) {
    mode = newMode;
    ruleId = newRuleId;
    comp = newMode === "solo" && !newRuleId && !!newComp;
    cpuLevel = newCpu;
    gameToken++;
    showThinking(false);
    Game.setInputEnabled(true);
    // 対戦の先攻は毎回ランダム（1人モードはいつもプレイヤー1）
    player = isVs() ? first || randomFirst() : 1;
    lastDropper = player;
    stacked = 0;
    maxHeight = 0;
    droppedShape = null;
    aimTimes = [];
    lastEdge = null;
    resetAchievementCounts();
    // 挑戦中は挑戦状と同じ順番、そうでなければ新しい順番
    seed = challenge && mode === "solo" && ruleId === challenge.rule && comp === !!challenge.comp ? challenge.seed : Challenge.newSeed();
    UI.clearConfetti();
    Stamps.end(); // スタンプはリザルトのあいだだけ
    UI.show(null);
    Game.start(
      {
        dropOnRelease: () => Settings.get("release"),
        onDrop: (shape) => {
          lastDropper = player;
          droppedShape = shape; // 積めたら図鑑に登録するため、覚えておく
          updateHud();
        },
        onLand: () => playSe("place"),
        onRare: (shape, info) => {
          if (!comp) showRareBanner(shape, info); // 競技：「レア！」・画面が光る演出・効果音は出さない（全キャラ同じ見た目）
          // 自分の番に出たレアを数える（CPU・オンライン対戦の相手の番、競技はのぞく）
          if (!comp && !isCpuTurn() && !(mode === "online" && player !== myPlayer())) {
            Records.addDrawn(shape);
            Achievements.check(gameStatus());
          }
          if (mode === "online") Online.send({ t: "rare", id: shape.id });
        },
        onSettled: onSettled,
        onSkyStage: showSkyStage,
        onFall: () => playSe("fall"),
        onGameOver: showResult,
      },
      // 制限時間はオンライン対戦だけ（ホストが数えて、時間切れなら相手の手番でもホストが落とす）
      { turnTimeLimit: turnTimeLimit(), rule: Rules.get(ruleId), seed, fair: mode === "online", competitive: comp ? CONFIG.competitive : null }
    );
    applySettings();
    Sound.startBgm();
    updateHud();
    if (isVs()) showTurnBanner(true);
    if (isCpuTurn()) runCpuTurn(); // CPU が先攻
  }

  // 先攻を決める（1 か 2）
  function randomFirst() {
    return Math.random() < 0.5 ? 1 : 2;
  }

  // 対戦か（ともだちと・CPUと・オンライン）
  function isVs() {
    return mode === "versus" || mode === "online";
  }

  // 効果音を鳴らす（オンライン対戦のホストなら、相手にも鳴らしてもらう）
  function playSe(name) {
    Sound.play(name);
    if (mode === "online") Online.send({ t: "se", name });
  }

  // 全員が止まった ＝ 1手成功
  function onSettled(stats) {
    stacked++;
    maxHeight = Math.max(maxHeight, stats.height);
    countForAchievements(droppedShape, stats.height, lastDropper === myPlayer());
    aimTimes.push(stats.aimMs);
    lastEdge = stats.edge;
    Records.addPiece(droppedShape, comp);
    if (droppedShape && !comp) Dex.register(droppedShape.id); // 競技で積んだキャラは、図鑑に登録しない
    Achievements.check(gameStatus()); // 「10体積んだ」などの実績を、ゲーム中に判定する
    if (isVs()) {
      player = player === 1 ? 2 : 1; // 手番を交代
      showTurnBanner();
    }
    // オンライン対戦（ホスト）：相手に手番の交代を知らせる
    if (mode === "online") {
      sendImportant({ t: "turn", g: online.gameNo, p: player, n: stacked, h: maxHeight, id: droppedShape ? droppedShape.id : null });
    }
    Game.nextPiece();
    updateHud();
    if (isCpuTurn()) runCpuTurn();
    else if (cpuLevel) startHumanTurn();
    else if (mode === "online") Game.setInputEnabled(!isRemoteTurn()); // 相手の手番は操作できない
  }

  // ---------- 実績のための数（このゲームの分） ----------
  // 反転して積んだ数・ビッグを積んでからの数・積んだときの高さ・制限時間ギリギリ（残りミリ秒）・積んだキャラの ID
  let achieve = null;
  function resetAchievementCounts() {
    achieve = { flipPlaced: 0, bigAt: null, heights: [], buzzer: null, over: false, ownCount: 0, placedIds: [], placedCounts: {} };
  }
  resetAchievementCounts();

  // 自分の番号（オンライン対戦は自分の側、ほかは 1。CPU は 2）
  function myPlayer() {
    return mode === "online" && online ? online.me : 1;
  }

  // 1体積めたとき。mine：自分が落としたキャラか（オンライン対戦の相手・CPU の分は、ギリギリの判定に使わない）
  function countForAchievements(shape, height, mine) {
    if (mine) achieve.ownCount++; // 自分が積んだ数（実績「50体積み」。対戦の相手・CPU の分は数えない）
    if (shape && shape.flip) achieve.flipPlaced++;
    if (shape && !achieve.placedIds.includes(shape.id)) achieve.placedIds.push(shape.id); // 実績「VIVANT」など（同じタワーに積んだ組み合わせ）
    if (shape) achieve.placedCounts[shape.id] = (achieve.placedCounts[shape.id] || 0) + 1; // 実績「量産型」（同じキャラを何体積んだか）
    if (shape && shape.variant === "big" && achieve.bigAt === null) achieve.bigAt = stacked;
    achieve.heights.push(height);
    if (achieve.heights.length > 4) achieve.heights.shift();
    const left = Game.lastDropLeft;
    if (mode === "online" && mine && typeof left === "number" && left > 0) achieve.buzzer = Math.min(achieve.buzzer ?? Infinity, left);
  }

  // ---------- CPU対戦 ----------
  function isCpuTurn() {
    return mode === "versus" && !!cpuLevel && player === 2;
  }

  // プレイヤーの名前（CPU対戦のプレイヤー2は「CPU（ふつう）」など。オンライン対戦は相手の名前）
  function nameOf(n) {
    if (mode === "online" && online) return online.names[n] || `プレイヤー${n}`;
    if (n === 2 && cpuLevel) return `CPU（${CONFIG.cpu[cpuLevel].name}）`;
    return Save.playerName(n);
  }

  // 人の手番：操作を受け付け、制限時間を戻す
  function startHumanTurn() {
    Game.setInputEnabled(true);
    Game.setTurnTimeLimit(turnTimeLimit());
  }

  // ms ミリ秒待つ。ポーズ中は時間を進めない。ゲームが変わったら false を返して終わる
  async function waitPlaying(ms, token) {
    let left = ms;
    while (left > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (token !== gameToken || !Game.playing) return false;
      if (!Game.paused) left -= 50;
    }
    return true;
  }

  // CPU の手番：考える → 回す → 位置まで動かす → 少し待つ → 落とす
  async function runCpuTurn() {
    const token = gameToken;
    Game.setInputEnabled(false); // 人の操作は受け付けない
    Game.setTurnTimeLimit(0); // CPU には制限時間なし
    if (!(await waitPlaying(900, token))) return; // 「〇〇の番」の表示が終わるのを待つ
    showThinking(true);
    const plan = await CPU.think(cpuLevel, () => token !== gameToken || !Game.playing);
    showThinking(false);
    if (!plan || token !== gameToken) return;
    // 反転する置き方なら、まず反転
    if (plan.flip) {
      if (!(await waitPlaying(200, token))) return;
      Game.flip();
    }
    // 1回ずつ回す
    for (let i = 0; i < plan.steps; i++) {
      if (!(await waitPlaying(160, token))) return;
      Game.rotate();
    }
    // 位置まで、すーっと動かす
    const from = Game.heldX;
    for (let i = 1; i <= 15; i++) {
      if (!(await waitPlaying(30, token))) return;
      Game.moveHeldTo(from + ((plan.x - from) * i) / 15);
    }
    if (!(await waitPlaying(350, token))) return;
    Game.drop();
  }

  // ---------- オンライン対戦 ----------
  // ホスト（部屋を作った側）がプレイヤー1、ゲスト（参加した側）がプレイヤー2。
  // 物理計算はホストだけが行い、ゲストには状態（キャラの位置と角度）を送る。
  // ゲストは自分の手番に、持っているキャラの位置と角度・「落とす」をホストに送る
  let sendTimer = null; // ホスト：状態を送るタイマー / ゲスト：位置を送るタイマー
  let lastPoseSent = "";

  // 大事なメッセージ（開始・手番の交代・決着）は、取りこぼされても届くよう、少し間をあけて3回送る。
  // 受け取る側は、同じものが重ねて届いても1回だけ処理する
  function sendImportant(msg) {
    Online.send(msg);
    setTimeout(() => Online.send(msg), 300);
    setTimeout(() => Online.send(msg), 900);
  }
  let shapesById = {}; // キャラの ID → キャラの形（ゲストがレア演出を出すときに使う）
  const click = (id, fn) => $(id).addEventListener("click", fn);

  // 相手の手番か
  function isRemoteTurn() {
    return mode === "online" && !!online && player !== online.me;
  }

  // オンライン準備画面の表示を切りかえる（"choose" / "host" / "join"）
  function showOnlineView(view) {
    for (const v of ["choose", "host", "join"]) $(`online-${v}`).classList.toggle("hidden", v !== view);
  }

  UI.onShow("online", () => {
    if (!Online.active) showOnlineView("choose");
  });

  // 部屋を作る
  click("btn-online-host", () => {
    showOnlineView("host");
    $("online-code").textContent = "------";
    $("online-host-status").textContent = "部屋を作っています…";
    Online.host(onlineHandlers("host"));
  });

  // 部屋に入る（コードの入力へ）
  click("btn-online-join", () => {
    showOnlineView("join");
    $("online-join-status").textContent = "";
    $("online-code-input").value = "";
  });

  click("btn-online-connect", () => {
    // 全角の数字（１２３）も半角（123）に直してから、数字以外を取りのぞく
    const code = $("online-code-input")
      .value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/\D/g, "");
    if (code.length !== 6) {
      $("online-join-status").textContent = "6桁の数字を入力してください。";
      return;
    }
    $("online-join-status").textContent = "接続しています…";
    $("btn-online-connect").disabled = true;
    Online.join(code, onlineHandlers("guest"));
  });

  // もどる：準備中なら接続をやめる
  click("btn-online-back", () => {
    Online.leave();
    online = null;
    $("btn-online-connect").disabled = false;
    if (!$("online-choose").classList.contains("hidden")) UI.show("versus");
    else showOnlineView("choose");
  });

  // 通信の出来事を受け取る関数たち
  function onlineHandlers(role) {
    return {
      onCode: (code) => {
        $("online-code").textContent = code;
        $("online-host-status").innerHTML = `このコードを相手に伝えてください<br>相手を待っています<span class="dots"></span>`;
      },
      // ホスト：待ち受けの状態（直接・中継）を表示する（つながらないときの手がかりに）
      onWaitState: (st) => {
        const label = { wait: "準備中…", ok: "○", retry: "つなぎ直し中…", ng: "×" };
        $("online-wait-state").textContent = `待ち受け：直接 ${label[st.direct]} ／ 中継 ${label[st.relay]}`;
      },
      onConnected: () => {
        // profiles：対戦カードに出すプロフィール（vs-intro.js の形）。record：この部屋での自分の [勝, 敗]
        online = { role, me: role === "host" ? 1 : 2, names: { 1: "", 2: "" }, profiles: {}, record: [0, 0] };
        online.names[online.me] = Save.playerName(1);
        sendHello(online);
        if (role === "host") measureRtt(); // 届くまでの時間を測っておく（演出を2台で同時に始めるため）
        $(role === "host" ? "online-host-status" : "online-join-status").textContent =
          Online.kind === "relay" ? "つながりました！（中継サーバー経由）" : "つながりました！";
      },
      // ゲスト：直接つながらず、中継サーバーに切りかえたとき
      onStatus: (text) => {
        $("online-join-status").textContent = text;
      },
      onMessage: (msg) => (role === "host" ? hostMessage(msg) : guestMessage(msg)),
      onError: (message) => {
        online = null;
        $("btn-online-connect").disabled = false;
        UI.alert(message).then(() => showOnlineView("choose"));
      },
      onClose: onDisconnected,
    };
  }

  // あいさつ（hello）：名前と、対戦カードに出すプロフィール（vs-intro.js）を送る。
  // 写真アイコンを小さくするのに少し時間がかかることがあるので、できてから送る
  function sendHello(conn) {
    const name = Save.playerName(1);
    const send = (profile) => {
      if (online !== conn) return; // 待っているあいだに切れた
      online.profiles[online.me] = VsIntro.cleanProfile(name, profile);
      Online.send({ t: "hello", name, profile });
    };
    VsIntro.myProfile().then(send, () => send(null));
  }

  // 相手のあいさつ（hello）を受け取る。古いバージョンの相手からは profile が届かないので、名前だけのカードにする
  function receiveHello(msg, n) {
    online.names[n] = String(msg.name || `プレイヤー${n}`).slice(0, 10);
    online.profiles[n] = VsIntro.cleanProfile(online.names[n], msg.profile);
    online.peerIntro = !!msg.profile; // 相手も演出に対応している（対応していない相手とは、今までどおりすぐ始める）
  }

  // ホスト：届くまでの時間（往復）を測る。{ t: "rtt", s } を送り、ゲストがそのまま { t: "rtt-ack", s } で返す。
  // 何回か送って一番短いものを使う（たまたま遅れたものに引っぱられないように）
  function measureRtt() {
    if (!online) return;
    online.rttRound = [];
    [0, 250, 500].forEach((wait) => setTimeout(() => online && Online.send({ t: "rtt", s: performance.now() }), wait));
  }

  function onRttAck(msg) {
    const rtt = performance.now() - Number(msg.s);
    if (!(rtt >= 0 && rtt < 10000) || !online.rttRound) return;
    online.rttRound.push(rtt);
    online.rtt = Math.min(...online.rttRound);
  }

  // 往復の時間（まだ測れていなければ、つながり方ごとのおおよその値）
  function roundTrip() {
    return online.rtt != null ? online.rtt : Online.kind === "relay" ? 600 : 160;
  }

  // ---------- 試合の前の演出（vs-intro.js） ----------
  // 2台で同じ時刻に演出を始め、演出が終わったら試合を始める。
  // wait：演出を始めるまで（ミリ秒）、begin：試合を始める関数。
  // 演出のあいだに通信が切れたり、タイトルに戻ったりしたら、試合は始めない
  function scheduleOnlineStart(wait, g, begin) {
    const short = g >= 2;
    const total = VsIntro.duration(short);
    const token = { g };
    online.pending = token;
    const alive = () => online && online.pending === token;
    // 「始める」が遅れて届いた（wait がマイナス）ときは、遅れた分だけ演出を短くして、始める時刻をそろえる
    setTimeout(() => alive() && VsIntro.play(introData(g, short), total + Math.min(0, wait)), Math.max(0, wait));
    setTimeout(() => {
      if (!alive()) return;
      online.pending = null;
      VsIntro.cancel();
      begin();
    }, Math.max(0, wait + total));
  }

  // 演出に出すもの
  function introData(g, short) {
    const other = online.me === 1 ? 2 : 1;
    const me = Object.assign({}, online.profiles[online.me] || VsIntro.cleanProfile("", null), { name: Save.playerName(1) });
    const them = Object.assign({}, online.profiles[other] || VsIntro.cleanProfile("", null), { name: online.names[other] || `プレイヤー${other}` });
    // この相手との成績（相手の目印が届かない古いバージョンの相手には出さない）
    const rec = Records.opponentRecord(them.id);
    const note = !them.id ? "" : rec ? `この相手に ${rec.w}勝${rec.l}敗` : "はじめての対戦";
    return { short, me, them, note, gameNo: g, room: online.record.slice() };
  }

  // 接続が切れた
  function onDisconnected() {
    const wasPlaying = !!online;
    const starting = !!(online && online.pending); // 試合の前の演出のあいだ（リザルトからの再戦も）
    online = null;
    VsIntro.cancel();
    if (starting) {
      clearInterval(sendTimer);
      $("btn-online-connect").disabled = false;
      UI.alert("接続が切れました").then(goTitle);
      return;
    }
    clearInterval(sendTimer);
    $("btn-online-connect").disabled = false;
    // 対戦が終わってリザルト（カード・フォトモードも）にいるときは、タイトルに戻さず
    // 「相手が退出しました」と出して、スタンプを送れないようにするだけ
    if (wasPlaying && mode === "online" && ["result", "card", "photo"].includes(UI.current)) {
      Stamps.peerLeft();
      updateRetryButton(); // 「もう一度」も押せなくする（待っていた状態も消える）
      return;
    }
    if (!wasPlaying && UI.current !== "online") return;
    UI.alert("接続が切れました").then(goTitle);
  }

  // 自分から対戦をやめる
  function leaveOnline() {
    Online.leave();
    online = null;
    VsIntro.cancel();
    clearInterval(sendTimer);
  }

  // ---------- ホスト ----------
  function hostMessage(msg) {
    if (!online) return;
    if (msg.t === "hello") {
      if (online.helloSeen) return; // 重ねて届いた（念のため）
      online.helloSeen = true;
      receiveHello(msg, 2);
      setTimeout(startOnlineHost, 800); // 「つながりました！」を少し見せてから始める
    } else if (msg.t === "rtt-ack") {
      onRttAck(msg);
    } else if (msg.t === "pose" && isRemoteTurn()) {
      Game.setHeldPose(msg.x, msg.a, msg.f); // 相手が動かしているキャラ（f：反転）
    } else if (msg.t === "drop" && isRemoteTurn()) {
      Game.setHeldPose(msg.x, msg.a, msg.f);
      Game.drop();
    } else if (msg.t === "rematch") {
      onRematchMessage(msg); // 相手が「もう一度」を押した・取り消した
    } else if (msg.t === "stamp") {
      Stamps.receive(msg.id); // 相手のスタンプ
    }
  }

  // ホスト：オンライン対戦を始める
  function startOnlineHost() {
    if (!online || online.pending) return;
    online.gameNo = (online.gameNo || 0) + 1; // 何回目のゲームか（前のゲームのメッセージと区別する）
    const g = online.gameNo;
    const first = randomFirst(); // 先攻は、演出の前に決めておく（p でゲストにも知らせる）
    // 演出に対応していない古いバージョンの相手とは、今までどおりすぐに始める
    if (!online.peerIntro) {
      sendImportant({ t: "start", g, names: online.names, p: first });
      return beginOnlineHost(first);
    }
    // 「in ミリ秒後に演出を始めて」と送る（届くまでの片道の時間を差し引く）。
    // 取りこぼしに備えて3回送るので、あとから送る分は、送るのを待った時間も差し引く
    const lead = Math.round((Number(CONFIG.online.introLead) || 0.7) * 1000);
    const oneWay = roundTrip() / 2;
    const sentAt = performance.now();
    const sendStart = () => {
      if (!online || online.gameNo !== g) return;
      const passed = performance.now() - sentAt;
      Online.send({ t: "start", g, names: online.names, p: first, in: Math.round(lead - passed - oneWay) });
    };
    sendStart();
    setTimeout(sendStart, 300);
    setTimeout(sendStart, 900);
    // ホストは、演出が終わるまで最初の手番を始めない
    scheduleOnlineStart(lead, g, () => beginOnlineHost(first));
  }

  // ホスト：試合を始める（演出が終わってから）
  function beginOnlineHost(first) {
    if (!online) return;
    startGame("online", null, null, first);
    Game.setInputEnabled(!isRemoteTurn()); // 相手が先攻なら、相手の番が終わるまで操作できない
    // 状態をゲストに送る。直接つながっていれば1秒に20回、
    // 中継サーバー経由なら1秒に10回（公開サーバーに負担をかけすぎないように）
    clearInterval(sendTimer);
    sendTimer = setInterval(() => {
      if (online && mode === "online") Online.send({ t: "s", g: online.gameNo, d: Game.snapshot(), p: player, n: stacked, h: maxHeight });
    }, Online.kind === "relay" ? 100 : 50);
  }

  // ---------- ゲスト ----------
  function guestMessage(msg) {
    if (!online) return;
    if (msg.t === "hello") {
      receiveHello(msg, 1);
    } else if (msg.t === "rtt") {
      Online.send({ t: "rtt-ack", s: msg.s }); // ホストが届くまでの時間を測っている
    } else if (msg.t === "start") {
      if (msg.g === online.gameNo) return; // 同じ開始の知らせが重ねて届いた
      online.gameNo = msg.g;
      online.names = Object.assign(online.names, msg.names, { 2: Save.playerName(1) });
      online.names[1] = String(online.names[1] || "プレイヤー1").slice(0, 10);
      // in：演出を始めるまでの時間（ミリ秒）。古いバージョンのホストからは届かないので、そのときはすぐに始める
      const wait = Number(msg.in);
      if (typeof msg.in === "number" && isFinite(wait)) scheduleOnlineStart(Math.min(wait, 3000), msg.g, () => startOnlineGuest(msg.p));
      else startOnlineGuest(msg.p);
    } else if (msg.t === "s" && mode === "online" && !online.pending) {
      if (msg.g !== online.gameNo) return; // 前のゲームの状態
      // 積んだ数・高さ・手番は、状態のメッセージでも受け取る（「turn」を取りこぼしても合うように）
      if (msg.n > stacked) {
        stacked = msg.n;
        maxHeight = msg.h;
      }
      if (msg.p !== player) {
        player = msg.p;
        showTurnBanner();
      }
      updateHud();
      Game.applySnapshot(msg.d, player === online.me);
    } else if (msg.t === "turn" && mode === "online" && !online.pending) {
      // 1体積めて、手番が交代した（重ねて届いたものは、積んだ数で見分けて1回だけ処理する）
      if (msg.g !== online.gameNo || msg.n <= online.countedTurns) return;
      online.countedTurns = msg.n;
      if (player !== msg.p) {
        player = msg.p;
        showTurnBanner();
      }
      stacked = Math.max(stacked, msg.n);
      maxHeight = Math.max(maxHeight, msg.h);
      Records.addPiece(shapesById[msg.id] || null); // 知らない ID なら、レア度は数えない
      // 積んだのが自分なら（手番が相手に移った）、実績のための数も数える（ギリギリの判定は、自分で落としたときの残り時間）
      countForAchievements(shapesById[msg.id] || null, msg.h, msg.p !== online.me);
      if (msg.id) Dex.register(msg.id); // 知らない ID なら何もしない
      Achievements.check(gameStatus());
      updateHud();
    } else if (msg.t === "stamp") {
      Stamps.receive(msg.id); // 相手のスタンプ
    } else if (msg.t === "rematch") {
      onRematchMessage(msg); // 相手が「もう一度」を押した・取り消した
    } else if (msg.t === "rematch-go") {
      onRematchGo(msg); // ホストが「両方そろった」と知らせてきた
    } else if (msg.t === "se") {
      Sound.play(msg.name);
    } else if (msg.t === "rare") {
      const shape = shapesById[msg.id]; // 知らない ID なら出さない
      if (shape) showRareBanner(shape, CONFIG.rarity[shape.rarity]);
    } else if (msg.t === "over") {
      if (msg.g !== online.gameNo || online.overShown === msg.g) return; // 重ねて届いた
      online.overShown = msg.g;
      stacked = msg.n;
      maxHeight = msg.h;
      lastDropper = msg.loser;
      showResult();
    }
  }

  // ゲスト：オンライン対戦を始める（物理計算はせず、届いた状態を描く）
  // first: ホストが決めた先攻（1 か 2。古いバージョンのホストからは届かないので、そのときは 1）
  function startOnlineGuest(first) {
    mode = "online";
    ruleId = null;
    cpuLevel = null;
    gameToken++;
    player = first === 2 ? 2 : 1;
    stacked = 0;
    maxHeight = 0;
    resetAchievementCounts();
    online.countedTurns = 0; // 手番の交代を数えなおす（重ねて届いた知らせを見分けるため）
    UI.clearConfetti();
    Stamps.end(); // スタンプはリザルトのあいだだけ
    UI.show(null);
    Game.startRemote({
      dropOnRelease: () => Settings.get("release"),
      // 自分の手番で「落とす」を押したら、位置と角度をホストに送る
      onRemoteDrop: (x, a, f) => sendImportant({ t: "drop", x, a, f }),
      onSkyStage: showSkyStage,
    });
    Game.setInputEnabled(true);
    Sound.startBgm();
    updateHud();
    showTurnBanner(true);
    // 自分の手番の間、持っているキャラの位置と角度をホストに送る（相手の画面に映すため）
    clearInterval(sendTimer);
    lastPoseSent = "";
    sendTimer = setInterval(() => {
      if (!online || mode !== "online" || isRemoteTurn()) return;
      const pose = Game.heldPose();
      if (!pose) return;
      const key = `${Math.round(pose.x)},${pose.angle.toFixed(3)},${pose.flip}`;
      if (key === lastPoseSent) return; // 動いていなければ送らない
      lastPoseSent = key;
      Online.send({ t: "pose", x: pose.x, a: pose.angle, f: pose.flip });
    }, 100);
  }

  function showThinking(on) {
    const el = $("cpu-thinking");
    el.classList.toggle("hidden", !on);
    if (on) el.innerHTML = `${UI.escape(nameOf(2))}<br>考え中<span class="dots"></span>`;
  }

  // 1人モードのスコア ＝ 積んだ数 × 1体の点数 ＋ 高さ(m) × 1mの点数（配点は config.js の score。競技は competitive）
  function calcScore() {
    const s = comp ? CONFIG.competitive : CONFIG.score;
    return stacked * s.perPiece + Math.floor(maxHeight * s.perMeter);
  }

  // 今のゲームの状況（実績の判定に使う）
  //   rotations：回転を使った回数、aimTimes：1手ごとにかかった時間、edge：最後に積んだキャラの、土台の端からの距離
  function gameStatus() {
    return {
      mode, rule: ruleId, comp, count: stacked, height: maxHeight, score: calcScore(), rotations: Game.rotations, aimTimes, edge: lastEdge,
      // 新しい実績のための数（achievements.js の条件の説明を参照）
      flips: Game.flips,
      flipStreak: Game.flipStreak,
      drawn: Game.drawn,
      flipPlaced: achieve.flipPlaced,
      ownCount: achieve.ownCount,
      afterBig: achieve.bigAt === null ? 0 : stacked - achieve.bigAt,
      heights: achieve.heights,
      placedIds: achieve.placedIds,
      placedCounts: achieve.placedCounts,
      buzzer: achieve.buzzer,
      over: achieve.over,
    };
  }

  // 特殊ルールの名前の札（ふつうのルールなら ""）
  function ruleTag() {
    if (comp) return `<span class="rule-tag comp-tag">🏁 競技</span>`;
    const r = Rules.get(ruleId);
    return r ? `<span class="rule-tag">${r.params.icon || ""} ${UI.escape(r.params.name)}</span>` : "";
  }

  // ---------- 上部の表示 ----------
  function updateHud() {
    const sub = `${stacked}体 ／ ${maxHeight.toFixed(2)}m`;
    if (mode === "solo") {
      const target = challenge
        ? `<br><span class="hud-challenge">🎯 ${UI.escape(challenge.name)}さんの ${challenge.score}点 に挑戦中</span>`
        : "";
      $("hud-info").innerHTML = `<span class="big">${calcScore()}</span> 点 ${ruleTag()}<br>${sub}${target}`;
    } else {
      $("hud-info").innerHTML = `<span class="player-tag p${player}" ${UI.fit(nameOf(player) + " の番")}>${UI.escape(nameOf(player))} の番</span> ${ruleTag()}<br>${sub}`;
    }
    updateSidePanels();
  }

  // ---------- 横長の画面（パソコン）の、左右のパネル ----------
  // 表示するかは style.css が決める（幅 1024px 以上・横長・マウスなど細かく指せる機器）。中身はいつも書いておく
  //   左：スコア・積んだ数・高さ・ハイスコア ／ 右：対戦の2人と手番・制限時間・操作の一覧（controls.js）
  function updateSidePanels() {
    const item = (label, value, cls = "") => `<div class="side-item ${cls}"><span>${label}</span><b>${value}</b></div>`;
    let left = ruleTag() ? `<div class="side-rule">${ruleTag()}</div>` : "";
    if (mode === "solo") {
      const best = ruleId ? Save.data.stats.ruleBest[ruleId] : comp ? Save.data.stats.compBest : Save.data.stats.best;
      left +=
        item("スコア", `${calcScore()}<small>点</small>`, "side-score") +
        item("積んだ数", `${stacked}<small>体</small>`) +
        item("高さ", `${maxHeight.toFixed(2)}<small>m</small>`) +
        item("ハイスコア", best ? `${best.score}<small>点</small>` : "---") +
        (challenge ? `<p class="side-note">🎯 ${UI.escape(challenge.name)}さんの ${challenge.score}点 に挑戦中</p>` : "");
    } else {
      left += item("積んだ数", `${stacked}<small>体</small>`) + item("高さ", `${maxHeight.toFixed(2)}<small>m</small>`);
    }
    $("side-left-body").innerHTML = left;
    // 対戦：2人の名前と、今の手番
    $("side-turn").innerHTML = isVs()
      ? [1, 2].map((n) => `<div class="side-player p${n} ${n === player ? "now" : ""}">${UI.escape(nameOf(n))}${n === player ? "<small>の番</small>" : ""}</div>`).join("")
      : "";
    updateSideTimer();
  }

  // 制限時間（オンライン対戦）：残りの秒数。ゲーム中は 0.2秒ごとに書きなおす
  function updateSideTimer() {
    const left = UI.current === null ? Game.turnTimeLeft : null;
    $("side-timer").innerHTML = typeof left === "number" ? `<span>制限時間</span><b class="${left < 3000 ? "hurry" : ""}">${Math.ceil(left / 1000)}<small>秒</small></b>` : "";
  }
  setInterval(() => {
    if (UI.current === null && (mode === "online" || mode === "versus")) updateSideTimer();
  }, 200);

  // レアキャラが出たときの「レア！」「めっちゃレア！！」「激レア！！！」
  // ★4（激レア）は、専用のバナーと、画面が一瞬光る演出と、専用の効果音
  function showRareBanner(shape, info) {
    const el = $("rare-banner");
    const ultimate = info.stars >= 4;
    const legendary = info.stars >= 5; // ★5（まぼろし）：画面が虹色に光る、豪華な演出
    const secret = info.stars >= 6; // ★6（シークレット）：画面が暗くなって、金色の光がはじける、いちばん豪華な演出
    // 文字は config.js のレア度の名前 ＋「！」（★2は1つ、★3は2つ、★4以上は3つ）。例「めっちゃレア！！」
    const label = info.name + "！".repeat(Math.max(1, Math.min(3, info.stars - 1)));
    el.innerHTML = `<span>${label}</span><small>${UI.escape(shape.name)}</small>`;
    el.style.setProperty("--rare-color", info.color);
    el.className = secret ? "rare-banner ultimate legendary secret" : legendary ? "rare-banner ultimate legendary" : ultimate ? `rare-banner ultimate aura-${shape.aura || "light"}` : info.stars >= 3 ? "rare-banner super" : "rare-banner";
    el.style.animation = "none"; // アニメーションを最初から
    void el.offsetWidth;
    el.style.animation = "";
    if (ultimate) {
      const flash = $("flash");
      flash.className = "";
      void flash.offsetWidth;
      flash.className = secret ? "on secret" : legendary ? "on legendary" : "on";
    }
    if (secret) showSecretFx();
    Sound.play(secret ? "secret" : legendary ? "legendary" : ultimate ? "ultimate" : "rare");
  }

  // ★6（シークレット）だけの演出：暗くなった画面が光る瞬間に、ゲームの画面が揺れて、金色の粒が上から降ってくる
  // （動きを控えめにする設定のときは、しない）
  function showSecretFx() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = $("game-canvas");
    canvas.classList.remove("secret-shake");
    void canvas.offsetWidth;
    canvas.classList.add("secret-shake");
    setTimeout(() => canvas.classList.remove("secret-shake"), 1600);
    const rain = document.createElement("div");
    rain.className = "secret-rain";
    for (let i = 0; i < 46; i++) {
      const dot = document.createElement("i");
      dot.style.setProperty("--x", `${Math.random() * 100}%`);
      dot.style.setProperty("--s", `${4 + Math.random() * 9}px`);
      dot.style.setProperty("--d", `${1.6 + Math.random() * 1.6}s`);
      dot.style.setProperty("--delay", `${0.7 + Math.random() * 1.2}s`);
      dot.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      rain.appendChild(dot);
    }
    $("flash").after(rain);
    setTimeout(() => rain.remove(), 4600);
  }

  // 塔が高くなって、新しい背景に届いた（config.js の sky）
  function showSkyStage(stage) {
    UI.toast(`<span class="toast-sky">${stage.icon || ""} <b>${UI.escape(stage.name)}</b>に到達！</span>`);
  }

  // 「〇〇 の番」を大きく表示する（ゲームの最初は「〇〇 の先攻！」）
  function showTurnBanner(first = false) {
    const el = $("turn-banner");
    el.textContent = first ? `${nameOf(player)} の先攻！` : `${nameOf(player)} の番`;
    el.style.setProperty("--fit", UI.emWidth(el.textContent)); // 長い名前のときだけ、文字を小さくする（style.css）
    el.className = `p${player}`;
    // アニメーションを最初から再生しなおすためのおまじない
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  // ---------- リザルト ----------
  function showResult() {
    Sound.stopBgm();
    $("turn-banner").className = "hidden";
    const box = $("result-content");

    achieve.over = true; // 実績「出オチ」（1体目で落とした）
    if (mode === "solo") {
      const score = calcScore();
      if (challenge && score > challenge.score) Records.addChallengeWin(); // 実績「挑戦状キラー」
      // 戦績に記録（ハイスコアも更新）。特殊ルールのハイスコアは、ルールごとに別に記録する
      // 競技のハイスコアは、フリー（ふつうのスコアアタック）とは別に記録する
      const isNew = ruleId
        ? Records.addRuleResult(ruleId, score, stacked, maxHeight)
        : comp
        ? Records.addCompResult(score, stacked, maxHeight)
        : Records.addSoloResult(score, stacked, maxHeight);
      const best = ruleId ? Save.data.stats.ruleBest[ruleId] : comp ? Save.data.stats.compBest : Save.data.stats.best;
      lastResult = { mode, rule: ruleId, comp, seed, score, count: stacked, height: maxHeight, isNewRecord: isNew };

      box.innerHTML =
        challengeResultHTML(score) +
        Profile.badgeHTML() +
        (ruleId || comp ? `<div class="result-rule">${ruleTag()}</div>` : "") +
        (isNew ? `<div class="new-record">NEW RECORD!</div>` : `<h2 class="result-heading">ゲームオーバー</h2>`) +
        `<div class="result-score"><span id="result-score-num">0</span><small> 点</small></div>` +
        `<div class="result-stats">` +
        `<div>積んだ数<b>${stacked}体</b></div>` +
        `<div>高さ<b>${maxHeight.toFixed(2)}m</b></div>` +
        `<div>ハイスコア<b>${best.score}</b></div>` +
        `</div>`;
      UI.countUp($("result-score-num"), score, 900);
      // ランキング（ふつうのルール＝フリー と 競技）：スコアを見てもらってから、送る（初めてなら送っていいか聞く）。
      // すぐに「もう一度」を押したときは聞かずに、次の機会に聞く
      if (!ruleId) {
        setTimeout(() => (UI.current === "result" ? Ranking.afterSoloGame() : Ranking.submitBest()), 1500);
      }
      if (isNew) {
        Sound.play("record");
        UI.confetti(["#ffd84d", "#ff7a59", "#4cd964", "#3d8bff", "#ff5d73"]);
      } else {
        Sound.play("gameover");
      }
    } else {
      const loser = lastDropper;
      const winner = loser === 1 ? 2 : 1;
      let stageNote = ""; // イベントのステージのごほうびの知らせ
      // 戦績に記録（CPU対戦・オンライン対戦は、人どうしの対戦とは別に数える）
      if (mode === "online") {
        clearInterval(sendTimer);
        // ホストは、ゲストにも結果を知らせる
        if (online && online.role === "host") sendImportant({ t: "over", g: online.gameNo, loser, n: stacked, h: maxHeight });
        if (online) {
          const won = winner === online.me;
          const other = online.me === 1 ? 2 : 1;
          Records.addOnlineResult(won);
          // この相手との成績・この部屋での勝敗（次の試合の演出に出す）
          Records.addOpponentResult((online.profiles[other] || {}).id, nameOf(other), won);
          online.record[won ? 0 : 1]++;
          if (online.role === "host") measureRtt(); // 次の試合のために、届くまでの時間を測りなおす
        }
      } else if (cpuLevel && Halloween.isStageCpu(cpuLevel)) {
        // イベントのステージ（おばけ屋敷）：ふつうの CPU 対戦とは別に記録し、勝つたびにごほうび
        const n = Records.addEventResult(Halloween.EVENT_ID, winner === 1);
        stageNote = Halloween.resultHTML(winner === 1, n);
      } else if (cpuLevel) Records.addCpuResult(cpuLevel, winner === 1);
      else Records.addVersusResult(winner);
      lastResult = { mode, cpu: cpuLevel, winner, loser, count: stacked, height: maxHeight };

      // オンライン対戦では「あなたの勝ち／負け」も出す
      const youText = mode === "online" && online ? (winner === online.me ? "あなたの勝ち！" : "あなたの負け…") : "";
      // オンライン対戦：相手の名前と称号の枠
      if (mode === "online" && online) {
        const other = online.me === 1 ? 2 : 1;
        const t = online.profiles[other] || {};
        stageNote += `<div class="opponent-badge"><small>対戦相手</small>${Profile.badgeOf({ name: nameOf(other), icon: t.icon || null, title: t.title, frame: t.frame })}</div>`;
      }
      box.innerHTML =
        (youText ? `<p class="result-you">${youText}</p>` : "") +
        `<div class="winner p${winner}"><span class="winner-name" ${UI.fit(nameOf(winner))}>${UI.escape(nameOf(winner))}</span><small>の勝ち！</small></div>` +
        `<p class="result-sub">${UI.escape(nameOf(loser))} が落としました…</p>` +
        `<div class="result-stats">` +
        `<div>積んだ数<b>${stacked}体</b></div>` +
        `<div>高さ<b>${maxHeight.toFixed(2)}m</b></div>` +
        `</div>` +
        stageNote;
      Sound.play("record");
      const color = winner === 1 ? "#ff5d73" : "#3d8bff";
      UI.confetti([color, "#ffffff", "#ffd84d"]);
    }
    // 挑戦状のボタン（1人モードのときだけ。挑戦中なら「送り返す」）
    $("btn-challenge").classList.toggle("hidden", mode !== "solo");
    $("btn-challenge").firstChild.textContent = challenge ? "挑戦状を送り返す" : "挑戦状を送る";
    // スタンプ：オンライン対戦のリザルトだけで使える（送るのはキャラの ID だけ）
    if (mode === "online" && online) {
      Stamps.begin((id) => {
        Online.send({ t: "stamp", id });
        Records.addStampSent(); // 実績「ひとこと」
        Achievements.check(null);
      }, opponentName());
    } else Stamps.end();
    resetRematch(); // 「もう一度」の希望は、試合ごとに最初から
    // 戦績を記録したあとで、実績を判定する（「10回プレイ」「対戦で10勝」など）
    Achievements.check(gameStatus());
    PWA.atResult(mode === "online"); // 初めてのゲームのあとに1度だけ、アプリとしてインストールの案内
    UI.show("result");
  }

  // ---------- オンライン対戦の「もう一度」 ----------
  // お互いが「もう一度」を押したときだけ、次の試合を始める（始めるのはホスト）。
  // 押した・取り消した知らせ：{ t: "rematch", on: 押したか, g: 試合の番号, n: 押した回数 }
  //   g … 前の試合の希望が、次の試合に残らないように
  //   n … 3回ずつ送る知らせが、押した・取り消しの前後で入れかわって届いても、新しい方だけ使うように
  // 両方そろったら、ホストが { t: "rematch-go", g } を送り、両方に「再戦！」を出してから始める
  const REMATCH_DELAY = 1100; // 「再戦！」を出してから始めるまで（ミリ秒）

  // 対戦相手の名前
  function opponentName() {
    return (online && online.names[online.me === 1 ? 2 : 1]) || "相手";
  }

  // リザルトに来たとき：お互いの希望を「まだ」にする
  function resetRematch() {
    if (mode === "online" && online) online.rematch = { me: false, them: false, seq: 0, theirSeq: 0, go: false };
    updateRetryButton();
  }

  // 自分が「もう一度」を押した（もう一度押すと取り消し）
  function toggleRematch() {
    const r = online && online.rematch;
    if (!r || r.go) return;
    r.me = !r.me;
    r.seq++;
    sendImportant({ t: "rematch", on: r.me, g: online.gameNo, n: r.seq });
    updateRetryButton();
    checkRematch();
  }

  // 相手が押した・取り消した（前の試合のもの・古い知らせは使わない）
  function onRematchMessage(msg) {
    const r = online && online.rematch;
    if (!r || r.go || msg.g !== online.gameNo || !(msg.n > r.theirSeq)) return;
    r.theirSeq = msg.n;
    r.them = !!msg.on;
    updateRetryButton();
    checkRematch();
  }

  // ホスト：両方そろったら、「再戦！」を出してから始める
  function checkRematch() {
    const r = online.rematch;
    if (online.role !== "host" || !r.me || !r.them || r.go) return;
    r.go = true;
    sendImportant({ t: "rematch-go", g: online.gameNo });
    showRematchBanner();
    updateRetryButton();
    setTimeout(() => {
      if (online && mode === "online" && online.rematch === r) startOnlineHost();
    }, REMATCH_DELAY);
  }

  // ゲスト：ホストから「両方そろった」が届いた（このあと、ホストから「始める」が届く）
  function onRematchGo(msg) {
    const r = online && online.rematch;
    if (!r || r.go || msg.g !== online.gameNo) return;
    r.go = true;
    showRematchBanner();
    updateRetryButton();
  }

  // 「再戦！」を大きく出す
  function showRematchBanner() {
    const el = $("rematch-banner");
    el.className = "";
    void el.offsetWidth; // アニメーションを最初から
    el.className = "show";
    Sound.play("record");
  }

  // 「もう一度」ボタンと、「〇〇さんが再戦を希望しています」の表示を、今の状態に合わせる
  function updateRetryButton() {
    const btn = $("btn-retry");
    const note = $("rematch-note");
    btn.classList.remove("waiting", "attention");
    btn.disabled = false;
    btn.textContent = "もう一度";
    note.classList.add("hidden");
    if (mode !== "online") return; // 1人・ともだちと・CPU対戦は、今までどおり
    const r = online && online.rematch;
    if (!r) {
      btn.disabled = true; // 相手が退出した
      return;
    }
    if (r.go) {
      btn.disabled = true;
      btn.textContent = "まもなく再戦！";
    } else if (r.me) {
      btn.innerHTML = "相手を待っています…<small>もう一度押すと取り消す</small>";
      btn.classList.add("waiting");
    } else if (r.them) {
      note.textContent = `${opponentName()}さんが再戦を希望しています`;
      note.classList.remove("hidden");
      btn.classList.add("attention");
    }
  }

  // ---------- 競技の説明 ----------
  // 競技のルールと「図鑑には登録されません」を出す。「始める」なら true（「次から表示しない」に印があれば、もう出さない）
  function showCompIntro() {
    const conf = CONFIG.competitive || {};
    const count = window.CHARACTERS.filter((c) => Chars.inCompetitive(c)).length;
    const stars = (conf.rarities || []).map((id) => (CONFIG.rarity[id] || {}).stars || 0).filter(Boolean);
    // competitive: true で、レア度の範囲の外から競技に出るキャラ（★4 の別班など）は、名前を足す
    const extra = window.CHARACTERS.filter((c) => Chars.inCompetitive(c) && !(conf.rarities || []).includes(c.rarity || "N"));
    const range = (stars.length ? `★${Math.min(...stars)}〜★${Math.max(...stars)}` : "") + (extra.length ? `（＋${extra.map((c) => UI.escape(c.name)).join("・")}）` : "");
    $("comp-dialog-rules").innerHTML = [
      `<li>${range}の${count}体が、<b>全部同じ確率</b>で落ちてきます（サイズ違い・期間限定のキャラは出ません）</li>`,
      `<li>全キャラ<b>同じ大きさ</b>。特殊ルールのギミックはありません</li>`,
      `<li>点数は1体 ${conf.perPiece}点（どのキャラも同じ）＋ 高さ1mごとに ${conf.perMeter}点</li>`,
      `<li>ハイスコアは、<b>ランキング（競技）</b>に載ります（ふつうのスコアアタックとは別）</li>`,
      `<li>キャラの光やレアの表示は出ません（全キャラ同じ見た目）</li>`,
      `<li class="comp-dialog-warn">競技で出たキャラは、<b>図鑑には登録されません</b></li>`,
    ].join("");
    $("comp-dialog-hide").checked = false;
    $("comp-dialog").classList.add("active");
    return new Promise((resolve) => {
      const close = (ok) => {
        $("comp-dialog").classList.remove("active");
        $("comp-dialog-ok").onclick = $("comp-dialog-cancel").onclick = null;
        if (ok && $("comp-dialog-hide").checked) Settings.set("compIntro", false);
        resolve(ok);
      };
      $("comp-dialog-ok").onclick = () => close(true);
      $("comp-dialog-cancel").onclick = () => close(false);
    });
  }

  // ---------- リザルトカード ----------
  // モードの名前（カードに載せる）
  function modeName() {
    const r = Rules.get(ruleId);
    if (mode === "solo" && comp) return challenge ? `🏁 競技の挑戦状（${challenge.name}さん ${challenge.score}点）` : "🏁 競技";
    if (mode === "solo") return challenge ? `挑戦状（${challenge.name}さん ${challenge.score}点）` : r ? `特殊ルール「${r.params.name}」` : "スコアアタック";
    if (mode === "online") return "オンライン対戦";
    if (cpuLevel && r) return `${r.params.icon || ""} ${r.params.name}`; // イベントのステージ（おばけ屋敷など）
    return cpuLevel ? `CPU対戦（${CONFIG.cpu[cpuLevel].name}）` : "ふたりで対戦";
  }

  function openCard() {
    if (!lastResult) return;
    const p = Save.data.profile;
    const solo = lastResult.mode === "solo";
    Card.open({
      name: solo ? Save.playerName(1) : nameOf(lastResult.winner),
      titleText: solo ? Profile.titleText(p.titleId) : "",
      frame: solo ? Frames.ofTitleId(p.titleId) : null, // 称号の枠
      icon: solo ? p.icon : null, // 対戦の勝者が自分とはかぎらないので、写真は載せない
      modeName: modeName(),
      score: solo ? lastResult.score : null,
      headline: solo ? "" : `${nameOf(lastResult.winner)} の勝ち！`,
      count: lastResult.count,
      height: lastResult.height,
    });
  }

  // ---------- 実績のリセットのお知らせ ----------
  // config.js の achievementsEpoch が上がって、実績と戦績をリセットした（save.js）ときに、1回だけ出す
  async function showEpochNotice() {
    if (!Save.data.meta.epochResetNotice) return;
    // タイトル画面で、ほかのポップアップ（お知らせ・挑戦状など）が出ていないときまで待つ
    while (UI.current !== "title" || document.querySelector(".dialog.active") || !$("splash").classList.contains("hidden")) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    Save.data.meta.epochResetNotice = false;
    Save.write();
    await UI.alert("アップデートで実績が新しくなったため、実績と戦績をリセットしました。\n（図鑑・名前・写真・スタンプ・設定はそのままです）");
    updateBestCard();
    Profile.refresh();
  }

  // ---------- 挑戦状 ----------
  // リザルトの「〇〇さんに勝ち！」（挑戦中でなければ ""）
  function challengeResultHTML(score) {
    if (!challenge) return "";
    const who = `${UI.escape(challenge.name)}さん（${challenge.score}点）`;
    if (score > challenge.score) return `<div class="challenge-result win">勝ち！<small>${who}に勝ちました</small></div>`;
    if (score < challenge.score) return `<div class="challenge-result lose">負け…<small>${who}に届きませんでした</small></div>`;
    return `<div class="challenge-result">引き分け<small>${who}と同じ点数</small></div>`;
  }

  // 挑戦状を送る（送り返す）：同じ順番・同じルールで、自分のスコアを入れた URL を共有する
  function sendChallenge() {
    if (!lastResult || lastResult.mode !== "solo") return;
    const name = Save.playerName(1);
    const url = Challenge.makeUrl({ seed: lastResult.seed, rule: lastResult.rule, score: lastResult.score, name, comp: lastResult.comp });
    const r = Rules.get(lastResult.rule);
    const text = `${name}から挑戦状！かじわらタワーバトル${lastResult.comp ? "（競技）" : r ? `（${r.params.name}）` : ""}で ${lastResult.score}点 を超えられる？`;
    Share.url(text, url);
  }

  // URL で受け取った挑戦状を表示する
  function showChallengePopup(c) {
    const r = Rules.get(c.rule);
    $("challenge-popup-content").innerHTML =
      `<p class="challenge-from">${UI.escape(c.name)}さんからの挑戦状</p>` +
      `<div class="challenge-score">${c.score}<small> 点</small></div>` +
      (c.comp ? `<span class="rule-tag comp-tag">🏁 競技</span>` : r ? `<span class="rule-tag">${r.params.icon || ""} ${UI.escape(r.params.name)}</span>` : "") +
      `<p class="challenge-note">同じ順番でキャラが出てきます。この点数を超えたら勝ち！${c.comp ? "<br>競技のルールで遊びます（図鑑には登録されません）" : ""}</p>`;
    $("challenge-popup").classList.add("active");
    $("challenge-accept").onclick = async () => {
      $("challenge-popup").classList.remove("active");
      if (!shapesReady) return; // キャラの画像を読み込めなかった
      if (!(await Ranking.ensureConsent())) return; // 挑戦状もスコアアタック・競技なので、同意してから
      challenge = c;
      startGame("solo", c.rule, null, null, c.comp);
    };
    $("challenge-later").onclick = () => $("challenge-popup").classList.remove("active");
  }

  // サイズ違いの倍率（config.js の sizeVariants）。大きくしすぎて土台からはみ出さないよう、長い方の辺を maxSize までにする
  function variantScale(variant, shape) {
    const conf = CONFIG.sizeVariants || {};
    const scale = Number(conf[variant]) || 1;
    const longest = Math.max(shape.w, shape.h) * scale;
    const max = Number(conf.maxSize) || 200;
    return longest > max ? max / Math.max(shape.w, shape.h) : scale;
  }

  // ---------- ボタン ----------
  // data-open="〇〇" のボタン → その画面を開く（タイトルのメニューなど）
  // data-back="〇〇" のボタン → その画面に戻る（各画面の「もどる」）
  document.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) UI.show(openBtn.dataset.open);
    const backBtn = e.target.closest("[data-back]");
    if (backBtn) UI.show(backBtn.dataset.back);
  });

  const on = (id, fn) => $(id).addEventListener("click", fn);
  // タイトル
  on("btn-start", () => UI.show("mode"));
  on("btn-title-settings", () => openSettings("title"));
  // モード選択：「ひとりで」のボタンに、スコアアタック（ふつうのルール）のハイスコアを小さく出す
  UI.onShow("mode", () => {
    const best = Save.data.stats.best;
    $("mode-best").classList.toggle("hidden", !best);
    $("mode-best").textContent = best ? `スコアアタック ${best.score}点` : "";
  });
  // スコアアタック：ふつうのルール（ルールを選ぶ画面のいちばん上）
  // スコアアタック・特殊ルール・競技は、ランキングへの参加に同意してから始める（ranking.js の ensureConsent）。
  // 「やめる」なら始めずに、モード選択に戻る（対戦は同意しなくても遊べる）
  async function startSolo(newRuleId = null, newComp = false) {
    if (!(await Ranking.ensureConsent())) {
      if (UI.current === "rules") UI.show("mode");
      return;
    }
    // 競技：初めてのうちは、ルールの説明を出してから始める
    if (newComp && Settings.get("compIntro") && !(await showCompIntro())) return;
    startGame("solo", newRuleId, null, null, newComp);
  }
  on("btn-solo", () => startSolo());
  // 競技（「ふつう」のすぐ下）
  on("btn-comp", () => startSolo(null, true));
  on("btn-versus", () => startGame("versus"));
  // CPU と対戦（data-cpu に強さ）
  for (const btn of document.querySelectorAll("[data-cpu]")) {
    btn.addEventListener("click", () => startGame("versus", null, btn.dataset.cpu));
  }
  on("btn-mode-back", () => UI.show("title"));
  // ゲーム中
  // ポーズ（オンライン対戦では止められないので、やめるか確認する）
  on("btn-pause", async () => {
    if (mode !== "online") return pauseGame();
    if (await UI.confirm("対戦をやめて、タイトルに戻りますか？", "やめる")) goTitle();
  });
  // CPU の手番では、人のボタン操作は受け付けない
  on("btn-rotate", () => !isCpuTurn() && !isRemoteTurn() && Game.rotate());
  on("btn-drop", () => !isCpuTurn() && !isRemoteTurn() && Game.drop());
  on("btn-flip", () => !isCpuTurn() && !isRemoteTurn() && Game.flip());
  // ポーズ
  on("btn-resume", resumeGame);
  on("btn-restart", () => startGame(mode, ruleId, cpuLevel, null, comp));
  on("btn-pause-settings", () => openSettings("pause"));
  on("btn-pause-title", goTitle);
  // 設定
  on("btn-settings-back", () => UI.show(settingsReturnTo));
  // リザルト
  on("btn-retry", () => {
    if (mode !== "online") return startGame(mode, ruleId, cpuLevel, null, comp);
    // オンライン対戦：お互いが押したら始まる（もう一度押すと取り消し）
    toggleRematch();
  });

  // 「ひとりで」の画面：いちばん上に「スコアアタック」（ふつうのルール）、その下に rules.js にある特殊ルールを並べる
  UI.onShow("rules", () => {
    const best = Save.data.stats.best;
    $("normal-best").innerHTML = best ? `ハイスコア<b>${best.score}</b>` : "";
    const compBest = Save.data.stats.compBest;
    $("comp-best").innerHTML = compBest ? `ハイスコア<b>${compBest.score}</b>` : "";
    $("rules-list").innerHTML = Rules.list()
      .map((r) => {
        const best = Save.data.stats.ruleBest[r.id];
        return `
          <button class="list-row rule-row" data-rule="${r.id}">
            <span class="rule-icon">${r.params.icon || ""}</span>
            <span class="rule-main">
              <b>${UI.escape(r.params.name)}${r.params.event ? ` <span class="limited-tag">期間限定</span>` : ""}</b>
              <small>${UI.escape(r.params.description || "")}</small>
            </span>
            <span class="rule-best">${best ? `ハイスコア<b>${best.score}</b>` : ""}</span>
          </button>`;
      })
      .join("");
  });
  $("rules-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-rule]");
    if (row) startSolo(row.dataset.rule);
  });
  on("btn-result-title", goTitle);
  on("btn-challenge", sendChallenge);
  on("btn-card", openCard);
  // フォトモード（ポーズ画面・リザルト画面の data-photo ボタン）
  let photoReturn = null; // フォトモードを終わったときに戻る画面
  for (const btn of document.querySelectorAll("[data-photo]")) {
    btn.addEventListener("click", () => {
      photoReturn = UI.current;
      Game.enterPhoto();
      UI.show("photo");
      UI.replayAnimations("photo"); // 「ドラッグで移動・ピンチで拡大」をもう一度出す
    });
  }
  on("btn-photo-close", () => {
    Game.exitPhoto();
    UI.show(photoReturn);
  });
  on("btn-photo-shoot", () => {
    const img = Game.photoImage();
    if (!img) return;
    // 撮った感じを出す（画面が白く光る）
    const flash = $("photo-flash");
    flash.classList.remove("on");
    void flash.offsetWidth;
    flash.classList.add("on");
    img.toBlob((blob) => Share.image(blob, "kajiwara-tower-photo.png", `かじわらタワーバトル
${location.origin}${location.pathname}`), "image/png");
  });

  // ---------- 起動 ----------
  // 1. スプラッシュ画面（会社名）を出す。その裏でタイトル画面を用意し、キャラを読み込む
  // 2. スプラッシュが消えたら、タイトルのアニメーションを再生
  // スプラッシュをタップすると、それが「最初の操作」になって音が鳴らせるようになる
  //（音の有効化は、上の unlockOnce がすべてのタップで行っている）
  $("version").textContent = CONFIG.version;
  $("online-version").textContent = `ゲームのバージョン：${CONFIG.version}（2台で同じか確かめてください）`;
  // 管理者モード：この端末に正しい鍵があれば開く。開いた・閉じたときに表示を切りかえる
  function applyAdmin() {
    $("setting-debug-row").classList.toggle("hidden", !(CONFIG.devMode || Admin.unlocked));
    $("setting-admin-row").classList.toggle("hidden", !Admin.unlocked);
    $("btn-admin-home").classList.toggle("hidden", !Admin.unlocked); // ホームの 🛠（管理者メニュー）
    applySettings();
    Profile.refresh();
  }
  Admin.onChange = applyAdmin;
  // パソコンの操作（キーボード）：相手の番・CPU の番・ポーズ中は、画面のボタンと同じく受け付けない
  Controls.init({
    canPlay: () => UI.current === null && !Game.paused && !isCpuTurn() && !isRemoteTurn(),
    pause: () => (mode === "online" ? null : pauseGame()), // オンライン対戦は止められない
    resume: resumeGame,
  });
  Admin.onStartSandbox = () => {
    // 自由配置モード（管理者モード）：対戦中なら終わらせてから始める
    goTitle();
    Game.stop();
    Sandbox.start();
  };
  Sandbox.init(goTitle);
  $("setting-debug-row").classList.toggle("hidden", !CONFIG.devMode);
  Admin.init().then(applyAdmin);
  applySettings();
  Profile.init();
  Custom.init(); // 名前の色・お気に入りのキャラ・キャラのアイコン（プロフィール画面）
  News.init();
  Ranking.init();
  Records.init();
  Dex.init();
  Achievements.init();
  Backup.init();
  PWA.init(); // アプリとしてインストールできるようにする
  Updates.init(); // アップデートの予告と「更新する」ボタン（タイトル画面）
  Share.init();
  Stamps.init();
  // ハロウィンイベント：「挑戦する」で、おばけ屋敷（CPU対戦）を始める
  Halloween.init((rule, cpu) => startGame("versus", rule, cpu));
  TitleFx.init(); // タイトル画面の演出（goTitle より前に）
  Card.init();
  // キャラの読み込みが終わったら進む Promise（挑戦状は、キャラがそろってから始める）
  let resolveShapesLoaded;
  const shapesLoaded = new Promise((resolve) => (resolveShapesLoaded = resolve));
  // URL に挑戦状が付いていたら読み取る（値がおかしければ、ふつうに始める）
  const received = Challenge.parse(location.search);
  if (received) Challenge.clearUrl();
  // 実績の定義を読み込んだら、称号の表示を最新にし、すでに条件を満たしている実績を達成にする
  Achievements.load().then(() => {
    Profile.refresh();
    Themes.apply(); // 実績のごほうびの背景・土台は、実績を読み込んでから決まる
    Achievements.check(null);
  });
  News.load(); // お知らせを裏で読み込んでおく（未読の赤い点のため）
  LimitedEvents.load(); // 期間限定イベント（今は空。data/events.json）
  Game.init($("game-canvas"), []);
  Themes.apply(); // 選んでいる背景・土台
  goTitle();
  // スプラッシュのあと、未読のお知らせがあればポップアップで出す
  const splashDone = CONFIG.splash.enabled
    ? UI.splash(CONFIG.splash.text, CONFIG.splash.displayTime).then(() => UI.replayAnimations("title"))
    : Promise.resolve();
  // 挑戦状があれば、キャラを読み込み終わってから挑戦状を出す（お知らせはそのあと、次に開いたときに出る）
  splashDone.then(async () => {
    if (received === "invalid") UI.toast("挑戦状のURLが正しくないため、ふつうに始めます");
    if (received && received !== "invalid") {
      await shapesLoaded;
      showChallengePopup(received);
    } else News.popupIfUnread();
    // 実績が新しくなってリセットしたことを、1回だけ知らせる（ほかのポップアップが閉じてから）
    shapesLoaded.then(showEpochNotice);
    // ランキング：前からハイスコアがある人は、ここで載せる（送っていいか、初めてなら聞く）
    shapesLoaded.then(() => Ranking.atStartup());
  });

  // characters.js に書いたキャラを全部読み込み、形（当たり判定）を作る
  // 全員を同時に読み込み始めて、1体終わるごとに読み込み中の表示を進める
  const total = window.CHARACTERS.length;
  let done = 0;
  const showProgress = () => {
    $("loading-count").textContent = `${done} / ${total}`;
    $("loading-bar-fill").style.width = `${(done / total) * 100}%`;
  };
  showProgress();
  // 同じ画像（★4のオーラ版など）の形は1回だけ作って、使い回す
  const shapeCache = {};
  const results = await Promise.all(
    window.CHARACTERS.map(async (c) => {
      try {
        // サイズ違い（variant）は、元のキャラの当たり判定の設定・大きさで形を作ってから、同じ倍率で大きく・小さくする
        const src = c.variant ? window.CHARACTERS.find((x) => x.file === c.file && !x.shared) || c : c;
        const options = Shape.optionsFrom(src);
        const key = `${c.file}|${src.size || DEFAULT_SIZE}|${JSON.stringify(options)}`;
        if (!shapeCache[key]) shapeCache[key] = Shape.create(c.file, src.size || DEFAULT_SIZE, options);
        const base = await shapeCache[key];
        const shape = Object.assign({}, c.variant ? Shape.scaled(base, variantScale(c.variant, base)) : base);
        shape.variant = c.variant || null; // サイズ違いなら "big" / "small"
        shape.id = c.id; // キャラの ID（図鑑・スタンプ・オンライン対戦で、キャラを見分ける）
        shape.name = c.name;
        shape.file = c.file; // 画像の場所
        shape.shared = c.shared; // 別のキャラの画像を使っているか（★4のオーラ版など）
        shape.aura = c.aura && Aura.has(c.aura) ? c.aura : null; // オーラの種類（aura.js）
        shape.event = c.event || null; // 期間限定のキャラなら、イベントの id
        shape.competitive = c.competitive === true; // レア度に関係なく、競技にも出すキャラか（chars.js の inCompetitive）
        // レア度と出やすさ（characters.js の rarity・weight。無ければノーマル・config.js の値）
        shape.rarity = CONFIG.rarity[c.rarity] ? c.rarity : "N";
        shape.weight = Chars.chance(c); // 出やすさ（0 なら出ない。まぼろしなど）
        return shape;
      } catch (e) {
        console.error(e); // 画像が無い・壊れているときは、そのキャラだけ飛ばす
        return null;
      } finally {
        done++;
        showProgress();
      }
    })
  );
  const shapes = results.filter(Boolean); // 読み込めたキャラだけ（characters.js の順番のまま）
  resolveShapesLoaded();

  // 読み込み中の表示を消す
  $("loading").classList.add("done");

  if (!shapes.length) {
    LoadStatus.note("スタート：キャラが1体も読み込めなかったので、押せない");
    $("btn-start").textContent = "キャラ画像を読み込めませんでした";
    return;
  }
  // 輪郭が取れなかった（四角形で代用した）キャラがあれば注意を出す
  if (shapes.some((s) => s.rough)) {
    $("notice").textContent =
      "当たり判定を画像の形から作れなかったため、四角形で代用しています。" +
      "index.html をファイルとして直接開いた場合に起こります。ローカルサーバー経由か GitHub Pages で開いてください（README 参照）。";
    $("notice").classList.remove("hidden");
  }
  Game.setShapes(shapes);
  for (const s of shapes) shapesById[s.id] = s;
  shapesReady = true;
  if (UI.current === "title") Game.startDemo(CONFIG.titleDemo);
  $("btn-start").textContent = "スタート";
  $("btn-start").disabled = false;
  $("btn-start").parentElement.classList.add("ready"); // 脈打つ動きを始める（style.css の .btn-start-wrap.ready）
  LoadStatus.note(`スタート：押せる（キャラ ${shapes.length} / ${total}）`);
})();
