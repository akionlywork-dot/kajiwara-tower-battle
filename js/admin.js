// =============================================
// admin.js
// 管理者モード（自分だけが使うデバッグ用のメニュー）
//
// 入り口：タイトル画面右下のバージョン表示を、すばやく7回タップする（開いたあとは、ホームの右上の 🛠 から開ける）
//
// できること：アップデート予告（updates.js・server/ranking.gs）・自由配置モード（sandbox.js）・
//   表示の切りかえ（当たり判定・FPS・キャラの数と高さ・読み込み状況）・日付を変えてテスト・イベントの確認・次に出すキャラ・
//   解放状態の操作（元に戻せる）・出現率のテスト・データのリセット
// メニューは見出しごとに折りたためる（<details>）。開いている見出しはこの端末に覚えておき、
//   閉じていても分かるように、見出しの横に今の状態（例「テスト日付 10/31」「マイケル」）を出す
// 管理者モードのあいだは、ハイスコアをオンラインのランキングに送らない（ranking.js）。オンライン対戦では、
//   次に出すキャラ・テスト日付・イベントの確認表示を使わない（game.js の fair）。相手に見せる数字も送らない（vs-intro.js）
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
    if (unlocked) {
      restoreTestDate();
      migrateDeveloper();
    }
    applyDisplay();
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
    setTestDate(null); // 実際の日付に戻す
    applyDisplay(); // FPS などの表示を消す
    // スタッフの称号（開発者など）は、獲得したものを残す（管理者モードを終えても、この端末で選べる）
  }

  // ---------- スタッフの称号（開発者・管理者・社員・運営。frames.js の STAFF） ----------
  // 前は、管理者モードの端末ならいつでも「開発者」を選べた。そのような端末では、1回だけ「開発者」を獲得ずみにする
  // （つけていた称号が外れないように。そのあとは、ほかの称号と同じく、獲得・リセットで決める）
  function migrateDeveloper() {
    const meta = Save.data.meta;
    if (meta.staffMigrated) return;
    meta.staffMigrated = true;
    Save.data.staffTitles = Save.data.staffTitles || {};
    if (!Save.data.staffTitles.developer) Save.data.staffTitles.developer = new Date().toISOString();
    Save.write();
  }

  // 1つずつ、獲得・リセット
  function setStaff(id, on) {
    const all = (Save.data.staffTitles = Save.data.staffTitles || {});
    if (on) all[id] = new Date().toISOString();
    else {
      delete all[id];
      if (Save.data.profile.titleId === id) Save.data.profile.titleId = null; // つけていた称号なら外す
    }
    Save.write();
    Profile.refresh();
    renderStaff();
    UI.toast(`称号「${Frames.STAFF[id].title}」を${on ? "獲得しました" : "リセットしました"}`);
  }

  function renderStaff() {
    const all = Save.data.staffTitles || {};
    $("admin-staff").innerHTML = Object.entries(Frames.STAFF)
      .map(([id, s]) => {
        const got = !!all[id];
        const frame = Frames.staff(id);
        return `
          <div class="admin-staff-row">
            <span class="avatar avatar-empty admin-staff-avatar ${Frames.avatarClass(frame)}">${UI.escape([...s.title][0])}</span>
            <span class="admin-staff-main">${Frames.titleHTML(s.title, frame)}<small>${got ? "獲得ずみ" : "まだ獲得していない"}</small></span>
            <button class="btn btn-small ${got ? "btn-sub" : "btn-primary"}" data-staff="${id}" data-on="${got ? "0" : "1"}">${got ? "リセット" : "獲得"}</button>
          </div>`;
      })
      .join("");
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
    $("admin-next").addEventListener("change", (e) => {
      Game.setForcedShape(e.target.value || null);
      renderSections();
    });

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

    // スタッフの称号：獲得・リセット
    $("admin-staff").addEventListener("click", (e) => {
      const b = e.target.closest("[data-staff]");
      if (b) setStaff(b.dataset.staff, b.dataset.on === "1");
    });

    // 自由配置モード（sandbox.js。始める前の後かたづけは main.js）
    $("btn-admin-sandbox").addEventListener("click", () => {
      if (typeof onStartSandbox === "function") onStartSandbox();
    });

    // 日付を変えてテスト
    $("btn-admin-date-set").addEventListener("click", () => {
      const v = $("admin-date").value; // "2026-10-31T18:00"
      const date = v ? new Date(v) : null;
      if (!date || isNaN(date)) return UI.toast("日付を入れてください");
      setTestDate(date);
      UI.toast(`テスト日付を ${date.getMonth() + 1}/${date.getDate()} にしました`);
    });
    $("btn-admin-date-clear").addEventListener("click", () => {
      setTestDate(null);
      UI.toast("実際の日付に戻しました");
    });

    // 解放状態：すべて解放・すべて未解放・元に戻す
    $("btn-admin-unlock-all").addEventListener("click", () => setUnlocked(true));
    $("btn-admin-lock-all").addEventListener("click", () => setUnlocked(false));
    $("btn-admin-undo").addEventListener("click", undoUnlocked);

    // 出現率のテスト
    $("btn-admin-draw").addEventListener("click", renderDrawTest);

    // データのリセット
    $("btn-admin-reset").addEventListener("click", resetData);
    // 接続の状態を更新
    $("btn-admin-net").addEventListener("click", renderNet);

    // アップデート予告
    $("btn-admin-notice-set").addEventListener("click", setNotice);
    $("btn-admin-notice-clear").addEventListener("click", clearNotice);
    $("btn-admin-notice-reload").addEventListener("click", async () => {
      $("admin-notice-state").textContent = "読みこみ中…";
      await Updates.refresh();
      renderNotice(true);
    });
    // 日時のかんたん入力：〇分後・今夜/明日の21時
    for (const b of document.querySelectorAll("[data-notice-in], [data-notice-day]")) {
      b.addEventListener("click", () => {
        const d = new Date();
        if (b.dataset.noticeIn) d.setMinutes(d.getMinutes() + Number(b.dataset.noticeIn), 0, 0);
        else {
          d.setDate(d.getDate() + Number(b.dataset.noticeDay));
          d.setHours(21, 0, 0, 0);
        }
        $("admin-notice-at").value = localInput(d);
      });
    }

    setupSections();

    // 終わる
    $("btn-admin-lock").addEventListener("click", async () => {
      if (!(await UI.confirm("管理者モードを終わりますか？\n次に開くときは、合言葉が必要です。", "終わる"))) return;
      lock();
      if (typeof onChange === "function") onChange();
      UI.show("title");
    });
  }

  let onChange = null; // 管理者モードが開いた・閉じたときに main.js に知らせる
  let onStartSandbox = null; // 自由配置モードを始める（main.js）

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
    const table = window.GAME_CONFIG.rarity || {};
    const ids = Object.keys(table).sort((a, b) => table[a].stars - table[b].stars);
    select.innerHTML =
      `<option value="">ランダム（ふつう）</option>` +
      ids
        .map((rid) => {
          const list = window.CHARACTERS.filter((c) => (table[c.rarity] ? c.rarity : "N") === rid);
          if (!list.length) return "";
          const label = `${"★".repeat(table[rid].stars)} ${table[rid].name}`;
          return `<optgroup label="${UI.escape(label)}">${list.map((c) => `<option value="${UI.escape(c.id)}">${UI.escape(c.name)}</option>`).join("")}</optgroup>`;
        })
        .join("");
    select.value = current;
    $("admin-hw-wins").value = String(Math.min(3, Records.eventWins(Halloween.EVENT_ID)));
    // 管理者メニューのスイッチを、今の設定に合わせる
    for (const t of document.querySelectorAll("#admin-panel .toggle[data-setting]")) t.setAttribute("aria-checked", String(Settings.get(t.dataset.setting)));
    renderDate();
    renderUndo();
    renderStaff();
    renderNet();
    renderNotice(true);
    Updates.refresh().then(() => UI.current === "admin" && renderNotice());
    renderSections();
  }

  // ---------- 見出しの折りたたみ ----------
  const OPEN_KEY = "stack.admin.open"; // 開いている見出し（data-sec の一覧）

  function setupSections() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
    } catch (e) {}
    const secs = [...document.querySelectorAll("#admin-panel .admin-sec")];
    if (Array.isArray(saved)) for (const d of secs) d.open = saved.includes(d.dataset.sec);
    const save = () => {
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(secs.filter((d) => d.open).map((d) => d.dataset.sec)));
      } catch (e) {}
    };
    for (const d of secs) d.addEventListener("toggle", save);
    $("btn-admin-open-all").addEventListener("click", () => secs.forEach((d) => (d.open = true)));
    $("btn-admin-close-all").addEventListener("click", () => secs.forEach((d) => (d.open = false)));
    // スイッチを押したら、見出しの状態も書きなおす（スイッチの切りかえは main.js がする）
    $("admin-panel").addEventListener("click", (e) => {
      if (e.target.closest(".toggle")) setTimeout(renderSections, 0);
    });
  }

  // 見出しの横に、今の状態を出す（閉じていても分かるように）
  function renderSections() {
    const set = (id, text) => {
      const el = document.querySelector(`#admin-panel .admin-sec[data-sec="${id}"] .admin-sec-state`);
      if (el) el.textContent = text ? `　${text}` : "";
    };
    const n = Updates.state();
    const nt = Updates.notice;
    set("notice", n && n.kind === "ready" ? `新しい版 ${n.version} を公開中` : nt ? `予告 ${Updates.fmt(Date.parse(nt.at))}` : Updates.supported === false ? "サーバーが古い（予告できない）" : "予告なし");
    const next = $("admin-next").value;
    set("next", next ? (Chars.byId(next) || {}).name || next : "ランダム");
    const on = [["debug", "当たり判定"], ["adminFps", "FPS"], ["adminStats", "数と高さ"], ["adminLoad", "読み込み"]].filter(([k]) => Settings.get(k)).map(([, l]) => l);
    set("display", on.length ? `ON：${on.join("・")}` : "");
    const t = LimitedEvents.testDate;
    set("date", t ? `テスト日付 ${fmtDate(t)}` : "");
    set("event", Settings.get("eventPreview") ? "期間中として表示 ON" : "");
  }

  // ---------- アップデート予告 ----------
  // 入力欄に入れる形の日時（"2026-11-01T21:00"）
  function localInput(d) {
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 今の版の次の番号（v3.1.0 → v3.1.1）。入力欄の初めの値に使う
  function nextVersion() {
    const m = String(window.GAME_CONFIG.version || "").match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    return m ? `v${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "";
  }

  // 予告の状態と、入力欄。fill：入力欄も今の予告に合わせる
  function renderNotice(fill = false) {
    const nt = Updates.notice;
    const lines = [`この端末の版：${window.GAME_CONFIG.version}`, `公開中の版　：${Updates.latest || "（確認中）"}`];
    if (!(window.GAME_CONFIG.ranking || {}).url) lines.push("ランキングのサーバーを使っていないので、予告はできません（「更新する」ボタンは出ます）");
    else if (Updates.supported === false) lines.push("サーバーの ranking.gs が古く、予告に対応していません。\nserver/ranking.gs を貼りなおして、デプロイしなおしてください");
    else if (Updates.supported === null) lines.push("予告　　　　：（確認中）");
    else if (!nt) lines.push("予告　　　　：なし");
    else lines.push(`予告　　　　：${Updates.fmt(Date.parse(nt.at))}${nt.version ? ` ${nt.version}` : ""}${nt.message ? `\n　「${nt.message}」` : ""}`);
    $("admin-notice-state").textContent = lines.join("\n");
    if (fill) {
      $("admin-notice-at").value = nt ? localInput(new Date(nt.at)) : $("admin-notice-at").value || "";
      $("admin-notice-ver").value = nt ? nt.version || "" : $("admin-notice-ver").value || nextVersion();
      $("admin-notice-msg").value = nt ? nt.message || "" : $("admin-notice-msg").value || "";
    }
    renderSections();
  }

  // サーバーに予告を書きこむ（notice が null なら消す）。うまくいったら true
  async function sendNotice(notice) {
    const link = ((window.GAME_CONFIG.ranking || {}).url || "").trim();
    if (!link) {
      UI.toast("ランキングのサーバーを使っていないので、予告はできません");
      return false;
    }
    let key = null;
    try {
      key = localStorage.getItem(KEY);
    } catch (e) {}
    let res = null;
    try {
      const r = await fetch(link, {
        method: "POST",
        cache: "no-store",
        // text/plain で送る（Apps Script は、事前の確認の通信（CORS のプリフライト）に答えられないため）
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "notice", key, notice }),
      });
      res = await r.json();
    } catch (e) {
      await UI.alert("サーバーと通信できませんでした。\n通信できる場所で、もう一度ためしてください。");
      return false;
    }
    if (res && res.ok && res.action === "notice") {
      Updates.setNotice(res.notice);
      renderNotice(true);
      return true;
    }
    if (res && res.error === "forbidden") await UI.alert("サーバーに断られました（鍵が合いません）。\nserver/ranking.gs の ADMIN_PASS_HASH が、config.js の admin.passHash と同じか確かめてください。");
    else if (res && res.error === "bad time") await UI.alert("日時が正しくありません。");
    else await UI.alert("サーバーの ranking.gs が古く、予告に対応していません。\nserver/ranking.gs を貼りなおして、デプロイしなおしてください。");
    return false;
  }

  async function setNotice() {
    const v = $("admin-notice-at").value;
    const at = v ? new Date(v) : null;
    if (!at || isNaN(at)) return UI.toast("アップデートする日時を入れてください");
    if (at.getTime() < Date.now() && !(await UI.confirm("その日時は、もう過ぎています。\nこのまま予告しますか？（すぐに「まもなくアップデートします」が出ます）", "予告する"))) return;
    const version = $("admin-notice-ver").value.trim();
    const message = $("admin-notice-msg").value.trim();
    const ok = await UI.confirm(`みんなのタイトル画面に、\n「🔧 ${Updates.fmt(at.getTime())} にアップデートします${version ? `（${version}）` : ""}」${message ? `\n「${message}」` : ""}\nと出します。よろしいですか？`, "予告する");
    if (!ok) return;
    $("admin-notice-state").textContent = "送信中…";
    if (await sendNotice({ at: at.toISOString(), version, message })) UI.toast("アップデートを予告しました");
  }

  async function clearNotice() {
    if (!Updates.notice && Updates.supported) return UI.toast("今は予告していません");
    if (!(await UI.confirm("アップデートの予告を消しますか？\nみんなのタイトル画面から、予告が消えます。", "消す"))) return;
    $("admin-notice-state").textContent = "送信中…";
    if (await sendNotice(null)) UI.toast("予告を消しました");
  }

  // ---------- 日付を変えてテスト ----------
  const DATE_KEY = "stack.admin.date"; // テスト日付（実際の時刻からのずれ。ミリ秒）

  function setTestDate(date) {
    LimitedEvents.setTestDate(date);
    try {
      if (date) localStorage.setItem(DATE_KEY, String(date.getTime() - Date.now()));
      else localStorage.removeItem(DATE_KEY);
    } catch (e) {}
    refreshFlags();
    renderDate();
    renderSections();
  }

  // 起動したとき：保存しておいたテスト日付に戻す（管理者モードのときだけ）
  function restoreTestDate() {
    let ms = 0;
    try {
      ms = Number(localStorage.getItem(DATE_KEY)) || 0;
    } catch (e) {}
    if (ms) LimitedEvents.setTestDate(new Date(Date.now() + ms));
  }

  function renderDate() {
    const t = LimitedEvents.testDate;
    $("admin-date-now").textContent = t ? `（今：${fmtDate(t)}）` : "（今：実際の日付）";
    if (!$("admin-date").value) {
      // 入力欄の初めの値：テスト日付か、今日
      const d = t || new Date();
      const pad = (n) => String(n).padStart(2, "0");
      $("admin-date").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  const fmtDate = (d) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

  // ---------- 画面に出す札・数値 ----------
  // 画面の上の札：「デバッグ中・記録されません」（自由配置モード）・「テスト日付：10/31」
  function refreshFlags() {
    const t = unlocked && LimitedEvents.testDate;
    $("flag-date").classList.toggle("hidden", !t);
    if (t) $("flag-date").textContent = `テスト日付：${t.getMonth() + 1}/${t.getDate()}`;
    $("flag-sandbox").classList.toggle("hidden", !(typeof Sandbox !== "undefined" && Sandbox.active));
  }

  // 表示の切りかえ（FPS・キャラの数と高さ・読み込み状況）。設定が変わるたびに main.js から呼ばれる
  let hudOn = false;
  let frames = [];
  function applyDisplay() {
    const fps = unlocked && Settings.get("adminFps");
    const stats = unlocked && Settings.get("adminStats");
    LoadStatus.setVisible(unlocked && Settings.get("adminLoad"));
    $("admin-hud").classList.toggle("hidden", !(fps || stats));
    refreshFlags();
    if ((fps || stats) && !hudOn) {
      hudOn = true;
      requestAnimationFrame(tickHud);
    }
  }

  function tickHud(time) {
    const fps = unlocked && Settings.get("adminFps");
    const stats = unlocked && Settings.get("adminStats");
    if (!fps && !stats) {
      hudOn = false;
      frames = [];
      return;
    }
    requestAnimationFrame(tickHud);
    frames.push(time);
    while (frames.length && time - frames[0] > 1000) frames.shift();
    // 書きなおすのは 0.25秒ごと（数字がちらつかないように）
    if (time - (tickHud.last || 0) < 250) return;
    tickHud.last = time;
    const lines = [];
    if (fps) lines.push(`FPS ${frames.length}`);
    if (stats) {
      let s = null;
      try {
        s = Game.getStats();
      } catch (e) {} // ゲームが動いていない
      lines.push(s ? `キャラ ${s.count}体 / 高さ ${s.height.toFixed(2)}m` : "キャラ - / 高さ -");
    }
    $("admin-hud").textContent = lines.join("\n");
  }

  // ---------- 解放状態の操作 ----------
  const UNDO_KEY = "stack.admin.undo"; // 最初に操作する前の状態

  // 背景・土台の解放の条件（実績の id と、イベントの勝利数）
  function themeConditions() {
    const themes = window.GAME_CONFIG.themes || {};
    const achIds = new Set();
    const wins = {}; // イベントの id → 必要な勝利数
    for (const def of [...(themes.backgrounds || []), ...(themes.platforms || [])]) {
      const u = def.unlock;
      if (!u) continue;
      if (typeof u === "object") wins[u.event] = Math.max(wins[u.event] || 0, u.wins || 1);
      else achIds.add(u);
    }
    return { achIds, wins };
  }

  function readUndo() {
    try {
      return JSON.parse(localStorage.getItem(UNDO_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  // 解放にかかわるデータを、まるごと写しておく
  function takeSnapshot() {
    const d = Save.data;
    return JSON.parse(JSON.stringify({
      at: new Date().toISOString(),
      dex: d.dex,
      achievements: d.achievements,
      titleId: d.profile.titleId,
      eventStats: d.eventStats || {},
      cosmetics: d.cosmetics,
    }));
  }

  async function setUnlocked(on) {
    const pick = [...document.querySelectorAll("[data-unlock]")].filter((c) => c.checked).map((c) => c.dataset.unlock);
    if (!pick.length) return UI.toast("項目を選んでください");
    const names = { dex: "図鑑", ach: "実績・称号", themes: "背景・土台" };
    const label = pick.map((k) => names[k]).join("・");
    if (!(await UI.confirm(`${label}を「${on ? "すべて解放" : "すべて未解放"}」にしますか？\n（「元に戻す」で、最初に操作する前の状態に戻せます）`, on ? "解放" : "未解放にする"))) return;
    // 最初の1回だけ、操作する前の状態を保存する（何回操作しても、「元に戻す」で一番初めに戻る）
    if (!readUndo()) {
      try {
        localStorage.setItem(UNDO_KEY, JSON.stringify(takeSnapshot()));
      } catch (e) {}
    }
    const d = Save.data;
    const now = new Date().toISOString();
    if (pick.includes("dex")) Dex.setAll(on);
    if (pick.includes("ach")) {
      Achievements.setAll(on);
      if (!on && !Frames.isStaff(d.profile.titleId)) d.profile.titleId = null; // スタッフの称号は外さない
    }
    if (pick.includes("themes")) {
      const { achIds, wins } = themeConditions();
      d.eventStats = d.eventStats || {};
      for (const [id, n] of Object.entries(wins)) {
        const r = (d.eventStats[id] = d.eventStats[id] || { wins: 0, losses: 0 });
        r.wins = on ? Math.max(r.wins || 0, n) : 0;
      }
      for (const id of achIds) {
        if (on) d.achievements[id] = d.achievements[id] || now;
        else delete d.achievements[id];
      }
      if (!on) d.cosmetics = Save.defaults().cosmetics;
    }
    afterDataChange();
    UI.toast(`${label}を${on ? "すべて解放" : "すべて未解放に"}しました`);
  }

  async function undoUnlocked() {
    const snap = readUndo();
    if (!snap) return;
    if (!(await UI.confirm(`${fmtDate(new Date(snap.at))} に保存した状態に戻しますか？`, "元に戻す"))) return;
    const d = Save.data;
    d.dex = snap.dex || {};
    d.achievements = snap.achievements || {};
    d.profile.titleId = snap.titleId || null;
    d.eventStats = snap.eventStats || {};
    d.cosmetics = Object.assign(Save.defaults().cosmetics, snap.cosmetics);
    try {
      localStorage.removeItem(UNDO_KEY);
    } catch (e) {}
    afterDataChange();
    UI.toast("元の状態に戻しました");
  }

  function renderUndo() {
    const snap = readUndo();
    $("btn-admin-undo").disabled = !snap;
    $("admin-undo-note").textContent = snap ? `保存してある状態：${fmtDate(new Date(snap.at))}（操作する前）` : "まだ保存してある状態はありません。";
  }

  // 保存データを書きかえたあと：保存して、画面に反映する
  function afterDataChange() {
    Save.write();
    Themes.apply(); // 使えなくなった背景・土台は元に戻す
    Profile.refresh();
    if (typeof onChange === "function") onChange();
    render();
  }

  // ---------- データのリセット ----------
  // 項目ごとに、何を初めに戻すか（fresh は Save.defaults()）
  const RESET_ITEMS = {
    best: {
      label: "ハイスコア",
      detail: "1人で遊ぶ・競技・特殊ルールのハイスコア、積んだ数・高さの最高",
      run(d, fresh) {
        d.stats.best = fresh.stats.best;
        d.stats.compBest = fresh.stats.compBest; // 競技のハイスコア
        d.stats.bestCount = 0;
        d.stats.bestHeight = 0;
        d.stats.ruleBest = {};
      },
    },
    stats: {
      label: "戦績（1人・対戦）",
      detail: "プレイ回数・勝ち負け・CPU の連勝・オンライン対戦の成績・相手ごとの成績",
      run(d, fresh) {
        const s = d.stats;
        d.stats = Object.assign(fresh.stats, { best: s.best, bestCount: s.bestCount, bestHeight: s.bestHeight, ruleBest: s.ruleBest, compBest: s.compBest });
        d.opponents = {};
      },
    },
    dex: { label: "図鑑", detail: "登録したキャラ", run: (d) => (d.dex = {}) },
    ach: {
      label: "実績・称号",
      detail: "達成した実績と、つけている称号",
      run(d) {
        d.achievements = {};
        if (!Frames.isStaff(d.profile.titleId)) d.profile.titleId = null; // スタッフの称号は外さない
      },
    },
    stamps: { label: "スタンプ設定", detail: "オンライン対戦のスタンプ4つ", run: (d, fresh) => (d.stamps = fresh.stamps) },
    themes: {
      label: "解放した背景・土台",
      detail: "イベントの勝利数・選んでいる背景と土台・対戦カードの色（実績で解放したものは「実績・称号」で消える）",
      run(d, fresh) {
        d.eventStats = {};
        d.cosmetics = fresh.cosmetics;
      },
    },
    profile: {
      label: "プロフィール（名前・写真）",
      detail: "名前と写真のアイコン",
      run(d) {
        d.profile.name = "";
        d.profile.icon = null;
      },
    },
    settings: { label: "設定", detail: "音・操作・ランキングなどの設定（管理者メニューの表示もふくむ）", run: () => Settings.replaceAll({}) },
  };

  async function resetData() {
    const pick = [...document.querySelectorAll("[data-reset]")].filter((c) => c.checked).map((c) => c.dataset.reset);
    if (!pick.length) return UI.toast("項目を選んでください");
    const backup = $("admin-reset-backup").checked;
    const list = pick.map((k) => `・${RESET_ITEMS[k].label}\n　${RESET_ITEMS[k].detail}`).join("\n");
    const msg = `次の項目を初めの状態に戻します。元には戻せません。\n\n${list}${backup ? "\n\n先に、バックアップのファイルを書き出します。" : ""}`;
    if (!(await UI.confirm(msg, "リセット"))) return;
    if (backup) Backup.exportFile();
    const fresh = Save.defaults();
    for (const k of pick) RESET_ITEMS[k].run(Save.data, fresh);
    afterDataChange();
    UI.toast("リセットしました");
  }

  // ---------- 出現率のテスト ----------
  // 指定した回数だけ抽選して、レア度ごと・キャラごとに表で出す（設定の出現率との差も）
  function renderDrawTest() {
    const N = Math.round(Math.min(1000000, Math.max(100, Number($("admin-draw-n").value) || 10000)));
    $("admin-draw-n").value = N;
    // 競技のルールで抽選する（全キャラ同じ確率。出てくるのは Chars.inCompetitive のキャラだけ）
    const comp = $("admin-draw-comp").checked ? window.GAME_CONFIG.competitive : null;
    const counts = Game.drawTest(N, comp);
    const table = window.GAME_CONFIG.rarity;
    const chars = comp
      ? window.CHARACTERS.filter((c) => Chars.inCompetitive(c))
      : window.CHARACTERS.filter((c) => Chars.appears(c) && LimitedEvents.available(c));
    const chanceOf = (c) => (comp && comp.equalChance !== false ? 1 : Chars.chance(c));
    const total = chars.reduce((n, c) => n + chanceOf(c), 0);
    const pct = (v) => `${v.toFixed(v < 1 ? 3 : 2)}%`;
    // 差（結果 − 設定）。偶然のぶれ（標準偏差）の3倍より大きいずれには、色を付ける
    const diff = (got, want) => {
      const d = (got / N) * 100 - want;
      const sd = Math.sqrt(((want / 100) * (1 - want / 100)) / N) * 100;
      const cls = Math.abs(d) > sd * 3 ? "admin-diff-big" : "";
      return `<td class="${cls}">${d >= 0 ? "+" : "−"}${pct(Math.abs(d))}</td>`;
    };
    const rows = Object.keys(table).map((rid) => {
      const members = chars.filter((c) => (table[c.rarity] ? c.rarity : "N") === rid);
      const got = members.reduce((n, c) => n + (counts.get(c.id) || 0), 0);
      const want = (members.reduce((n, c) => n + chanceOf(c), 0) / total) * 100;
      const head = `<tr class="admin-draw-rarity"><th>${"★".repeat(table[rid].stars)} ${UI.escape(table[rid].name)}</th><td>${pct(want)}</td><td>${got.toLocaleString()}回<br>${pct((got / N) * 100)}</td>${diff(got, want)}</tr>`;
      return head + members.map((c) => {
        const n = counts.get(c.id) || 0;
        const w = (chanceOf(c) / total) * 100;
        return `<tr><td>${UI.escape(c.name)}</td><td>${pct(w)}</td><td>${n.toLocaleString()}回<br>${pct((n / N) * 100)}</td>${diff(n, w)}</tr>`;
      }).join("");
    });
    $("admin-draw").innerHTML = `<table><tr><th>キャラ</th><th>設定</th><th>${N.toLocaleString()}回の結果</th><th>差</th></tr>${rows.join("")}</table>`;
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
    applyDisplay,
    refreshFlags,
    get unlocked() { return unlocked; },
    set onChange(fn) { onChange = fn; },
    set onStartSandbox(fn) { onStartSandbox = fn; },
  };
})();
