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
  let mode = "solo"; // "solo"=1人スコアアタック / "versus"=2人対戦
  let ruleId = null; // 特殊ルールの名前（ふつうのルールなら null）
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
  let settingsReturnTo = "title"; // 設定画面を閉じたときに戻る画面
  let shapesReady = false; // キャラの読み込みが終わったか

  // 最後のゲームの結果（将来、SNS共有でスコアを投稿するときに使う）
  let lastResult = null;

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
    Game.setDebug(CONFIG.devMode && Settings.get("debug"));
    if (Game.playing && !isCpuTurn()) Game.setTurnTimeLimit(turnTimeLimit());
  }

  function turnTimeLimit() {
    return Settings.get("timer") ? CONFIG.turnTimeLimit : 0;
  }

  // 設定画面のスイッチ（data-setting="bgm" などの名前で、どの設定か分かる）
  $("timer-desc").textContent = `1手 ${CONFIG.turnTimeLimit}秒・時間切れで自動で落ちる`;
  const toggles = document.querySelectorAll(".toggle[data-setting]");
  function updateToggles() {
    for (const t of toggles) t.setAttribute("aria-checked", String(Settings.get(t.dataset.setting)));
  }
  for (const t of toggles) {
    t.addEventListener("click", () => {
      const name = t.dataset.setting;
      Settings.set(name, !Settings.get(name));
      updateToggles();
      applySettings();
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
    showThinking(false);
    if (online) leaveOnline(); // オンライン対戦中なら、接続を切る
    if (mode === "online") mode = "solo";
    Game.stop();
    UI.clearConfetti();
    $("turn-banner").className = "hidden";
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

  // ---------- ゲーム開始 ----------
  // newRuleId: 特殊ルールの名前（config.js の rules の名前）。ふつうのルールなら null
  // newCpu: CPU対戦の強さ。人どうしの対戦や1人モードなら null
  function startGame(newMode, newRuleId = null, newCpu = null) {
    mode = newMode;
    ruleId = newRuleId;
    cpuLevel = newCpu;
    gameToken++;
    showThinking(false);
    Game.setInputEnabled(true);
    player = 1;
    lastDropper = 1;
    stacked = 0;
    maxHeight = 0;
    droppedShape = null;
    UI.clearConfetti();
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
          showRareBanner(shape, info);
          if (mode === "online") Online.send({ t: "rare", f: shape.file });
        },
        onSettled: onSettled,
        onFall: () => playSe("fall"),
        onGameOver: showResult,
      },
      // オンライン対戦では制限時間を使わない
      { turnTimeLimit: mode === "online" ? 0 : turnTimeLimit(), rule: Rules.get(ruleId) }
    );
    applySettings();
    Sound.startBgm();
    updateHud();
    if (isVs()) showTurnBanner();
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
    Records.addPiece();
    if (droppedShape) Dex.register(droppedShape.file);
    Achievements.check(gameStatus()); // 「10体積んだ」などの実績を、ゲーム中に判定する
    if (isVs()) {
      player = player === 1 ? 2 : 1; // 手番を交代
      showTurnBanner();
    }
    // オンライン対戦（ホスト）：相手に手番の交代を知らせる
    if (mode === "online") {
      Online.send({ t: "turn", p: player, n: stacked, h: maxHeight, f: droppedShape ? droppedShape.file : null });
    }
    Game.nextPiece();
    updateHud();
    if (isCpuTurn()) runCpuTurn();
    else if (cpuLevel) startHumanTurn();
    else if (mode === "online") Game.setInputEnabled(!isRemoteTurn()); // 相手の手番は操作できない
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
  let shapesByFile = {}; // ファイル名 → キャラの形（ゲストがレア演出を出すときに使う）
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
    const code = $("online-code-input").value.replace(/\D/g, "");
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
      onConnected: () => {
        online = { role, me: role === "host" ? 1 : 2, names: { 1: "", 2: "" } };
        online.names[online.me] = Save.playerName(1);
        Online.send({ t: "hello", name: Save.playerName(1) });
        $(role === "host" ? "online-host-status" : "online-join-status").textContent = "つながりました！";
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

  // 接続が切れた
  function onDisconnected() {
    const wasPlaying = !!online;
    online = null;
    clearInterval(sendTimer);
    $("btn-online-connect").disabled = false;
    if (!wasPlaying && UI.current !== "online") return;
    UI.alert("接続が切れました").then(goTitle);
  }

  // 自分から対戦をやめる
  function leaveOnline() {
    Online.leave();
    online = null;
    clearInterval(sendTimer);
  }

  // ---------- ホスト ----------
  function hostMessage(msg) {
    if (!online) return;
    if (msg.t === "hello") {
      online.names[2] = String(msg.name || "プレイヤー2").slice(0, 10);
      setTimeout(startOnlineHost, 800); // 「つながりました！」を少し見せてから始める
    } else if (msg.t === "pose" && isRemoteTurn()) {
      Game.setHeldPose(msg.x, msg.a); // 相手が動かしているキャラ
    } else if (msg.t === "drop" && isRemoteTurn()) {
      Game.setHeldPose(msg.x, msg.a);
      Game.drop();
    } else if (msg.t === "rematch" && UI.current === "result") {
      startOnlineHost(); // 相手が「もう一度」を押した
    }
  }

  // ホスト：オンライン対戦を始める
  function startOnlineHost() {
    if (!online) return;
    Online.send({ t: "start", names: online.names });
    startGame("online");
    Game.setInputEnabled(true); // ホストが先攻
    // 1秒に20回、状態をゲストに送る
    clearInterval(sendTimer);
    sendTimer = setInterval(() => {
      if (online && mode === "online") Online.send({ t: "s", d: Game.snapshot(), p: player });
    }, 50);
  }

  // ---------- ゲスト ----------
  function guestMessage(msg) {
    if (!online) return;
    if (msg.t === "hello") {
      online.names[1] = String(msg.name || "プレイヤー1").slice(0, 10);
    } else if (msg.t === "start") {
      online.names = Object.assign(online.names, msg.names, { 2: Save.playerName(1) });
      startOnlineGuest();
    } else if (msg.t === "s" && mode === "online") {
      if (msg.p !== player) {
        player = msg.p;
        updateHud();
      }
      Game.applySnapshot(msg.d, player === online.me);
    } else if (msg.t === "turn" && mode === "online") {
      // 1体積めて、手番が交代した
      player = msg.p;
      stacked = msg.n;
      maxHeight = msg.h;
      Records.addPiece();
      if (msg.f) Dex.register(msg.f);
      Achievements.check(gameStatus());
      showTurnBanner();
      updateHud();
    } else if (msg.t === "se") {
      Sound.play(msg.name);
    } else if (msg.t === "rare") {
      const shape = shapesByFile[msg.f];
      if (shape) showRareBanner(shape, CONFIG.rarity[shape.rarity]);
    } else if (msg.t === "over") {
      stacked = msg.n;
      maxHeight = msg.h;
      lastDropper = msg.loser;
      showResult();
    }
  }

  // ゲスト：オンライン対戦を始める（物理計算はせず、届いた状態を描く）
  function startOnlineGuest() {
    mode = "online";
    ruleId = null;
    cpuLevel = null;
    gameToken++;
    player = 1;
    stacked = 0;
    maxHeight = 0;
    UI.clearConfetti();
    UI.show(null);
    Game.startRemote({
      dropOnRelease: () => Settings.get("release"),
      // 自分の手番で「落とす」を押したら、位置と角度をホストに送る
      onRemoteDrop: (x, a) => Online.send({ t: "drop", x, a }),
    });
    Game.setInputEnabled(true);
    Sound.startBgm();
    updateHud();
    showTurnBanner();
    // 自分の手番の間、持っているキャラの位置と角度をホストに送る（相手の画面に映すため）
    clearInterval(sendTimer);
    lastPoseSent = "";
    sendTimer = setInterval(() => {
      if (!online || mode !== "online" || isRemoteTurn()) return;
      const pose = Game.heldPose();
      if (!pose) return;
      const key = `${Math.round(pose.x)},${pose.angle.toFixed(3)}`;
      if (key === lastPoseSent) return; // 動いていなければ送らない
      lastPoseSent = key;
      Online.send({ t: "pose", x: pose.x, a: pose.angle });
    }, 100);
  }

  function showThinking(on) {
    const el = $("cpu-thinking");
    el.classList.toggle("hidden", !on);
    if (on) el.innerHTML = `${UI.escape(nameOf(2))}<br>考え中<span class="dots"></span>`;
  }

  // 1人モードのスコア ＝ 積んだ数 × 1体の点数 ＋ 高さ(m) × 1mの点数（配点は config.js）
  function calcScore() {
    return stacked * CONFIG.score.perPiece + Math.floor(maxHeight * CONFIG.score.perMeter);
  }

  // 今のゲームの状況（実績の判定に使う）
  function gameStatus() {
    return { mode, rule: ruleId, count: stacked, height: maxHeight, score: calcScore() };
  }

  // 特殊ルールの名前の札（ふつうのルールなら ""）
  function ruleTag() {
    const r = Rules.get(ruleId);
    return r ? `<span class="rule-tag">${r.params.icon || ""} ${UI.escape(r.params.name)}</span>` : "";
  }

  // ---------- 上部の表示 ----------
  function updateHud() {
    const sub = `${stacked}体 ／ ${maxHeight.toFixed(2)}m`;
    if (mode === "solo") {
      $("hud-info").innerHTML = `<span class="big">${calcScore()}</span> 点 ${ruleTag()}<br>${sub}`;
    } else {
      $("hud-info").innerHTML = `<span class="player-tag p${player}">${UI.escape(nameOf(player))} の番</span><br>${sub}`;
    }
  }

  // レアキャラが出たときの「レア！」「スーパーレア！！」
  function showRareBanner(shape, info) {
    const el = $("rare-banner");
    el.innerHTML = `<span>${info.stars >= 3 ? "スーパーレア！！" : "レア！"}</span><small>${UI.escape(shape.name)}</small>`;
    el.style.setProperty("--rare-color", info.color);
    el.className = info.stars >= 3 ? "rare-banner super" : "rare-banner";
    el.style.animation = "none"; // アニメーションを最初から
    void el.offsetWidth;
    el.style.animation = "";
    Sound.play("rare");
  }

  // 「〇〇 の番」を大きく表示する
  function showTurnBanner() {
    const el = $("turn-banner");
    el.textContent = `${nameOf(player)} の番`;
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

    if (mode === "solo") {
      const score = calcScore();
      // 戦績に記録（ハイスコアも更新）。特殊ルールのハイスコアは、ルールごとに別に記録する
      const isNew = ruleId
        ? Records.addRuleResult(ruleId, score, stacked, maxHeight)
        : Records.addSoloResult(score, stacked, maxHeight);
      const best = ruleId ? Save.data.stats.ruleBest[ruleId] : Save.data.stats.best;
      lastResult = { mode, rule: ruleId, score, count: stacked, height: maxHeight, isNewRecord: isNew };

      box.innerHTML =
        Profile.badgeHTML() +
        (ruleId ? `<div class="result-rule">${ruleTag()}</div>` : "") +
        (isNew ? `<div class="new-record">NEW RECORD!</div>` : `<h2 class="result-heading">ゲームオーバー</h2>`) +
        `<div class="result-score"><span id="result-score-num">0</span><small> 点</small></div>` +
        `<div class="result-stats">` +
        `<div>積んだ数<b>${stacked}体</b></div>` +
        `<div>高さ<b>${maxHeight.toFixed(2)}m</b></div>` +
        `<div>ハイスコア<b>${best.score}</b></div>` +
        `</div>`;
      UI.countUp($("result-score-num"), score, 900);
      if (isNew) {
        Sound.play("record");
        UI.confetti(["#ffd84d", "#ff7a59", "#4cd964", "#3d8bff", "#ff5d73"]);
      } else {
        Sound.play("gameover");
      }
    } else {
      const loser = lastDropper;
      const winner = loser === 1 ? 2 : 1;
      // 戦績に記録（CPU対戦・オンライン対戦は、人どうしの対戦とは別に数える）
      if (mode === "online") {
        clearInterval(sendTimer);
        // ホストは、ゲストにも結果を知らせる
        if (online && online.role === "host") Online.send({ t: "over", loser, n: stacked, h: maxHeight });
        if (online) Records.addOnlineResult(winner === online.me);
      } else if (cpuLevel) Records.addCpuResult(cpuLevel, winner === 1);
      else Records.addVersusResult(winner);
      lastResult = { mode, cpu: cpuLevel, winner, loser, count: stacked, height: maxHeight };

      // オンライン対戦では「あなたの勝ち／負け」も出す
      const youText = mode === "online" && online ? (winner === online.me ? "あなたの勝ち！" : "あなたの負け…") : "";
      box.innerHTML =
        (youText ? `<p class="result-you">${youText}</p>` : "") +
        `<div class="winner p${winner}"><span class="winner-name">${UI.escape(nameOf(winner))}</span><small>の勝ち！</small></div>` +
        `<p class="result-sub">${UI.escape(nameOf(loser))} が落としました…</p>` +
        `<div class="result-stats">` +
        `<div>積んだ数<b>${stacked}体</b></div>` +
        `<div>高さ<b>${maxHeight.toFixed(2)}m</b></div>` +
        `</div>`;
      Sound.play("record");
      const color = winner === 1 ? "#ff5d73" : "#3d8bff";
      UI.confetti([color, "#ffffff", "#ffd84d"]);
    }
    // 戦績を記録したあとで、実績を判定する（「10回プレイ」「対戦で10勝」など）
    Achievements.check(gameStatus());
    UI.show("result");
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
  // モード選択
  on("btn-solo", () => startGame("solo"));
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
  // ポーズ
  on("btn-resume", resumeGame);
  on("btn-restart", () => startGame(mode, ruleId, cpuLevel));
  on("btn-pause-settings", () => openSettings("pause"));
  on("btn-pause-title", goTitle);
  // 設定
  on("btn-settings-back", () => UI.show(settingsReturnTo));
  // リザルト
  on("btn-retry", () => {
    if (mode !== "online") return startGame(mode, ruleId, cpuLevel);
    // オンライン対戦：ホストはすぐ始める。ゲストはホストに頼んで、始めてもらう
    if (!online) return goTitle();
    if (online.role === "host") startOnlineHost();
    else {
      Online.send({ t: "rematch" });
      UI.toast("相手に「もう一度」を送りました");
    }
  });

  // 特殊ルールを選ぶ画面：rules.js にあるルールを並べる
  UI.onShow("rules", () => {
    $("rules-list").innerHTML = Rules.list()
      .map((r) => {
        const best = Save.data.stats.ruleBest[r.id];
        return `
          <button class="list-row rule-row" data-rule="${r.id}">
            <span class="rule-icon">${r.params.icon || ""}</span>
            <span class="rule-main">
              <b>${UI.escape(r.params.name)}</b>
              <small>${UI.escape(r.params.description || "")}</small>
            </span>
            <span class="rule-best">${best ? `ハイスコア<b>${best.score}</b>` : ""}</span>
          </button>`;
      })
      .join("");
  });
  $("rules-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-rule]");
    if (row) startGame("solo", row.dataset.rule);
  });
  on("btn-result-title", goTitle);

  // ---------- 起動 ----------
  // 1. スプラッシュ画面（会社名）を出す。その裏でタイトル画面を用意し、キャラを読み込む
  // 2. スプラッシュが消えたら、タイトルのアニメーションを再生
  // スプラッシュをタップすると、それが「最初の操作」になって音が鳴らせるようになる
  //（音の有効化は、上の unlockOnce がすべてのタップで行っている）
  $("version").textContent = CONFIG.version;
  $("setting-debug-row").classList.toggle("hidden", !CONFIG.devMode);
  applySettings();
  Profile.init();
  News.init();
  Ranking.init();
  Records.init();
  Dex.init();
  Achievements.init();
  Backup.init();
  // 実績の定義を読み込んだら、称号の表示を最新にし、すでに条件を満たしている実績を達成にする
  Achievements.load().then(() => {
    Profile.refresh();
    Achievements.check(null);
  });
  News.load(); // お知らせを裏で読み込んでおく（未読の赤い点のため）
  Game.init($("game-canvas"), []);
  Themes.apply(); // 選んでいる背景・土台
  goTitle();
  // スプラッシュのあと、未読のお知らせがあればポップアップで出す
  const splashDone = CONFIG.splash.enabled
    ? UI.splash(CONFIG.splash.text, CONFIG.splash.displayTime).then(() => UI.replayAnimations("title"))
    : Promise.resolve();
  splashDone.then(() => News.popupIfUnread());

  // characters.js に書いたキャラを全部読み込み、形（当たり判定）を作る
  // 全員を同時に読み込み始めて、1体終わるごとに読み込み中の表示を進める
  const total = window.CHARACTERS.length;
  let done = 0;
  const showProgress = () => {
    $("loading-count").textContent = `${done} / ${total}`;
    $("loading-bar-fill").style.width = `${(done / total) * 100}%`;
  };
  showProgress();
  const results = await Promise.all(
    window.CHARACTERS.map(async (c) => {
      try {
        const shape = await Shape.create(c.file, c.size || DEFAULT_SIZE, Shape.optionsFrom(c));
        shape.name = c.name;
        shape.file = c.file; // タイトルのデモで、ファイル名からキャラを探すため
        // レア度と出やすさ（characters.js の rarity・weight。無ければノーマル・config.js の値）
        shape.rarity = CONFIG.rarity[c.rarity] ? c.rarity : "N";
        shape.weight = typeof c.weight === "number" ? c.weight : CONFIG.rarity[shape.rarity].weight;
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

  // 読み込み中の表示を消す
  $("loading").classList.add("done");

  if (!shapes.length) {
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
  for (const s of shapes) shapesByFile[s.file] = s;
  shapesReady = true;
  if (UI.current === "title") Game.startDemo(CONFIG.titleDemo);
  $("btn-start").textContent = "スタート";
  $("btn-start").disabled = false;
})();
