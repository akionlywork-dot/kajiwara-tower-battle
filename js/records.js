// =============================================
// records.js
// 戦績・プレイ記録（ゲームの結果を記録する処理と、戦績画面）
// =============================================

const Records = (() => {
  const $ = (id) => document.getElementById(id);
  const stats = () => Save.data.stats;

  function init() {
    UI.onShow("records", render);
    $("btn-records-reset").addEventListener("click", async () => {
      const ok = await UI.confirm(
        "戦績をリセットしますか？\nプレイ回数・ハイスコア・勝利数などが消えます。\n（プロフィール・図鑑・実績は消えません）",
        "リセット"
      );
      if (!ok) return;
      Save.resetStats();
      render();
      UI.toast("戦績をリセットしました");
    });
  }

  // ---------- 記録する（main.js から呼ばれる） ----------
  // キャラを1体積めた
  function addPiece() {
    stats().totalPieces++;
    Save.write();
  }

  // 1人モードが終わった。ハイスコアを更新したら true を返す
  function addSoloResult(score, count, height) {
    const s = stats();
    s.soloPlays++;
    s.soloTotalScore += score;
    s.bestCount = Math.max(s.bestCount, count);
    s.bestHeight = Math.max(s.bestHeight, height);
    const isNew = !s.best || score > s.best.score;
    if (isNew) s.best = { score, count, height };
    Save.write();
    return isNew;
  }

  // 特殊ルールが終わった。そのルールのハイスコアを更新したら true を返す
  function addRuleResult(ruleId, score, count, height) {
    const s = stats();
    s.rulePlays++;
    const best = s.ruleBest[ruleId];
    const isNew = !best || score > best.score;
    if (isNew) s.ruleBest[ruleId] = { score, count, height };
    Save.write();
    return isNew;
  }

  // CPU対戦が終わった（won: プレイヤーが勝ったか）
  function addCpuResult(level, won) {
    const s = stats();
    const r = (s.cpu[level] = s.cpu[level] || { plays: 0, wins: 0 });
    r.plays++;
    if (won) r.wins++;
    Save.write();
  }

  // オンライン対戦が終わった（won: 自分が勝ったか）
  function addOnlineResult(won) {
    const s = stats();
    s.online.plays++;
    if (won) s.online.wins++;
    Save.write();
  }

  // 2人対戦が終わった
  function addVersusResult(winner) {
    const s = stats();
    s.versusPlays++;
    s.versusWins[winner] = (s.versusWins[winner] || 0) + 1;
    Save.write();
  }

  // ---------- 戦績画面 ----------
  function render() {
    const s = stats();
    const avg = s.soloPlays ? Math.round(s.soloTotalScore / s.soloPlays) : 0;
    const item = (label, value) => `<div class="stat-item"><span>${label}</span><b>${value}</b></div>`;
    $("records-content").innerHTML =
      `<h3 class="section-title">ひとりで</h3>` +
      `<div class="stat-grid">` +
      item("プレイ回数", `${s.soloPlays}<small>回</small>`) +
      item("ハイスコア", s.best ? `${s.best.score}<small>点</small>` : "---") +
      item("平均スコア", s.soloPlays ? `${avg}<small>点</small>` : "---") +
      item("最高の積んだ数", `${s.bestCount}<small>体</small>`) +
      item("最高の高さ", `${s.bestHeight.toFixed(2)}<small>m</small>`) +
      `</div>` +
      `<h3 class="section-title">ふたりで</h3>` +
      `<div class="stat-grid">` +
      item("対戦回数", `${s.versusPlays}<small>回</small>`) +
      item(`${UI.escape(Save.playerName(1))} の勝利`, `${s.versusWins[1] || 0}<small>勝</small>`) +
      item(`${UI.escape(Save.playerName(2))} の勝利`, `${s.versusWins[2] || 0}<small>勝</small>`) +
      `</div>` +
      `<h3 class="section-title">オンライン対戦</h3>` +
      `<div class="stat-grid">` +
      item("対戦回数", `${s.online.plays}<small>回</small>`) +
      item("勝ち・負け", `${s.online.wins}<small>勝</small> ${s.online.plays - s.online.wins}<small>敗</small>`) +
      `</div>` +
      `<h3 class="section-title">CPU対戦</h3>` +
      `<div class="stat-grid">` +
      Object.entries(window.GAME_CONFIG.cpu)
        .map(([level, p]) => {
          const r = s.cpu[level] || { plays: 0, wins: 0 };
          return item(`CPU（${UI.escape(p.name)}）`, `${r.wins}<small>勝</small> ${r.plays - r.wins}<small>敗</small>`);
        })
        .join("") +
      `</div>` +
      `<h3 class="section-title">特殊ルール</h3>` +
      `<div class="stat-grid">` +
      item("プレイ回数", `${s.rulePlays}<small>回</small>`) +
      Rules.list()
        .map((r) => {
          const best = s.ruleBest[r.id];
          return item(`${r.params.icon || ""} ${UI.escape(r.params.name)}`, best ? `${best.score}<small>点</small>` : "---");
        })
        .join("") +
      `</div>` +
      `<h3 class="section-title">合計</h3>` +
      `<div class="stat-grid">` +
      item("積んだキャラの数", `${s.totalPieces}<small>体</small>`) +
      `</div>`;
  }

  return { init, addPiece, addSoloResult, addRuleResult, addCpuResult, addOnlineResult, addVersusResult };
})();
