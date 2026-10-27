// =============================================
// records.js
// 戦績・プレイ記録（ゲームの結果を記録する処理と、戦績画面）
// =============================================

const Records = (() => {
  const $ = (id) => document.getElementById(id);
  const stats = () => Save.data.stats;

  function init() {
    UI.onShow("records", render);
  }

  // ---------- 記録する（main.js から呼ばれる） ----------
  // キャラを1体積めた（shape：積んだキャラ。レア度・オーラごとの数も数える。実績の判定に使う）
  function addPiece(shape) {
    const s = stats();
    s.totalPieces++;
    if (shape) {
      const rarity = shape.rarity || "N";
      s.placed = s.placed || {};
      s.placed[rarity] = (s.placed[rarity] || 0) + 1;
      if (shape.aura) {
        s.placedAura = s.placedAura || {};
        s.placedAura[shape.aura] = (s.placedAura[shape.aura] || 0) + 1;
      }
    }
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

  // CPU対戦が終わった（won: プレイヤーが勝ったか）。連勝数も数える（負けたら0に戻る）
  function addCpuResult(level, won) {
    const s = stats();
    const r = (s.cpu[level] = s.cpu[level] || { plays: 0, wins: 0 });
    r.plays++;
    if (won) r.wins++;
    r.streak = won ? (r.streak || 0) + 1 : 0;
    r.bestStreak = Math.max(r.bestStreak || 0, r.streak);
    Save.write();
  }

  // オンライン対戦が終わった（won: 自分が勝ったか）
  function addOnlineResult(won) {
    const s = stats();
    s.online.plays++;
    if (won) s.online.wins++;
    Save.write();
  }

  // オンライン対戦の、この相手との成績を記録する（id：相手の目印。古いバージョンの相手は届かないので記録しない）
  const OPPONENTS_MAX = 200; // 覚えておく相手の数（多すぎたら、長く対戦していない相手から消す）
  function addOpponentResult(id, name, won) {
    if (!id) return;
    const all = (Save.data.opponents = Save.data.opponents || {});
    const r = all[id] || { w: 0, l: 0 };
    if (won) r.w++;
    else r.l++;
    r.name = name;
    r.at = Date.now();
    all[id] = r;
    const ids = Object.keys(all);
    if (ids.length > OPPONENTS_MAX) {
      ids.sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
      for (const old of ids.slice(0, ids.length - OPPONENTS_MAX)) delete all[old];
    }
    Save.write();
  }

  // この相手との成績 { w, l }（初めての相手なら null）
  function opponentRecord(id) {
    const r = id && (Save.data.opponents || {})[id];
    return r ? { w: r.w || 0, l: r.l || 0 } : null;
  }

  // イベントのステージ（おばけ屋敷など）の対戦が終わった（won: プレイヤーが勝ったか）。
  // ふつうの CPU 対戦の戦績・実績には数えない。勝ったあとの勝利数を返す
  function addEventResult(eventId, won) {
    const all = (Save.data.eventStats = Save.data.eventStats || {});
    const r = (all[eventId] = all[eventId] || { wins: 0, losses: 0 });
    if (won) r.wins++;
    else r.losses++;
    Save.write();
    return r.wins;
  }

  // イベントのステージの勝利数（遊んでいなければ 0）
  function eventWins(eventId) {
    return ((Save.data.eventStats || {})[eventId] || {}).wins || 0;
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
        .filter(([, p]) => !p.event) // イベント用の強さ（おばけ屋敷など）は、下に別に出す
        .map(([level, p]) => {
          const r = s.cpu[level] || { plays: 0, wins: 0 };
          return item(`CPU（${UI.escape(p.name)}）`, `${r.wins}<small>勝</small> ${r.plays - r.wins}<small>敗</small>`);
        })
        .join("") +
      `</div>` +
      eventSection(item) +
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

  // イベントのステージの戦績（遊んだことがあるか、期間中のイベントだけ）
  function eventSection(item) {
    const rows = Object.keys(window.GAME_CONFIG.events || {})
      .map((id) => {
        const r = (Save.data.eventStats || {})[id];
        if (!r && !LimitedEvents.isActive(id)) return "";
        const ev = (window.GAME_CONFIG.events || {})[id];
        const rule = (window.GAME_CONFIG.rules || {})[ev.rule] || {};
        const label = `${rule.icon || ""} ${UI.escape(LimitedEvents.nameOf(id).replace(/イベント$/, ""))}`;
        return item(label, `${(r && r.wins) || 0}<small>勝</small> ${(r && r.losses) || 0}<small>敗</small>`);
      })
      .join("");
    return rows ? `<h3 class="section-title">イベント</h3><div class="stat-grid">${rows}</div>` : "";
  }

  return { init, addPiece, addEventResult, eventWins, addSoloResult, addRuleResult, addCpuResult, addOnlineResult, addOpponentResult, opponentRecord, addVersusResult };
})();
