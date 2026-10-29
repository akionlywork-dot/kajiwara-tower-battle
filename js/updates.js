// =============================================
// updates.js
// アップデートの予告と「更新する」ボタン（タイトル画面）
//
// ・予告：管理者モードで日時を決めて「予告する」と、ランキングのサーバー（server/ranking.gs の ?notice=1）に保存され、
//   みんなのタイトル画面に「🔧 11/1（土）21:00 にアップデートします」と出る
// ・更新：公開されている config.js の version を、ときどき見に行く（キャッシュを使わない）。
//   今動いている版とちがえば、予告がなくても「✨ 新しいバージョンがあります［更新する］」を出す
//   予告の時刻を過ぎて、まだ新しい版が公開されていないあいだは「まもなくアップデート」を出す
// ・「更新する」：URL に ?u=時刻 を付けて開きなおす（スマホやサーバーに残った古いページを使わないように）。
//   開きなおしたあと、URL の ?u= は消す
// ・ゲーム中は何も出さない（タイトル画面の表示だけ）。予告・新しい版の確認は、いつもの時刻（Date.now）で判断する
//   （管理者モードのテスト日付には合わせない）
// =============================================

const Updates = (() => {
  const $ = (id) => document.getElementById(id);
  const POLL = 5 * 60 * 1000; // ふだん見に行く間隔（ミリ秒）
  const POLL_SOON = 60 * 1000; // 予告の時刻が近い・過ぎたあとに見に行く間隔
  const WAIT_AFTER = 3 * 60 * 60 * 1000; // 予告の時刻を過ぎて、新しい版が出ないまま「まもなく」を出しておく長さ
  const TIMEOUT = 10000;

  const url = () => ((window.GAME_CONFIG.ranking || {}).url || "").trim();
  const current = () => String(window.GAME_CONFIG.version || "");
  const same = (a, b) => String(a || "").replace(/^v/i, "") === String(b || "").replace(/^v/i, "");
  // a の版が b と同じか、b より新しいか（"v3.2.0" と "v3.1.1" のように、数字を左から比べる。数字でなければ同じときだけ）
  const atLeast = (a, b) => {
    const pa = String(a || "").replace(/^v/i, "").split(".").map(Number);
    const pb = String(b || "").replace(/^v/i, "").split(".").map(Number);
    if (pa.some(isNaN) || pb.some(isNaN)) return same(a, b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return true;
  };

  let notice = null; // サーバーの予告 { at, version, message, updated } か null
  let supported = null; // サーバーが予告に対応しているか（古い ranking.gs なら false。まだ分からなければ null）
  let latest = null; // 公開されている版（config.js の version）。分からなければ null
  let timer = null;

  // 時間切れのある fetch
  async function request(link, options, as = "json") {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(link, Object.assign({ cache: "no-store", signal: ctrl.signal }, options));
      if (!res.ok) throw new Error(res.status);
      return as === "text" ? await res.text() : await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  // サーバーの予告を読む
  async function fetchNotice() {
    if (!url()) return;
    try {
      const json = await request(`${url()}?notice=1&t=${Date.now()}`);
      supported = !!json && json.action === "notice";
      notice = supported ? json.notice || null : null;
    } catch (e) {
      // 通信できないときは、前に読んだものをそのまま使う
    }
  }

  // 公開されている版を調べる（sw.js は ?latest= の付いた読み込みを保存しない）
  async function fetchLatest() {
    try {
      const text = await request(`config.js?latest=${Date.now()}`, {}, "text");
      const m = text.match(/version:\s*"([^"]+)"/);
      if (m) latest = m[1];
    } catch (e) {}
  }

  // 今の状態：
  //   { kind: "ready", version }（新しい版が公開ずみ）/ { kind: "soon", at, message }（予告の時刻の前）/
  //   { kind: "waiting", message }（予告の時刻を過ぎて、公開を待っている）/ null（何も出さない）
  function state(now = Date.now()) {
    if (latest && !same(latest, current())) return { kind: "ready", version: latest };
    if (!notice || (notice.version && atLeast(current(), notice.version))) return null; // 予告の版（か、それより新しい版）にもう上がっている
    const at = Date.parse(notice.at);
    if (!at) return null;
    if (now < at) return { kind: "soon", at, message: notice.message || "", version: notice.version || "" };
    if (now - at < WAIT_AFTER) return { kind: "waiting", message: notice.message || "" };
    return null;
  }

  // 「11/1（土）21:00」
  function fmt(ms) {
    const d = new Date(ms);
    const week = "日月火水木金土"[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}（${week}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // タイトル画面の帯を書く
  function render() {
    const el = $("update-banner");
    if (!el) return;
    const s = state();
    el.classList.toggle("hidden", !s);
    if (!s) return (el.innerHTML = "");
    const msg = s.message ? `<small>${UI.escape(s.message)}</small>` : "";
    if (s.kind === "ready") {
      el.className = "update-banner update-ready";
      el.innerHTML = `<span>✨ 新しいバージョン（${UI.escape(s.version)}）があります</span><button id="btn-update-now" class="btn btn-small btn-primary">更新する</button>`;
      $("btn-update-now").onclick = apply;
    } else if (s.kind === "soon") {
      el.className = "update-banner update-soon";
      el.innerHTML = `<span>🔧 <b>${fmt(s.at)}</b> にアップデートします${s.version ? `（${UI.escape(s.version)}）` : ""}</span>${msg}`;
    } else {
      el.className = "update-banner update-soon";
      el.innerHTML = `<span>🔧 まもなくアップデートします</span>${msg}`;
    }
  }

  // 新しい版で開きなおす
  function apply() {
    const q = new URLSearchParams(location.search);
    q.set("u", String(Date.now()));
    location.replace(`${location.pathname}?${q}`);
  }

  // 次に見に行くまでの時間（予告の時刻が近い・過ぎたあとは、こまめに）
  function nextDelay() {
    const s = state();
    if (s && s.kind === "waiting") return POLL_SOON;
    if (s && s.kind === "soon" && s.at - Date.now() < 15 * 60 * 1000) return POLL_SOON;
    return POLL;
  }

  async function refresh() {
    await Promise.all([fetchNotice(), fetchLatest()]);
    render();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      // 画面が見えていないあいだは、通信しない（見えるようになったら、すぐ見に行く）
      if (!document.hidden) await refresh();
      schedule();
    }, nextDelay());
  }

  function init() {
    // 「更新する」で開きなおしたときに付けた ?u= を、URL から消す
    const q = new URLSearchParams(location.search);
    if (q.has("u")) {
      q.delete("u");
      history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}${location.hash}`);
    }
    UI.onShow("title", render);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh().then(schedule);
    });
    refresh().then(schedule);
    // 「soon」→「waiting」のように、時刻だけで変わる表示を、1分ごとに書きなおす
    setInterval(render, 60 * 1000);
  }

  // 管理者モードから使う：予告を書きこんだあとに、手元の表示もすぐ変える
  function setNotice(n) {
    notice = n || null;
    supported = true;
    render();
    schedule();
  }

  return {
    init, refresh, render, setNotice, state, fmt,
    get notice() { return notice; },
    get supported() { return supported; },
    get latest() { return latest; },
  };
})();
