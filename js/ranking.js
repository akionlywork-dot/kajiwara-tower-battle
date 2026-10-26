// =============================================
// ranking.js
// ランキング（内容は data/ranking.json。手で書きかえて更新する）
// 画面を開くたびに、最新のファイルを読み直す
// =============================================

const Ranking = (() => {
  const $ = (id) => document.getElementById(id);
  const MEDALS = { 1: "gold", 2: "silver", 3: "bronze" }; // 上位3位の色

  function init() {
    UI.onShow("ranking", open);
  }

  async function open() {
    renderMine();
    const box = $("ranking-list");
    box.innerHTML = `<p class="empty-message">読み込み中…</p>`;
    const json = await DataFile.load("data/ranking.json");
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
        : `<div class="coming-soon"><span>🏆</span><b>ランキングは準備中です</b><p>お楽しみに！<br>まずはハイスコアを目指して遊んでみてください。</p></div>`);
  }

  // 1人分の行
  function rowHTML(r) {
    const medal = MEDALS[r.rank] || "";
    const height = Number(r.height);
    return `
      <div class="rank-row ${medal ? "rank-" + medal : ""}">
        <span class="rank-num">${Number(r.rank)}</span>
        <span class="rank-main">
          <b>${UI.escape(r.name)}</b>
          <small>${Number(r.count)}体・${isNaN(height) ? "-" : height.toFixed(2)}m・${UI.escape(r.date || "")}</small>
        </span>
        <span class="rank-score">${Number(r.score)}<small>点</small></span>
      </div>`;
  }

  // 画面の下：自分のハイスコア
  function renderMine() {
    const best = Save.data.stats.best;
    $("ranking-mine").innerHTML =
      `<span class="my-record-label">あなたのハイスコア</span>` +
      Profile.badgeHTML() +
      (best
        ? `<span class="rank-score">${best.score}<small>点</small><em>${best.count}体・${best.height.toFixed(2)}m</em></span>`
        : `<span class="my-record-none">まだ記録がありません</span>`);
  }

  return { init };
})();
