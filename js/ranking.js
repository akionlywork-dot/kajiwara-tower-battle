// =============================================
// ranking.js
// ランキング
//
// config.js の ranking.url を設定したとき（オンライン）：
//   Google スプレッドシート（Apps Script。server/ranking.gs）にハイスコアを自動で送り、ランキングを読みに行く。
//   送るのは「名前・称号・スコア・積んだ数・高さ」と、この端末のランダムな番号。
//   写真アイコンは、本人が「載せる」を選んだときだけ、小さくして送る。
//   スコアアタック（ふつうのルール）だけが対象（特殊ルールは載せない）。最初に1回だけ「送ってもいいか」を聞く
// ranking.url が "" のとき：
//   data/ranking.json（手で書きかえて更新する）を表示する。スコアはどこにも送らない
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

  function init() {
    UI.onShow("ranking", open);
    // 設定画面の「ランキングに参加」「写真アイコンを載せる」は、オンラインのランキングを使うときだけ出す
    $("setting-ranking-row").classList.toggle("hidden", !isOnline());
    $("setting-ranking-icon-row").classList.toggle("hidden", !isOnline());
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
  async function open() {
    renderMine(null);
    const box = $("ranking-list");
    box.innerHTML = `<p class="empty-message">読み込み中…</p>`;
    let json = null;
    if (isOnline()) {
      await submitBest(); // 名前・称号・アイコンを変えていたら、先に送っておく（自分の行に反映されるように）
      try {
        json = await request(`${url()}?me=${encodeURIComponent(playerId())}&t=${Date.now()}`);
      } catch (e) {
        console.warn("ランキングを読み込めませんでした:", e.message);
      }
    } else {
      json = await DataFile.load("data/ranking.json");
    }
    if (UI.current !== "ranking") return; // 読み込み中に画面を閉じた
    if (!json || !Array.isArray(json.ranking)) {
      box.innerHTML = `<p class="empty-message">ランキングを取得できません。<br>通信できる場所で、もう一度開いてください。</p>`;
      return;
    }
    // 順位の順に並べる（ファイルの書き順がバラバラでも大丈夫なように）
    const list = json.ranking.slice().sort((a, b) => a.rank - b.rank);
    const updated = json.updated ? `<p class="ranking-updated">${UI.escape(json.updated)} 更新</p>` : "";
    box.innerHTML =
      updated +
      (list.length
        ? list.map(rowHTML).join("")
        : isOnline()
        ? `<div class="coming-soon"><span>🏆</span><b>まだ記録がありません</b><p>スコアアタックで遊ぶと、ハイスコアがここに載ります。</p></div>`
        : `<div class="coming-soon"><span>🏆</span><b>ランキングは準備中です</b><p>お楽しみに！<br>まずはハイスコアを目指して遊んでみてください。</p></div>`);
    if (json.me) rememberRank(json.me.rank);
    renderMine(json.me || null);
  }

  // 1人分の行（アイコン・名前・称号。自分の行は目立たせる）
  function rowHTML(r) {
    const medal = MEDALS[r.rank] || "";
    const height = Number(r.height);
    const name = String(r.name || "");
    const icon = ICON_PATTERN.test(String(r.icon || "")) ? r.icon : null;
    // 称号の枠：サーバーには称号の文字しか無いので、その文字から実績を探して決める（見つからなければ枠なし）
    const frame = Frames.ofTitleText(String(r.title || ""));
    const fc = Frames.avatarClass(frame);
    const avatar = icon
      ? `<span class="avatar rank-avatar ${fc}" style="background-image:url(${icon})"></span>`
      : `<span class="avatar avatar-empty rank-avatar ${fc}">${UI.escape([...name][0] || "?")}</span>`;
    return `
      <div class="rank-row ${medal ? "rank-" + medal : ""} ${r.me ? "rank-me" : ""}">
        <span class="rank-num">${Number(r.rank)}</span>
        ${avatar}
        <span class="rank-main">
          <b>${UI.escape(name)}${r.me ? `<em class="rank-you">あなた</em>` : ""}</b>
          ${r.title ? Frames.titleHTML(String(r.title), frame) : ""}
          <small>${Number(r.count)}体・${isNaN(height) ? "-" : height.toFixed(2)}m・${UI.escape(r.date || "")}</small>
        </span>
        <span class="rank-score">${Number(r.score)}<small>点</small></span>
      </div>`;
  }

  // 画面の下：自分のハイスコア（オンラインなら順位も）
  function renderMine(me) {
    const best = Save.data.stats.best;
    let note = "";
    if (isOnline() && best) {
      if (!Settings.get("ranking")) note = `<small class="my-rank">ランキングに参加していません（設定で変えられます）</small>`;
      else if (me) note = `<small class="my-rank">あなたは <b>${Number(me.rank)}位</b></small>`;
    }
    $("ranking-mine").innerHTML =
      `<span class="my-record-label">あなたのハイスコア</span>` +
      Profile.badgeHTML() +
      (best
        ? `<span class="rank-score">${best.score}<small>点</small><em>${best.count}体・${best.height.toFixed(2)}m</em>${note}</span>`
        : `<span class="my-record-none">まだ記録がありません</span>`);
  }

  // ---------- 参加の確認 ----------
  // アプリを開いたとき（main.js から呼ばれる）：
  // 前からハイスコアがある人には、遊ばなくても「送っていいか」を聞いて、自己ベストを載せる。
  // 参加ずみの人は、前に送れなかった記録や、変えた名前・称号・アイコンを送りなおす
  async function atStartup() {
    if (!isOnline()) return;
    if ((!mem().asked && Save.data.stats.best) || needIconQuestion()) {
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

  // スコアアタック（ふつうのルール）が終わったときに main.js から呼ばれる。
  // 初めてなら「送ってもいいか」を聞く（写真アイコンがある人には、写真を載せるかも聞く）
  async function afterSoloGame() {
    if (!isOnline()) return;
    if (!mem().asked && Save.data.stats.best) {
      mem().asked = true;
      Save.write();
      const yes = await UI.confirm(
        `あなたのハイスコア（${Save.data.stats.best.score}点）を、みんなのランキングに載せますか？\nこれからも、自己ベストを更新したら自動で送ります。\n\n送るもの：名前「${Save.playerName(1)}」・称号・スコア・積んだ数・高さ\n名前と称号はランキングで公開されます。\n（設定画面でいつでも変えられます）`,
        "送る",
        true,
        "送らない"
      );
      Settings.set("ranking", yes);
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

  // 自己ベストを送る（参加していない・送る必要がないときは何もしない）
  // 自己ベストが前に送ったものより高いか、名前・称号・写真アイコンが変わったときだけ送る
  async function submitBest() {
    const best = Save.data.stats.best;
    if (!isOnline() || !Settings.get("ranking") || !best) return;
    const p = Save.data.profile;
    const name = Save.playerName(1);
    const title = Profile.titleText(p.titleId);
    const icon = Settings.get("rankingIcon") && p.icon ? await Profile.smallIcon(p.icon) : "";
    const profileKey = `${name}\n${title}\n${digest(icon)}`;
    if (best.score <= mem().sentScore && profileKey === mem().sentProfile) return;
    try {
      const res = await request(url(), {
        method: "POST",
        // text/plain で送る（Apps Script は、事前の確認の通信（CORS のプリフライト）に答えられないため）
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ id: playerId(), name, title, icon, score: best.score, count: best.count, height: best.height }),
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "error");
      const improved = best.score > mem().sentScore;
      mem().sentScore = best.score;
      mem().sentProfile = profileKey;
      Save.write();
      if (res.rank) rememberRank(res.rank);
      if (improved && res.rank) UI.toast(`🏆 ランキング <b>${Number(res.rank)}位</b>（${Number(res.total)}人中）`);
    } catch (e) {
      // 続けて送りすぎて断られたときは、少し待ってから送りなおす（写真を外したときなど、すぐ反映させたいので）。
      // 通信できなかったときは、次のゲームのあと（か、次に開いたとき）にもう一度送る
      console.warn("ランキングに送れませんでした:", e.message);
      if (e.message === "too fast") setTimeout(submitBest, 6000);
    }
  }

  return { init, atStartup, afterSoloGame, submitBest, joined, opponentKey };
})();
