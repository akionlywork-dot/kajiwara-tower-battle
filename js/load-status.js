// =============================================
// load-status.js
// 読み込みの状況を、画面の左下に小さく出す（開発中の確認用）
//
// 出すのは、config.js の devMode が true のときか、URL の最後に ?debug=1 を付けて開いたとき、
// 管理者メニューの「読み込み状況」が ON のときだけ（記録は、いつもしておく）。
// 「まだ終わっていない読み込み」と「起きたエラー」を並べる（iPhone など、開発者ツールを開けない端末で、
// 「読み込み中…」のまま進まない・ボタンが押せない原因を探すため）。
// 表示はタップを受け取らない（pointer-events: none）ので、下のボタンの邪魔をしない
//
// 使い方：const done = LoadStatus.begin("画像 images/chara01.webp"); … done(true か false);
// =============================================

const LoadStatus = (() => {
  const enabled = (() => {
    try {
      return !!(window.GAME_CONFIG && window.GAME_CONFIG.devMode) || new URLSearchParams(location.search).get("debug") === "1";
    } catch (e) {
      return false;
    }
  })();
  let visible = enabled; // 画面に出すか（管理者メニューで切りかえる）
  const pending = new Map(); // 読み込み中のもの（名前 → 始めた時刻）
  const lines = []; // 終わったこと・エラー（新しいものが上）
  let box = null;
  let timer = null;

  // 読み込みを始めた。終わったら、返した関数を ok（true / false）で呼ぶ
  function begin(name) {
    pending.set(name, Date.now());
    render();
    let finished = false;
    return (ok = true, note = "") => {
      if (finished) return;
      finished = true;
      const ms = Date.now() - (pending.get(name) || Date.now());
      pending.delete(name);
      if (!ok) add(`✗ ${name}（${ms}ms）${note ? " " + note : ""}`);
      render();
    };
  }

  // 1行の知らせ（例：「スタート：押せる」）
  function note(text) {
    add(`● ${text}`);
    render();
  }

  function add(text) {
    lines.unshift(text);
    if (lines.length > 12) lines.length = 12;
  }

  function render() {
    if (!visible) {
      if (box) box.classList.add("hidden");
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.id = "load-status";
      box.className = "load-status";
      (document.body || document.documentElement).appendChild(box);
    }
    // 長く終わらないものが分かるよう、経過時間も出す（1秒ごとに書きなおす）
    const now = Date.now();
    const wait = [...pending.entries()].map(([name, t]) => `… ${name}（${((now - t) / 1000).toFixed(0)}秒）`);
    box.classList.remove("hidden");
    box.textContent = ["読み込みの状況（開発用）", ...(wait.length ? wait : ["… 読み込み中のものはありません"]), ...lines].join("\n");
    clearTimeout(timer);
    if (pending.size) timer = setTimeout(render, 1000);
  }

  // 管理者メニュー：表示する・しない（devMode・?debug=1 のときは、いつも出す）
  function setVisible(on) {
    visible = enabled || !!on;
    render();
  }

  // エラー（プログラムの止まり・読み込めなかったファイル）も出す
  {
    window.addEventListener("error", (e) => {
      add(`✗ エラー：${e.message || (e.target && (e.target.src || e.target.href)) || "?"}${e.filename ? `（${e.filename.split("/").pop()}:${e.lineno}）` : ""}`);
      render();
    }, true);
    window.addEventListener("unhandledrejection", (e) => {
      add(`✗ エラー：${(e.reason && e.reason.message) || e.reason}`);
      render();
    });
    document.addEventListener("DOMContentLoaded", render);
  }

  return { begin, note, setVisible, enabled };
})();
