// =============================================
// achievements.js
// 実績・称号（条件と称号は data/achievements.json）
//
// condition の type（条件の種類）：
//   count       … 1回のゲームで value 体積んだ（1人・2人どちらでも）
//   height      … 1回のゲームでタワーの高さが value m に届いた
//   score       … ひとりモードで value 点以上
//   plays       … ゲームを合計 value 回遊んだ（1人・2人の合計）
//   totalPieces … これまでに合計 value 体積んだ
//   versusWins  … 2人対戦でプレイヤー1が value 回勝った
//   dexCount    … 図鑑に value 体登録した
//   dexComplete … 図鑑を全部登録した（value は不要）
// =============================================

const Achievements = (() => {
  const $ = (id) => document.getElementById(id);
  let defs = null; // achievements.json の中身。読み込めなかったら null
  const unlocked = () => Save.data.achievements; // 実績の id → 達成した日時

  function init() {
    UI.onShow("achievements", render);
  }

  async function load() {
    const json = await DataFile.load("data/achievements.json");
    defs = json && Array.isArray(json.achievements) ? json.achievements : null;
  }

  // ---------- 条件の判定 ----------
  // game: 今のゲームの状況 { mode, count, height, score }。ゲーム中でなければ null
  function isMet(cond, game) {
    const s = Save.data.stats;
    const v = cond.value || 0;
    switch (cond.type) {
      case "count":
        return !!game && game.count >= v;
      case "height":
        return !!game && game.height >= v;
      case "score":
        return !!game && game.mode === "solo" && game.score >= v;
      case "plays":
        return s.soloPlays + s.versusPlays >= v;
      case "totalPieces":
        return s.totalPieces >= v;
      case "versusWins":
        return (s.versusWins[1] || 0) >= v;
      case "dexCount":
        return Dex.count() >= v;
      case "dexComplete":
        return Dex.count() >= Dex.total();
      default:
        return false; // 知らない種類の条件は、達成しない
    }
  }

  // まだ達成していない実績を調べて、条件を満たしていたら達成にする（そして通知する）
  // ゲーム中（1体積むごと）とリザルトのときに、main.js から呼ばれる
  function check(game) {
    if (!defs) return [];
    const newly = defs.filter((a) => !unlocked()[a.id] && a.condition && isMet(a.condition, game));
    if (!newly.length) return [];
    for (const a of newly) {
      unlocked()[a.id] = new Date().toISOString();
      UI.toast(
        `<span class="toast-medal">🏆</span><span><b>実績解除！</b> ${UI.escape(a.name)}` +
          `<small class="toast-sub">称号「${UI.escape(a.title)}」を獲得</small></span>`
      );
    }
    Save.write();
    Sound.play("record");
    return newly;
  }

  // 達成した実績の一覧 [{ id, title }]（プロフィールの称号の選択肢に使う）
  function unlockedList() {
    return (defs || []).filter((a) => unlocked()[a.id]).map((a) => ({ id: a.id, title: a.title }));
  }

  // ---------- 実績画面 ----------
  function render() {
    const box = $("achievements-list");
    if (!defs) {
      $("achievements-count").textContent = "";
      box.innerHTML = `<p class="empty-message">実績を取得できません。<br>通信できる場所で、もう一度開いてください。</p>`;
      load().then(() => defs && UI.current === "achievements" && render());
      return;
    }
    const got = defs.filter((a) => unlocked()[a.id]).length;
    $("achievements-count").textContent = `${got} / ${defs.length}`;
    box.innerHTML = defs
      .map((a) => {
        const at = unlocked()[a.id];
        const date = at ? new Date(at) : null;
        return `
          <div class="ach-row ${at ? "ach-done" : "ach-locked"}">
            <span class="ach-icon">${at ? "🏆" : "🔒"}</span>
            <span class="ach-main">
              <b>${UI.escape(a.name)}</b>
              <small>${UI.escape(a.description || "")}</small>
              <span class="ach-title">称号「${UI.escape(at ? a.title : "？？？")}」</span>
            </span>
            ${date ? `<span class="ach-date">${date.getMonth() + 1}/${date.getDate()}</span>` : ""}
          </div>`;
      })
      .join("");
  }

  return { init, load, check, unlockedList };
})();
