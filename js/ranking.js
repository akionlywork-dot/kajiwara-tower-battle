// =============================================
// ranking.js
// ランキング
//
// config.js の ranking.url を設定したとき（オンライン）：
//   Google スプレッドシート（Apps Script。server/ranking.gs）にハイスコアを自動で送り、ランキングを読みに行く。
//   送るのは「名前・称号・スコア・積んだ数・高さ」と、この端末のランダムな番号。
//   写真アイコンは、本人が「載せる」を選んだときだけ、小さくして送る。
//   「ランキングでプロフィールを公開」が ON の人だけ、実績の数・図鑑の数・背景と土台の id・プレイ回数・
//   積んだ数の合計・オンライン対戦の勝敗も送る（OFF にすると、次に送ったときにサーバーから消える）。
//   ランキングは「フリー」（スコアアタックのふつうのルール）と「競技」（config.js の competitive）の2つ。
//   画面の上のタブで切りかえる。特殊ルールは載せない。
//   ランキングへの参加は、遊ぶ条件：スコアアタック（ふつう・特殊ルール）・競技を初めて遊ぶときに、同意のダイアログを出す
//   （ensureConsent。「同意して遊ぶ」で参加（設定の ranking が true）、「やめる」なら始めない。対戦は同意しなくても遊べる）。
//   前から「ランキングに参加」を ON にしていた人は、同意ずみとして扱う。参加の設定は、フリー・競技で共通。
//   設定画面の「同意を取り消す」で、ranking.gs に記録を消してもらい（action: "delete"）、参加をやめる
//   競技のスコアは、サーバー（ranking.gs）が競技に対応しているとき（GET ?mode=comp に mode: "comp" が返る）だけ送る
//   （古い ranking.gs のままだと、競技のスコアがフリーのランキングに混ざってしまうため）
// ranking.url が "" のとき：
//   data/ranking.json（手で書きかえて更新する）を表示する。スコアはどこにも送らない。競技のタブは、json の comp を出す
// =============================================

const Ranking = (() => {
  const $ = (id) => document.getElementById(id);
  const MEDALS = { 1: "gold", 2: "silver", 3: "bronze" }; // 上位3位の色
  const TIMEOUT = 10000; // 通信を待つ時間（ミリ秒）
  // ランキングに表示してよい写真アイコンの形（小さな JPEG だけ）
  const ICON_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

  const url = () => ((window.GAME_CONFIG.ranking || {}).url || "").trim();
  const isOnline = () => !!url();
  const mem = () => Save.data.ranking;
  // ランキングの種類：free（フリー＝スコアアタックのふつうのルール）/ comp（競技）
  //   best：その種類の自分のハイスコア、sent・sentProfile：最後に送ったスコア・プロフィールの目印（Save.data.ranking）
  const KINDS = {
    free: { label: "フリー", best: () => Save.data.stats.best, sent: "sentScore", sentProfile: "sentProfile" },
    comp: { label: "競技", best: () => Save.data.stats.compBest, sent: "sentScoreComp", sentProfile: "sentProfileComp" },
  };
  let tab = "free"; // ランキング画面で選んでいるタブ
  // フリー・競技のどちらかで、ハイスコアがあるか（初めて「送ってもいいか」を聞くのに使う）
  const anyBest = () => KINDS.free.best() || KINDS.comp.best();

  function init() {
    UI.onShow("ranking", open);
    // 行をタップしたら、その人のプロフィールを出す
    $("ranking-list").addEventListener("click", (e) => {
      const row = e.target.closest("[data-index]");
      if (row && shown[row.dataset.index]) openProfile(shown[row.dataset.index]);
    });
    // フリー・競技のタブ
    for (const b of document.querySelectorAll("[data-rank-tab]")) {
      b.addEventListener("click", () => {
        if (tab === b.dataset.rankTab) return;
        tab = b.dataset.rankTab;
        open();
      });
    }
    // 設定画面：同意を取り消す
    $("btn-ranking-revoke").addEventListener("click", revokeConsent);
    $("rank-profile-close").addEventListener("click", closeProfile);
    $("rank-profile-mine").addEventListener("click", () => {
      closeProfile();
      UI.show("profile");
    });
    // 設定画面の「ランキング」の欄（参加・プロフィールを公開・写真アイコン）は、オンラインのランキングを使うときだけ出す
    $("setting-ranking-group").classList.toggle("hidden", !isOnline());
  }

  // この端末の番号（初めて使うときに作る）
  function playerId() {
    if (!mem().id) {
      mem().id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      Save.write();
    }
    return mem().id;
  }

  // ランキングに参加しているか（オンラインのランキングを使っていて、設定で ON）
  function joined() {
    return isOnline() && !!Settings.get("ranking");
  }

  // オンライン対戦の相手に送る「この端末の目印」。
  // ランキングの番号そのものを送ると、相手がその番号でランキングに書きこめてしまうので、
  // 番号から作った別の値（SHA-256 の頭の32文字）を送る。同じ端末なら、いつも同じ値になる
  let opponentKeyCache = null;
  async function opponentKey() {
    if (opponentKeyCache) return opponentKeyCache;
    const text = "vs:" + playerId();
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      opponentKeyCache = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    } catch (e) {
      // crypto.subtle が使えないとき（https でないページなど）は、簡単な計算で作る
      let h1 = 0x811c9dc5, h2 = 0x01000193;
      for (let i = 0; i < text.length; i++) {
        h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
        h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822519) >>> 0;
      }
      opponentKeyCache = (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
    }
    return opponentKeyCache;
  }

  // 最後に分かった自分の順位を残しておく（オンライン対戦の対戦カードに出す）
  function rememberRank(rank) {
    const n = Number(rank);
    if (!Number.isInteger(n) || n < 1 || mem().lastRank === n) return;
    mem().lastRank = n;
    Save.write();
  }

  // 時間切れのある fetch
  async function request(link, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(link, Object.assign({ cache: "no-store", signal: ctrl.signal }, options));
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- ランキング画面 ----------
  let shown = []; // 画面に並べている行（タップしたときに、プロフィールを出すため）

  async function open() {
    const kind = tab;
    shown = [];
    for (const b of document.querySelectorAll("[data-rank-tab]")) {
      b.classList.toggle("active", b.dataset.rankTab === kind);
      b.setAttribute("aria-selected", String(b.dataset.rankTab === kind));
    }
    renderMine(null);
    const box = $("ranking-list");
    box.innerHTML = `<p class="empty-message">読み込み中…</p>`;
    let json = null;
    let unsupported = false; // 競技に対応していない、古い ranking.gs
    if (isOnline()) {
      await submitBest(); // 名前・称号・アイコンを変えていたら、先に送っておく（自分の行に反映されるように）
      try {
        json = await request(`${url()}?mode=${kind}&me=${encodeURIComponent(playerId())}&t=${Date.now()}`);
        if (kind === "comp" && json && json.mode !== "comp") {
          unsupported = true;
          json = null;
        }
        if (kind === "comp") compServer = { ok: !unsupported, at: Date.now() };
      } catch (e) {
        console.warn("ランキングを読み込めませんでした:", e.message);
      }
    } else {
      json = await DataFile.load("data/ranking.json");
      if (json && kind === "comp") json = json.comp && typeof json.comp === "object" ? json.comp : { updated: json.updated, ranking: [] }; // 手で書くときは comp: { ranking: [...] }
    }
    if (UI.current !== "ranking" || tab !== kind) return; // 読み込み中に画面を閉じた・タブを変えた
    if (unsupported) {
      box.innerHTML = `<div class="coming-soon"><span>🏁</span><b>競技のランキングは準備中です</b><p>もうしばらくお待ちください。</p></div>`;
      return;
    }
    const divisions = json ? divisionsOf(json, !isOnline()) : null;
    if (!divisions) {
      box.innerHTML = `<p class="empty-message">ランキングを取得できません。<br>通信できる場所で、もう一度開いてください。</p>`;
      return;
    }
    // 部門ごとに並べる（部門が1つで名前が無ければ、見出しは出さない）。タップで出すプロフィールのため、全部の行を shown に入れる
    shown = [].concat(...divisions.map((d) => d.rows));
    let index = 0;
    // 見出しの行（パソコンの横長の画面だけ出す。列の位置は行と同じ）
    const head = `<div class="rank-head" aria-hidden="true"><span>順位</span><span></span><span>名前・称号</span><span>スコア</span><span>積んだ数</span><span>高さ</span><span>記録した日</span></div>`;
    const html = divisions
      .map((d) => (d.name ? `<h3 class="section-title ranking-division">${UI.escape(d.name)}</h3>` : "") + (d.rows.length ? head : "") + d.rows.map((r) => rowHTML(r, index++)).join(""))
      .join("");
    const updated = json.updated ? `<p class="ranking-updated">${UI.escape(json.updated)} 更新</p>` : "";
    box.innerHTML =
      updated +
      (shown.length
        ? html
        : isOnline()
        ? `<div class="coming-soon"><span>${kind === "comp" ? "🏁" : "🏆"}</span><b>まだ記録がありません</b><p>${kind === "comp" ? "競技" : "スコアアタック"}で遊ぶと、ハイスコアがここに載ります。</p></div>`
        : `<div class="coming-soon"><span>🏆</span><b>ランキングは準備中です</b><p>お楽しみに！<br>まずはハイスコアを目指して遊んでみてください。</p></div>`);
    if (json.me && kind === "free") rememberRank(json.me.rank); // 対戦カードに出す順位は、フリーのもの
    renderMine(json.me || null);
  }

  // 届いたランキングを、部門ごとの並び [{ name, rows }] にする。おかしければ null
  //   ・ふつうは json.ranking が1つの部門。手で書く ranking.json に divisions: [{ name, ranking }] があれば、部門ごと
  //   ・順位（rank）は、書いてあればそのまま使い、書いていなければ並び順から決める（手で入れなくてよい）
  //   ・スタッフの称号（frames.js の STAFF）の専用の札と枠を付ける人（staffId）：
  //     オンラインのランキングでは、ranking.gs が返す staff（スタッフの称号を獲得してつけている端末が送ってくる id）がある人。
  //     手で書く ranking.json では、"title": "developer" / "admin" / "employee" / "operator" の人。
  //     称号の文字（「管理者」など）だけでは付けない（だれでも名乗れてしまうため）
  function divisionsOf(json, manual) {
    const raw = Array.isArray(json.divisions) && json.divisions.length
      ? json.divisions.filter((d) => d && Array.isArray(d.ranking)).map((d) => ({ name: String(d.name || ""), rows: d.ranking }))
      : Array.isArray(json.ranking) ? [{ name: "", rows: json.ranking }] : null;
    if (!raw || !raw.length) return null;
    return raw.map((d) => {
      const rows = d.rows.filter((r) => r && typeof r === "object").map((r) => Object.assign({}, r));
      const hasRank = rows.length && rows.every((r) => Number.isInteger(Number(r.rank)) && Number(r.rank) > 0);
      if (hasRank) rows.sort((a, b) => a.rank - b.rank);
      else rows.forEach((r, i) => (r.rank = i + 1)); // 並び順で順位を付ける
      for (const r of rows) {
        r.staffId = manual ? (Frames.isStaff(r.title) ? r.title : null) : Frames.isStaff(r.staff) ? r.staff : null;
        if (r.staffId) r.title = ""; // スタッフは、称号の札の代わりに専用の札を出す
      }
      return { name: d.name, rows };
    });
  }

  // 1〜3位の王冠（金・銀・銅）。順位が同じなら、同じ王冠
  const CROWN_COLORS = { 1: ["#ffe27a", "#d4a019"], 2: ["#f4f7fb", "#9aa3ad"], 3: ["#f2c79c", "#a8662f"] };
  function crownHTML(rank) {
    const c = CROWN_COLORS[rank];
    if (!c) return "";
    return `<span class="rank-crown" aria-label="${rank}位の王冠"><svg viewBox="0 0 24 16"><defs><linearGradient id="cg${rank}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><path d="M2 14 1 3l6 5 5-7 5 7 6-5-1 11z" fill="url(#cg${rank})" stroke="rgba(0,0,0,.35)" stroke-width="1"/><circle cx="12" cy="1.8" r="1.3" fill="${c[0]}"/></svg></span>`;
  }

  // スタッフの称号の札（手で書く ranking.json の人だけ。開発者はコード風、管理者・社員・運営は専用の色）
  const staffBadge = (id) => Frames.titleHTML(Frames.STAFF[id].title, Frames.staff(id));

  // アイコン（写真か、名前の1文字目）に称号の枠を付けた HTML。cls：大きさのクラス
  function avatarHTML(r, cls) {
    const name = String(r.name || "");
    const icon = ICON_PATTERN.test(String(r.icon || "")) ? r.icon : null;
    // 称号の枠：サーバーには称号の文字しか無いので、その文字から実績を探して決める（見つからなければ枠なし）
    const fc = Frames.avatarClass(r.staffId ? Frames.staff(r.staffId) : Frames.ofTitleText(String(r.title || "")));
    return icon
      ? `<span class="avatar ${cls} ${fc}" style="background-image:url(${icon})"></span>`
      : `<span class="avatar avatar-empty ${cls} ${fc}">${UI.escape([...name][0] || "?")}</span>`;
  }

  // 1人分の行（アイコン・名前・称号。自分の行は目立たせる）。タップでプロフィール
  function rowHTML(r, i) {
    const medal = MEDALS[r.rank] || "";
    const height = Number(r.height);
    const name = String(r.name || "");
    const frame = Frames.ofTitleText(String(r.title || ""));
    const avatar = `<span class="rank-avatar-wrap">${crownHTML(Number(r.rank))}${avatarHTML(r, "rank-avatar")}</span>`;
    // 積んだ数・高さ・日付（手で書く ranking.json で書いていない項目は出さない）
    const count = r.count !== undefined && r.count !== "" && isFinite(Number(r.count)) ? `${Number(r.count)}体` : "";
    const ht = r.height !== undefined && r.height !== "" && !isNaN(height) ? `${height.toFixed(2)}m` : "";
    const date = r.date ? UI.escape(shortDate(String(r.date))) : "";
    const sub = [count, ht, date].filter(Boolean);
    // 行の最後の rank-col（積んだ数・高さ・日付）は、パソコンの横長の画面だけで、表のように別の列に並べる（style.css の「パソコン」）。
    // スマホでは rank-col は出さず、名前の下の small に1行で出す
    return `
      <button class="rank-row ${medal ? "rank-" + medal : ""} ${r.me ? "rank-me" : ""}" data-index="${i}" aria-label="${UI.escape(name)}のプロフィール">
        <span class="rank-num">${Number(r.rank)}</span>
        ${avatar}
        <span class="rank-main">
          <b class="rank-name"><span class="rank-name-text">${Custom.nameHTML(name, r.nameColor)}</span>${r.me ? `<em class="rank-you">あなた</em>` : ""}</b>
          ${r.staffId ? `<span class="rank-dev">${staffBadge(r.staffId)}</span>` : r.title ? Frames.titleHTML(String(r.title), frame) : `<span class="title-badge title-empty">称号なし</span>`}
          <small>${sub.join("・")}</small>
        </span>
        <span class="rank-score">${Number(r.score)}<small>点</small></span>
        <span class="rank-col rank-col-count">${count}</span>
        <span class="rank-col rank-col-height">${ht}</span>
        <span class="rank-col rank-col-date">${date}</span>
      </button>`;
  }

  // 行に出す日付は短く（"2026-10-28" → "10/28"。それ以外の書き方なら、そのまま）
  function shortDate(d) {
    const m = /^\d{4}-(\d{1,2})-(\d{1,2})/.exec(d);
    return m ? `${Number(m[1])}/${Number(m[2])}` : d;
  }

  // ---------- ランキングの人のプロフィール ----------
  // ランキングで届いている項目（手で書く ranking.json なら、書いてある項目）だけを出す。端末の番号は出さない
  function openProfile(r) {
    const name = String(r.name || "プレイヤー");
    const title = String(r.title || "");
    const frame = Frames.ofTitleText(title);
    const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
    const items = [];
    if (num(r.rank) !== null) items.push(["順位", `${num(r.rank)}<small>位</small>`]);
    if (num(r.score) !== null) items.push(["ハイスコア", `${num(r.score)}<small>点</small>`]);
    if (num(r.count) !== null) items.push(["積んだ数", `${num(r.count)}<small>体</small>`]);
    if (num(r.height) !== null) items.push(["高さ", `${num(r.height).toFixed(2)}<small>m</small>`]);
    if (r.date) items.push(["記録した日", UI.escape(String(r.date)), "wide"]);
    const extra = profileHTML(r.profile);
    $("rank-profile-content").innerHTML =
      `<div class="rp-head">
        ${avatarHTML(r, "rp-avatar")}
        <span class="rp-who">
          <b>${Custom.nameHTML(name, r.nameColor)}${r.staffId ? staffBadge(r.staffId) : ""}${r.me ? `<em class="rank-you">あなた</em>` : ""}</b>
          ${r.staffId ? "" : title ? Frames.titleHTML(title, frame) : `<span class="title-badge title-empty">称号なし</span>`}
        </span>
      </div>` +
      (items.length ? `<div class="rp-stats">${items.map(([label, value, cls]) => `<div class="rp-stat ${cls || ""}"><span>${label}</span><b>${value}</b></div>`).join("")}</div>` : "") +
      extra;
    $("rank-profile-mine").classList.toggle("hidden", !r.me);
    $("rank-profile").classList.add("active");
  }

  // 公開しているプロフィール（実績・図鑑・プレイ回数・積んだ数の合計・オンライン対戦・背景と土台の見本）。
  // 公開していない人・古いバージョンの人は ""（空の欄は出さない）。届いた値は、ここでもう一度確かめる
  function profileHTML(p) {
    if (!p || typeof p !== "object") return "";
    const int = (v) => Number.isInteger(v) && v >= 0;
    const pair = (a) => Array.isArray(a) && int(a[0]) && int(a[1]);
    const items = [];
    if (pair(p.ach) && p.ach[0] <= p.ach[1]) items.push(["実績", `🏆 ${p.ach[0]}<small>/ ${p.ach[1]}</small>`]);
    if (pair(p.dex) && p.dex[0] <= p.dex[1]) items.push(["図鑑", `📖 ${p.dex[0]}<small>/ ${p.dex[1]}</small>`]);
    if (int(p.plays)) items.push(["プレイ回数", `${p.plays}<small>回</small>`]);
    if (int(p.pieces)) items.push(["積んだ数の合計", `${p.pieces}<small>体</small>`]);
    if (pair(p.online)) items.push(["オンライン対戦", `${p.online[0]}<small>勝</small> ${p.online[1]}<small>敗</small>`]);
    // 背景・土台の見本（自分のプロフィールと同じ絵）。config.js に無い id は出さない
    const bg = typeof p.bg === "string" ? Themes.previewOf("backgrounds", p.bg) : null;
    const plat = typeof p.platform === "string" ? Themes.previewOf("platforms", p.platform, p.bg) : null;
    const tiles = [bg, plat]
      .filter(Boolean)
      .map((t, i) => `<span class="rp-theme"><img src="${t.src}" alt=""><small>${i === 0 && bg ? "背景" : "土台"}：${UI.escape(t.name)}</small></span>`)
      .join("");
    // お気に入りのキャラ（custom.js。このゲームにいるキャラだけ）
    const fav = Custom.cleanFavorite(p.fav) ? Chars.byId(p.fav) : null;
    const favHTML = fav ? `<div class="rp-fav"><img src="${UI.escape(fav.file)}" alt=""><span><small>お気に入りのキャラ</small><b>${UI.escape(fav.name)}</b></span></div>` : "";
    if (!items.length && !tiles && !favHTML) return "";
    return (
      `<p class="rp-section">プロフィール</p>` +
      favHTML +
      (items.length ? `<div class="rp-stats">${items.map(([label, value]) => `<div class="rp-stat"><span>${label}</span><b>${value}</b></div>`).join("")}</div>` : "") +
      (tiles ? `<div class="rp-themes">${tiles}</div>` : "")
    );
  }

  function closeProfile() {
    $("rank-profile").classList.remove("active");
  }

  // 画面の下：自分のハイスコア（選んでいるタブのもの。オンラインなら順位も）
  function renderMine(me) {
    const best = KINDS[tab].best();
    let note = "";
    if (isOnline() && best) {
      if (!Settings.get("ranking")) note = `<small class="my-rank">ランキングに未参加</small>`;
      else if (me) note = `<small class="my-rank">あなたは <b>${Number(me.rank)}位</b></small>`;
    }
    $("ranking-mine").innerHTML =
      `<span class="my-record-label">あなたのハイスコア（${KINDS[tab].label}）</span>` +
      Profile.badgeHTML() +
      (best
        ? `<span class="rank-score">${best.score}<small>点</small><em>${best.count}体・${best.height.toFixed(2)}m</em>${note}</span>`
        : `<span class="my-record-none">まだ記録がありません</span>`);
  }

  // ---------- 参加の確認 ----------
  // アプリを開いたとき（main.js から呼ばれる）：
  // 前からハイスコアがある人には、遊ばなくても「送っていいか」を聞いて、自己ベストを載せる。
  // 参加ずみの人は、前に送れなかった記録や、変えた名前・称号・アイコンを送りなおす
  // 同意していない人には、何もしない（スコアアタック・競技を遊ぶときに、同意のダイアログを出す）
  async function atStartup() {
    if (!isOnline() || Admin.unlocked || !Settings.get("ranking")) return; // 管理者モードの記録は、公開のランキングに送らない
    if ((!mem().asked && anyBest()) || needIconQuestion()) {
      await waitTitle();
      return afterSoloGame();
    }
    return submitBest();
  }

  // タイトル画面で、ほかのポップアップ（お知らせ・挑戦状など）が出ていないときまで待つ
  async function waitTitle() {
    while (UI.current !== "title" || document.querySelector(".dialog.active") || !$("splash").classList.contains("hidden")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // スコアアタック（ふつうのルール）・競技が終わったときに main.js から呼ばれる。
  // 同意してから初めてのゲームのあとに、プロフィールも公開するかを1回だけ聞く（mem().asked。写真アイコンがある人には、写真を載せるかも聞く）
  async function afterSoloGame() {
    if (!isOnline() || Admin.unlocked || !Settings.get("ranking")) return;
    if (!mem().asked && anyBest()) {
      mem().asked = true;
      Save.write();
      const pub = await UI.confirm(
        "プロフィールも、ランキングで公開しますか？\n\nランキングであなたの行を押した人に、実績の数・図鑑の数・選んでいる背景と土台・プレイ回数・積んだ数の合計・オンライン対戦の勝敗が見えます。\n（設定画面でいつでも変えられます）",
        "公開する",
        true,
        "公開しない"
      );
      Settings.set("rankingProfile", pub);
    }
    if (needIconQuestion()) {
      mem().iconAsked = true;
      Save.write();
      const yes = await UI.confirm(
        "写真アイコンも、ランキングに載せますか？\n\nランキングを見た人みんなに、あなたの写真が見えます。\n載せないときは、名前の1文字目が表示されます。\n（設定画面でいつでも変えられます）",
        "載せる",
        true,
        "載せない"
      );
      Settings.set("rankingIcon", yes);
    }
    await submitBest();
  }

  // ---------- ランキングへの参加の同意 ----------
  // スコアアタック（ふつう・特殊ルール）・競技を始める前に、main.js から呼ばれる。遊んでよければ true。
  // 同意ずみ（設定の ranking が true）なら、何も出さずに true。オンラインのランキングを使っていなければ、いつも true
  function ensureConsent() {
    if (!isOnline() || Settings.get("ranking")) return Promise.resolve(true);
    const box = $("consent-dialog");
    box.classList.add("active");
    return new Promise((resolve) => {
      const close = (ok) => {
        box.classList.remove("active");
        $("consent-ok").onclick = $("consent-cancel").onclick = $("consent-profile").onclick = null;
        if (ok) {
          Settings.set("ranking", true);
          mem().asked = false; // 初めてのゲームのあとに、プロフィールも公開するかを聞く
          Save.write();
        }
        resolve(ok);
      };
      $("consent-ok").onclick = () => close(true);
      $("consent-cancel").onclick = () => close(false);
      // 名前を出したくない人：プロフィールで名前を変えてから、もう一度選んでもらう
      $("consent-profile").onclick = () => {
        close(false);
        UI.show("profile");
      };
    });
  }

  // 設定画面の「ランキングへの参加」の欄（同意しているかと、取り消しボタン）
  function renderConsent() {
    const on = Settings.get("ranking");
    $("ranking-consent-state").textContent = on
      ? "同意ずみ（スコアアタック・競技の記録がランキングに載ります）"
      : "まだ同意していません（スコアアタック・競技を始めるときに確認します）";
    $("btn-ranking-revoke").classList.toggle("hidden", !on);
  }

  // 同意を取り消す：ranking.gs に、この端末の記録（フリー・競技の両方）を消してもらい、参加をやめる。
  // 次にスコアアタック・競技を遊ぶときに、また同意のダイアログが出る
  async function revokeConsent() {
    if (!(await UI.confirm("ランキングへの参加の同意を取り消しますか？\nランキング（フリー・競技）から、あなたの記録を消します。\n次にスコアアタック・競技を遊ぶときに、また確認します。", "取り消す"))) return;
    let res = null;
    try {
      res = await request(url(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete", id: playerId() }),
      });
    } catch (e) {
      console.warn("ランキングの記録を消せませんでした:", e.message);
    }
    if (!res || !res.ok || res.action !== "delete") {
      // 通信できなかった・古い ranking.gs（記録を消す受付がない）：同意はそのまま
      await UI.alert("ランキングの記録を消せませんでした。\n通信できる場所で、もう一度ためしてください。");
      return;
    }
    Settings.set("ranking", false);
    Object.assign(mem(), { sentScore: 0, sentScoreComp: 0, sentProfile: "", sentProfileComp: "", lastRank: null, asked: false });
    Save.write();
    if (UI.current === "settings") UI.show("settings"); // 設定画面を書きなおす（同意の状態・写真とプロフィールのスイッチ）
    UI.toast("ランキングから、あなたの記録を消しました");
  }

  // 写真アイコンを載せるか、まだ聞いていない（ランキングに参加していて、写真を設定している人だけ）
  function needIconQuestion() {
    return Settings.get("ranking") && !!Save.data.profile.icon && !mem().iconAsked;
  }

  // ---------- 送る ----------
  // 文字列の短い目印（写真が変わったかを見分けるため）
  function digest(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return `${text.length}:${h}`;
  }

  // ランキングで公開するプロフィール（「ランキングでプロフィールを公開」が ON の人だけ送る）
  //   { ach: [達成数, 全部], dex: [登録数, 全部], bg, platform, plays, pieces, online: [勝ち, 負け]（遊んだことがあれば）}
  function publicProfile() {
    const s = Save.data.stats;
    const c = Achievements.counts();
    const cpu = Object.values(s.cpu || {}).reduce((n, r) => n + (r.plays || 0), 0);
    const online = s.online || { plays: 0, wins: 0 };
    const p = {
      dex: [Dex.count(), Dex.total()],
      bg: Save.data.cosmetics.background,
      platform: Save.data.cosmetics.platform,
      plays: s.soloPlays + (s.rulePlays || 0) + (s.compPlays || 0) + s.versusPlays + cpu + (online.plays || 0),
      pieces: s.totalPieces,
    };
    const fav = Custom.myFavorite();
    if (fav) p.fav = fav.id; // お気に入りのキャラ
    if (c) p.ach = [c.got, c.total];
    if (online.plays > 0) p.online = [online.wins, online.plays - online.wins];
    // 持っている実績（称号）の id の一覧。ranking.gs が「みんなの取得率」を数えるのに使う（ランキングには出さない）
    p.achIds = Achievements.unlockedList().map((a) => a.id).sort();
    return p;
  }

  // ---------- みんなの称号の取得率（ranking.gs の ?stats=titles） ----------
  // { players: プロフィールを公開している人の数, counts: { 実績の id: 持っている人の数 } }。
  // 古い ranking.gs・通信できないときは null。10分のあいだは、前に読んだものを使う
  let statsCache = null; // { at, data }
  async function titleStats() {
    if (!isOnline()) return null;
    if (statsCache && Date.now() - statsCache.at < 10 * 60 * 1000) return statsCache.data;
    try {
      const json = await request(`${url()}?stats=titles&t=${Date.now()}`);
      const ok = json && json.mode === "stats" && Number(json.players) > 0 && json.counts && typeof json.counts === "object";
      statsCache = { at: Date.now(), data: ok ? { players: Number(json.players), counts: json.counts } : null };
    } catch (e) {
      return null;
    }
    return statsCache.data;
  }

  // 「持っている人 〇%」の文字（集計にない称号・スタッフの称号は ""）
  function rateText(stats, id) {
    if (!stats || !id || Frames.isStaff(id)) return "";
    const n = Math.max(0, Number(stats.counts[id]) || 0);
    const pct = (n / stats.players) * 100;
    const text = pct === 0 ? "0" : pct < 1 ? "1未満" : String(Math.round(pct));
    return `持っている人 ${text}%`;
  }

  // 自己ベストを送る（参加していない・送る必要がないときは何もしない）。フリーと競技の両方
  async function submitBest() {
    if (!isOnline() || !Settings.get("ranking") || Admin.unlocked) return;
    await submitKind("free");
    await submitKind("comp");
  }

  // サーバー（ranking.gs）が競技に対応しているか（GET ?mode=comp に mode: "comp" が返るか）。
  // 対応していれば覚えておく。対応していなければ、5分たつまで聞きなおさない
  let compServer = null; // { ok, at }
  async function compSupported() {
    if (compServer && (compServer.ok || Date.now() - compServer.at < 5 * 60 * 1000)) return compServer.ok;
    try {
      const json = await request(`${url()}?mode=comp&t=${Date.now()}`);
      compServer = { ok: !!json && json.mode === "comp", at: Date.now() };
    } catch (e) {
      return false; // 通信できなかった（覚えずに、次の機会に聞く）
    }
    return compServer.ok;
  }

  // 1つの種類（free / comp）の自己ベストを送る。
  // 自己ベストが前に送ったものより高いか、名前・称号・写真アイコンが変わったときだけ送る
  async function submitKind(kind) {
    const k = KINDS[kind];
    const best = k.best();
    if (!best) return;
    const p = Save.data.profile;
    const name = Save.playerName(1);
    const title = Profile.titleText(p.titleId);
    const icon = Settings.get("rankingIcon") && p.icon ? await Profile.smallIcon(p.icon) : "";
    const profile = Settings.get("rankingProfile") ? publicProfile() : null;
    // スタッフの称号（開発者・管理者・社員・運営）を獲得してつけている人は、称号の id も送る（ランキングで専用の枠と札を出すため）
    const staff = Frames.isStaff(p.titleId) && Frames.staffGranted(p.titleId) ? p.titleId : "";
    const nameColor = Custom.myColor() || ""; // 名前の色（custom.js）
    const profileKey = `${name}\n${title}\n${staff}\n${nameColor}\n${digest(icon)}\n${JSON.stringify(profile)}`;
    if (best.score <= (mem()[k.sent] || 0) && profileKey === mem()[k.sentProfile]) return;
    if (kind === "comp" && !(await compSupported())) return; // 古い ranking.gs には、競技のスコアを送らない
    try {
      const res = await request(url(), {
        method: "POST",
        // text/plain で送る（Apps Script は、事前の確認の通信（CORS のプリフライト）に答えられないため）
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: kind, id: playerId(), name, title, staff, nameColor, icon, score: best.score, count: best.count, height: best.height, profile }),
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "error");
      const improved = best.score > (mem()[k.sent] || 0);
      mem()[k.sent] = best.score;
      mem()[k.sentProfile] = profileKey;
      Save.write();
      if (res.rank && kind === "free") rememberRank(res.rank);
      if (improved && res.rank) UI.toast(`${kind === "comp" ? "🏁" : "🏆"} ランキング（${k.label}） <b>${Number(res.rank)}位</b>（${Number(res.total)}人中）`);
    } catch (e) {
      // 続けて送りすぎて断られたときは、少し待ってから送りなおす（写真を外したときなど、すぐ反映させたいので）。
      // 通信できなかったときは、次のゲームのあと（か、次に開いたとき）にもう一度送る
      console.warn("ランキングに送れませんでした:", e.message);
      if (e.message === "too fast") setTimeout(submitBest, 6000);
    }
  }

  return { init, atStartup, afterSoloGame, submitBest, joined, opponentKey, ensureConsent, renderConsent, titleStats, rateText };
})();
