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
    if (Game.playing) Game.setTurnTimeLimit(turnTimeLimit());
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
  function startGame(newMode) {
    mode = newMode;
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
        onLand: () => Sound.play("place"),
        onSettled: onSettled,
        onFall: () => Sound.play("fall"),
        onGameOver: showResult,
      },
      { turnTimeLimit: turnTimeLimit() }
    );
    applySettings();
    Sound.startBgm();
    updateHud();
    if (mode === "versus") showTurnBanner();
  }

  // 全員が止まった ＝ 1手成功
  function onSettled(stats) {
    stacked++;
    maxHeight = Math.max(maxHeight, stats.height);
    Records.addPiece();
    if (droppedShape) Dex.register(droppedShape.file);
    Achievements.check(gameStatus()); // 「10体積んだ」などの実績を、ゲーム中に判定する
    if (mode === "versus") {
      player = player === 1 ? 2 : 1; // 手番を交代
      showTurnBanner();
    }
    Game.nextPiece();
    updateHud();
  }

  // 1人モードのスコア ＝ 積んだ数 × 1体の点数 ＋ 高さ(m) × 1mの点数（配点は config.js）
  function calcScore() {
    return stacked * CONFIG.score.perPiece + Math.floor(maxHeight * CONFIG.score.perMeter);
  }

  // 今のゲームの状況（実績の判定に使う）
  function gameStatus() {
    return { mode, count: stacked, height: maxHeight, score: calcScore() };
  }

  // ---------- 上部の表示 ----------
  function updateHud() {
    const sub = `${stacked}体 ／ ${maxHeight.toFixed(2)}m`;
    if (mode === "solo") {
      $("hud-info").innerHTML = `<span class="big">${calcScore()}</span> 点<br>${sub}`;
    } else {
      $("hud-info").innerHTML = `<span class="player-tag p${player}">${UI.escape(Save.playerName(player))} の番</span><br>${sub}`;
    }
  }

  // 「〇〇 の番」を大きく表示する
  function showTurnBanner() {
    const el = $("turn-banner");
    el.textContent = `${Save.playerName(player)} の番`;
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
      const isNew = Records.addSoloResult(score, stacked, maxHeight); // 戦績に記録（ハイスコアも更新）
      const best = Save.data.stats.best;
      lastResult = { mode, score, count: stacked, height: maxHeight, isNewRecord: isNew };

      box.innerHTML =
        Profile.badgeHTML() +
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
      Records.addVersusResult(winner); // 戦績に記録
      lastResult = { mode, winner, loser, count: stacked, height: maxHeight };

      box.innerHTML =
        `<div class="winner p${winner}"><span class="winner-name">${UI.escape(Save.playerName(winner))}</span><small>の勝ち！</small></div>` +
        `<p class="result-sub">${UI.escape(Save.playerName(loser))} が落としました…</p>` +
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
  on("btn-mode-back", () => UI.show("title"));
  // ゲーム中
  on("btn-pause", pauseGame);
  on("btn-rotate", () => Game.rotate());
  on("btn-drop", () => Game.drop());
  // ポーズ
  on("btn-resume", resumeGame);
  on("btn-restart", () => startGame(mode));
  on("btn-pause-settings", () => openSettings("pause"));
  on("btn-pause-title", goTitle);
  // 設定
  on("btn-settings-back", () => UI.show(settingsReturnTo));
  // リザルト
  on("btn-retry", () => startGame(mode));
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
  // 実績の定義を読み込んだら、称号の表示を最新にし、すでに条件を満たしている実績を達成にする
  Achievements.load().then(() => {
    Profile.refresh();
    Achievements.check(null);
  });
  News.load(); // お知らせを裏で読み込んでおく（未読の赤い点のため）
  Game.init($("game-canvas"), []);
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
  shapesReady = true;
  if (UI.current === "title") Game.startDemo(CONFIG.titleDemo);
  $("btn-start").textContent = "スタート";
  $("btn-start").disabled = false;
})();
