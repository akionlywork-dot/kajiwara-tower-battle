// =============================================
// admin.js
// 管理者モード（自分だけが使うデバッグ用のメニュー）
//
// 入り口：タイトル画面右下のバージョン表示を、すばやく7回タップする
//
// 合言葉のしくみ（合言葉そのものは、どこにも保存しない）：
//   合言葉 ──(salt を混ぜて SHA-256)──→ 鍵 ──(もう一度 SHA-256)──→ 確認用の番号
//   ・確認用の番号（passHash）だけを config.js に書く。番号から合言葉や鍵は計算できない
//   ・合言葉が合っていたら、鍵をこの端末に保存する（次からは合言葉なしで開ける）
//   ・保存された鍵は、起動のたびに確認用の番号と照らし合わせる
//
// ※ このゲームはファイルを公開しているので、プログラムに詳しい人がブラウザの開発者ツールで
//   プログラム自体を書きかえれば、こじ開けることはできる。ふつうに遊ぶ人には開けない、という仕組み
// =============================================

const Admin = (() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "stack.admin"; // この端末に鍵を保存する場所
  const TAPS = 7; // 入り口：バージョン表示を何回タップするか
  const conf = () => window.GAME_CONFIG.admin || {};
  let unlocked = false;

  // 文字 → SHA-256 の番号（16進数の文字列）
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const keyOf = (pass) => sha256(`${conf().salt}:${pass}`); // 合言葉 → 鍵
  const checkOf = (key) => sha256(`verify:${key}`); // 鍵 → 確認用の番号

  // 鍵が正しいか
  async function isValidKey(key) {
    if (!key || !conf().passHash) return false;
    return (await checkOf(key)) === conf().passHash;
  }

  // 起動時：この端末に正しい鍵が保存されていれば、管理者モードにする
  async function init() {
    setupUI();
    if (!window.crypto || !crypto.subtle) return; // http（暗号の機能が使えない）では開けない
    try {
      if (await isValidKey(localStorage.getItem(KEY))) unlocked = true;
    } catch (e) {}
  }

  // 合言葉で開く。合っていれば true
  async function unlock(pass) {
    const key = await keyOf(pass);
    if (!(await isValidKey(key))) return false;
    try {
      localStorage.setItem(KEY, key);
    } catch (e) {}
    unlocked = true;
    return true;
  }

  // 管理者モードを終わる（この端末の鍵を消す）
  function lock() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
    unlocked = false;
    Settings.set("debug", false);
    Game.setForcedShape(null);
    if (Save.data.profile.titleId === "developer") {
      Save.data.profile.titleId = null;
      Save.write();
    }
  }

  // ---------- 画面 ----------
  function setupUI() {
    // 入り口：バージョン表示を、3秒以内に7回タップ
    let taps = [];
    $("version").addEventListener("click", () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 3000).concat(now);
      if (taps.length >= TAPS) {
        taps = [];
        UI.show("admin");
      }
    });

    UI.onShow("admin", render);

    // 合言葉で開く
    $("btn-admin-unlock").addEventListener("click", async () => {
      const pass = $("admin-pass").value;
      $("admin-pass").value = "";
      if (!window.crypto || !crypto.subtle) {
        $("admin-lock-status").textContent = "この開き方（http）では使えません。https のページで開いてください。";
        return;
      }
      if (await unlock(pass)) {
        UI.toast("管理者モードを開きました");
        if (typeof onChange === "function") onChange();
        render();
      } else {
        $("admin-lock-status").textContent = "合言葉がちがいます。";
      }
    });

    // 合言葉の登録（config.js の passHash がまだ "" のときだけ使う）
    $("btn-admin-make").addEventListener("click", async () => {
      const pass = $("admin-new-pass").value;
      if (pass.length < 8) {
        $("admin-made").textContent = "合言葉は8文字以上にしてください。";
        return;
      }
      if (!window.crypto || !crypto.subtle) {
        $("admin-made").textContent = "この開き方（http）では使えません。Live Server か https のページで開いてください。";
        return;
      }
      const hash = await checkOf(await keyOf(pass));
      $("admin-new-pass").value = "";
      $("admin-made").textContent = `passHash: "${hash}",`;
    });

    // 次に出すキャラ
    $("admin-next").addEventListener("change", (e) => Game.setForcedShape(e.target.value || null));

    // ハロウィンの勝利数を変える（ごほうびの確認用。負けの数はそのまま）
    $("admin-hw-wins").addEventListener("change", (e) => {
      const all = (Save.data.eventStats = Save.data.eventStats || {});
      const r = (all[Halloween.EVENT_ID] = all[Halloween.EVENT_ID] || { wins: 0, losses: 0 });
      r.wins = Number(e.target.value);
      Save.write();
      Achievements.check(null); // 3勝なら実績「かぼちゃの王」
      Themes.apply(); // 使えなくなった背景・土台は元に戻す
      UI.toast(`ハロウィンの勝利数を ${r.wins} にしました`);
    });

    // 図鑑・実績
    $("btn-admin-dex-all").addEventListener("click", () => {
      Dex.setAll(true);
      UI.toast("図鑑を全部登録しました");
    });
    $("btn-admin-dex-reset").addEventListener("click", async () => {
      if (!(await UI.confirm("図鑑をリセットしますか？", "リセット"))) return;
      Dex.setAll(false);
      UI.toast("図鑑をリセットしました");
    });
    $("btn-admin-ach-all").addEventListener("click", () => {
      Achievements.setAll(true);
      UI.toast("実績を全部達成しました");
    });
    $("btn-admin-ach-reset").addEventListener("click", async () => {
      if (!(await UI.confirm("実績をリセットしますか？\n（解放された背景・土台も元に戻ります）", "リセット"))) return;
      Achievements.setAll(false);
      UI.toast("実績をリセットしました");
    });

    // 接続の状態を更新
    $("btn-admin-net").addEventListener("click", renderNet);

    // 終わる
    $("btn-admin-lock").addEventListener("click", async () => {
      if (!(await UI.confirm("管理者モードを終わりますか？\n次に開くときは、合言葉が必要です。", "終わる"))) return;
      lock();
      if (typeof onChange === "function") onChange();
      UI.show("title");
    });
  }

  let onChange = null; // 管理者モードが開いた・閉じたときに main.js に知らせる

  function render() {
    const hasPass = !!conf().passHash;
    $("admin-locked").classList.toggle("hidden", unlocked);
    $("admin-panel").classList.toggle("hidden", !unlocked);
    $("admin-unlock-area").classList.toggle("hidden", !hasPass);
    $("admin-setup-area").classList.toggle("hidden", hasPass);
    $("admin-lock-status").textContent = "";
    if (!unlocked) return;
    // 次に出すキャラの選択肢
    const select = $("admin-next");
    const current = select.value;
    select.innerHTML =
      `<option value="">ランダム（ふつう）</option>` +
      window.CHARACTERS.map((c) => `<option value="${UI.escape(c.id)}">${UI.escape(c.name)}（${UI.escape(c.rarity || "N")}）</option>`).join("");
    select.value = current;
    $("admin-hw-wins").value = String(Math.min(3, Records.eventWins(Halloween.EVENT_ID)));
    // 管理者メニューのスイッチを、今の設定に合わせる
    for (const t of document.querySelectorAll("#admin-panel .toggle[data-setting]")) t.setAttribute("aria-checked", String(Settings.get(t.dataset.setting)));
    renderNet();
  }

  // オンライン対戦の接続の状態
  function renderNet() {
    const d = Online.debug;
    $("admin-net").textContent = [
      `つながり方：${Online.kind || "なし"}`,
      `待ち受け：直接 ${d.waitState.direct} ／ 中継 ${d.waitState.relay}`,
      `直接（PeerJS）：${d.peer ? (d.peer.disconnected ? "切断" : "接続中") + " id=" + d.peer.id : "なし"}`,
      `中継（MQTT）：${d.relay ? (d.relay.connected ? "接続中" : "切断") : "なし"}`,
      `中継サーバー：${(window.GAME_CONFIG.online.relayBrokers || []).join(", ")}`,
    ].join("\n");
  }

  return {
    init,
    get unlocked() { return unlocked; },
    set onChange(fn) { onChange = fn; },
  };
})();
