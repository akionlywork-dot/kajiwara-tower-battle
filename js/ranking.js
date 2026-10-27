// =============================================
// ranking.js
// ランキング
//
// config.js の ranking.url を設定したとき（オンライン）：
//   Google スプレッドシート（Apps Script。server/ranking.gs）にハイスコアを自動で送り、ランキングを読みに行く。
//   送るのは「名前・スコア・積んだ数・高さ」と、この端末のランダムな番号だけ（写真は送らない）。
//   ふつうのルールのひとりモードだけが対象。最初に1回だけ「送ってもいいか」を聞く
// ranking.url が "" のとき：
//   data/ranking.json（手で書きかえて更新する）を表示する。スコアはどこにも送らない
// =============================================

const Ranking = (() => {
  const $ = (id) => document.getElementById(id);
  const MEDALS = { 1: "gold", 2: "silver", 3: "bronze" }; // 上位3位の色
  const TIMEOUT = 10000; // 通信を待つ時間（ミリ秒）

  const url = () => ((window.GAME_CONFIG.ranking || {}).url || "").trim();
  const isOnline = () => !!url();
  const mem = () => Save.data.ranking;

  function init() {
    UI.onShow("ranking", open);
    // 設定画面の「ランキングに参加」は、オンラインのランキングを使うときだけ出す
    $("setting-ranking-row").classList.toggle("hidden", !isOnline());
  }

  // この端末の番号（初めて使うときに作る）
  function playerId() {
    if (!mem().id) {
      mem().id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      Save.write();
    }
    return mem().id;
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
        ? `<div class="coming-soon"><span>🏆</span><b>まだ記録がありません</b><p>ひとりモードで遊ぶと、ハイスコアがここに載ります。</p></div>`
        : `<div class="coming-soon"><span>🏆</span><b>ランキングは準備中です</b><p>お楽しみに！<br>まずはハイスコアを目指して遊んでみてください。</p></div>`);
    renderMine(json.me || null);
  }

  // 1人分の行（自分の行は目立たせる）
  function rowHTML(r) {
    const medal = MEDALS[r.rank] || "";
    const height = Number(r.height);
    return `
      <div class="rank-row ${medal ? "rank-" + medal : ""} ${r.me ? "rank-me" : ""}">
        <span class="rank-num">${Number(r.rank)}</span>
        <span class="rank-main">
          <b>${UI.escape(r.name)}${r.me ? `<em class="rank-you">あなた</em>` : ""}</b>
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

  // ---------- ハイスコアを送る ----------
  // アプリを開いたとき（main.js から呼ばれる）：
  // 前からハイスコアがある人には、遊ばなくても「送っていいか」を聞いて、自己ベストを載せる。
  // 参加ずみの人は、前に送れなかった記録や、変えた名前を送りなおす
  async function atStartup() {
    if (!isOnline()) return;
    if (!mem().asked && Save.data.stats.best) {
      await waitTitle();
      if (!mem().asked) return afterSoloGame(); // 待っているあいだに、ゲームのあとで聞いていなければ
    }
    return submitBest();
  }

  // タイトル画面で、ほかのポップアップ（お知らせ・挑戦状など）が出ていないときまで待つ
  async function waitTitle() {
    while (UI.current !== "title" || document.querySelector(".dialog.active") || !$("splash").classList.contains("hidden")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // ひとりモード（ふつうのルール）が終わったときに main.js から呼ばれる。
  // 初めてなら「送ってもいいか」を聞く。自己ベストが前に送ったものより高いか、名前が変わったときだけ送る
  async function afterSoloGame() {
    if (!isOnline()) return;
    if (!mem().asked) {
      mem().asked = true;
      Save.write();
      const yes = await UI.confirm(
        `あなたのハイスコア（${Save.data.stats.best.score}点）を、みんなのランキングに載せますか？\nこれからも、自己ベストを更新したら自動で送ります。\n\n送るもの：名前「${Save.playerName(1)}」・スコア・積んだ数・高さ\n名前はランキングで公開されます。写真は送りません。\n（設定画面でいつでも変えられます）`,
        "送る",
        true,
        "送らない"
      );
      Settings.set("ranking", yes);
    }
    await submitBest();
  }

  // 自己ベストを送る（参加していない・送る必要がないときは何もしない）
  async function submitBest() {
    const best = Save.data.stats.best;
    if (!isOnline() || !Settings.get("ranking") || !best) return;
    const name = Save.playerName(1);
    if (best.score <= mem().sentScore && name === mem().sentName) return;
    try {
      const res = await request(url(), {
        method: "POST",
        // text/plain で送る（Apps Script は、事前の確認の通信（CORS のプリフライト）に答えられないため）
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ id: playerId(), name, score: best.score, count: best.count, height: best.height }),
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "error");
      mem().sentScore = best.score;
      mem().sentName = name;
      Save.write();
      if (res.rank) UI.toast(`🏆 ランキング <b>${Number(res.rank)}位</b>（${Number(res.total)}人中）`);
    } catch (e) {
      // 通信できなかったときは、次のゲームのあとにもう一度送る
      console.warn("ランキングに送れませんでした:", e.message);
    }
  }

  return { init, atStartup, afterSoloGame, submitBest };
})();
