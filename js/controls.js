// =============================================
// controls.js
// パソコンの操作（キーボード・マウス）
//
// ・キーの割り当ては、下の KEYS の1か所にまとめてある（変えるときはここだけ）。
//   e.code（キーボードの配列に関係しない、キーの場所の名前）で書く。例 "KeyA"・"ArrowLeft"・"Space"
// ・ゲーム中：移動（押しっぱなしで動き続ける。Shift で細かく）・回転・落とす・ポーズ
//   相手の番・CPU の番・ポーズ中は、画面のボタンと同じく受け付けない（main.js の canPlay）
// ・メニュー：Tab で選び、Enter で押す（ブラウザのふつうの動き）。Esc で「もどる」と同じ動き。
//   ダイアログは Enter で OK、Esc でキャンセル
// ・文字を入力している間（名前・ルームコードなど）は、ゲームのキーを反応させない
// ・マウスの操作（カーソルで動かす・クリックで落とす・ホイールで回転）は game.js。
//   キーやマウスを初めて使ったときに、その場で操作のヒントを出す（used）
// ・パソコン向けかどうか（設定画面の「操作方法」など）は、機種名ではなく (hover: hover) and (pointer: fine) で決める
// =============================================

const Controls = (() => {
  const $ = (id) => document.getElementById(id);

  // ---------- キーの割り当て（ここを変えると、操作と、設定画面・ヒントの表示の両方が変わる） ----------
  //   keys：e.code の一覧、label：画面に出すキーの名前
  const KEYS = {
    left: { keys: ["ArrowLeft", "KeyA"], label: "← / A", text: "左へ移動" },
    right: { keys: ["ArrowRight", "KeyD"], label: "→ / D", text: "右へ移動" },
    rotateRight: { keys: ["ArrowUp", "KeyW", "KeyE"], label: "↑ / W / E", text: "右回りに回転" },
    rotateLeft: { keys: ["KeyQ"], label: "Q", text: "左回りに回転" },
    drop: { keys: ["Space", "Enter", "NumpadEnter"], label: "Space / Enter", text: "落とす" },
    pause: { keys: ["Escape", "KeyP"], label: "Esc / P", text: "ポーズ（ポーズ中の Esc で再開）" },
  };
  // マウスの操作（説明の表示だけ。動きは game.js）
  const MOUSE = [
    { label: "カーソルを左右に", text: "キャラが追いかける" },
    { label: "左クリック", text: "落とす" },
    { label: "右クリック / ホイール", text: "回転" },
  ];
  const SPEED = 300; // キーで動かす速さ（ゲーム内の単位 / 秒。場の幅が 450）
  const FINE_SPEED = 70; // Shift を押しているときの速さ（細かく動かす）

  const pcQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let hooks = {}; // main.js から渡される { canPlay, pause, resume }
  const held = new Set(); // 押しているキー（移動のキー）
  let fine = false; // Shift を押しているか
  let lastFrame = 0;

  // 名前の一覧（KEYS の名前 → 動き）。e.code → 動きの名前
  function actionOf(code) {
    for (const [name, k] of Object.entries(KEYS)) if (k.keys.includes(code)) return name;
    return null;
  }

  function init(h) {
    hooks = h;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", (e) => {
      const a = actionOf(e.code);
      if (a === "left" || a === "right") held.delete(a);
      fine = e.shiftKey; // Shift を押しているか（キーを押したり離したりするたびに、見なおす）
    });
    // ほかのウィンドウに切りかえたら、押しっぱなしを止める
    window.addEventListener("blur", () => {
      held.clear();
      fine = false;
    });
    renderHelp();
    pcQuery.addEventListener("change", renderHelp);
  }

  // 文字を入力しているところか（名前・ルームコード・合言葉など）
  function typing(e) {
    const t = e.target;
    return !!t && !!t.closest && !!t.closest("input, textarea, select, [contenteditable='true']");
  }

  function onKeyDown(e) {
    fine = e.shiftKey;
    // ダイアログ（確認・お知らせ・競技の説明・挑戦状など）が出ているとき：Enter で OK、Esc でキャンセル
    const dialog = topDialog();
    if (dialog) {
      if (e.key === "Escape") {
        e.preventDefault();
        clickFirst(dialog, ["#dialog-cancel:not(.hidden)", "#comp-dialog-cancel", "#consent-cancel", "#challenge-later", "#share-close", ".btn-sub:not(.hidden)", "#dialog-ok"]);
      } else if (e.key === "Enter" && !typing(e) && !(e.target.closest && e.target.closest(".dialog button"))) {
        // ボタンを選んでいるときは、そのボタンがそのまま押される（ブラウザのふつうの動き）
        e.preventDefault();
        clickFirst(dialog, ["#dialog-ok", "#comp-dialog-ok", "#challenge-accept", ".btn-primary"]);
      }
      return;
    }
    if (typing(e)) return; // 文字を入力している間は、ゲームのキーを反応させない
    const a = actionOf(e.code);

    // ゲーム中（画面が何も開いていない）
    if (UI.current === null) {
      if (!a) return;
      e.preventDefault(); // スペースでページがスクロールしないように
      used("key");
      if (a === "pause") {
        if (!e.repeat && hooks.pause) hooks.pause();
        return;
      }
      if (!hooks.canPlay || !hooks.canPlay()) return; // 相手の番・CPU の番・ポーズ中
      if (a === "left" || a === "right") {
        held.add(a);
        startMoving();
      } else if (a === "rotateRight" && !e.repeat) Game.rotate(1);
      else if (a === "rotateLeft" && !e.repeat) Game.rotate(-1);
      else if (a === "drop" && !e.repeat) Game.drop();
      return;
    }

    // ポーズ中：Esc か P で再開
    if (UI.current === "pause" && a === "pause" && !e.repeat) {
      e.preventDefault();
      if (hooks.resume) hooks.resume();
      return;
    }

    // メニュー：Esc で「もどる」と同じ動き（その画面の、もどるボタンを押す）
    if (e.key === "Escape") {
      const screen = document.querySelector(".screen.active");
      const back = screen && screen.querySelector(".page-header [data-back], .page-header .btn-icon, [data-back], #btn-mode-back, #btn-photo-close");
      if (back) {
        e.preventDefault();
        back.click();
      }
    }
  }

  // いちばん手前に出ているダイアログ（無ければ null）
  function topDialog() {
    const list = [...document.querySelectorAll(".dialog.active, #rank-profile.active")];
    return list.length ? list[list.length - 1] : null;
  }

  // selectors の順に探して、最初に見つかった（見えている）ボタンを押す
  function clickFirst(root, selectors) {
    for (const sel of selectors) {
      const b = root.querySelector(sel);
      if (b && b.offsetParent !== null && !b.disabled) {
        b.click();
        return;
      }
    }
  }

  // 押しっぱなしのあいだ、毎フレーム動かす
  function startMoving() {
    if (lastFrame) return;
    lastFrame = performance.now();
    requestAnimationFrame(moveFrame);
  }

  function moveFrame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!held.size || UI.current !== null) {
      lastFrame = 0;
      held.clear();
      return;
    }
    if (hooks.canPlay && hooks.canPlay() && Game.hasHeld) {
      const dir = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
      if (dir) Game.moveHeldTo(Game.heldX + dir * (fine ? FINE_SPEED : SPEED) * dt);
    }
    requestAnimationFrame(moveFrame);
  }

  // ---------- 操作のヒント ----------
  // キーやマウスを初めて使ったとき（その種類ごとに1回）、画面の下に操作のヒントを少しのあいだ出す
  const shownHint = new Set();
  let hintTimer = null;
  function used(kind) {
    document.body.classList.add(kind === "mouse" ? "using-mouse" : "using-keys");
    if (shownHint.has(kind)) return;
    shownHint.add(kind);
    const el = $("control-hint");
    if (!el) return;
    el.innerHTML =
      kind === "mouse"
        ? MOUSE.map((m) => `<span><kbd>${UI.escape(m.label)}</kbd>${UI.escape(m.text)}</span>`).join("")
        : [
            { label: `${KEYS.left.label.split(" / ")[0]} ${KEYS.right.label.split(" / ")[0]} / ${KEYS.left.label.split(" / ")[1] || ""} ${KEYS.right.label.split(" / ")[1] || ""}`.trim(), text: "移動" },
            { label: KEYS.rotateRight.label, text: "回転" },
            { label: KEYS.drop.label, text: KEYS.drop.text },
            { label: KEYS.pause.label, text: "ポーズ" },
          ].map((k) => `<span><kbd>${UI.escape(k.label)}</kbd>${UI.escape(k.text)}</span>`).join("");
    el.classList.remove("hidden");
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove("show"), 5000);
  }

  // ---------- 操作の一覧（設定画面の「操作方法」・横長の画面の右のパネル） ----------
  function helpHTML() {
    const row = (label, text) => `<li><kbd>${UI.escape(label)}</kbd><span>${UI.escape(text)}</span></li>`;
    return (
      `<h4>マウス</h4><ul class="control-list">${MOUSE.map((m) => row(m.label, m.text)).join("")}</ul>` +
      `<h4>キーボード</h4><ul class="control-list">${Object.values(KEYS).map((k) => row(k.label, k.text)).join("")}` +
      row("Shift ＋ 移動", "細かく動かす") +
      `</ul>`
    );
  }

  function renderHelp() {
    // 設定画面の「操作方法」は、パソコン（マウスなど細かく指せる機器）のときだけ出す
    const row = $("setting-controls");
    if (row) {
      row.classList.toggle("hidden", !pcQuery.matches);
      $("setting-controls-list").innerHTML = helpHTML();
    }
    const side = $("side-keys");
    if (side) side.innerHTML = helpHTML();
  }

  return { init, used, KEYS, get isPc() { return pcQuery.matches; } };
})();
