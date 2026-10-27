// =============================================
// achievements.js
// 実績・称号（条件と称号は data/achievements.json）
//
// condition の type（条件の種類）：
//   count        … 1回のゲームで value 体積んだ（1人・2人どちらでも）
//   height       … 1回のゲームでタワーの高さが value m に届いた
//   score        … ひとりモード（ふつうのルール）で value 点以上
//   plays        … ゲームを合計 value 回遊んだ（全部のモードの合計）
//   totalPieces  … これまでに合計 value 体積んだ
//   versusWins   … 2人対戦でプレイヤー1が value 回勝った
//   dexCount     … 図鑑に value 体登録した
//   dexComplete  … 図鑑を全部登録した（value は不要）
//   onlineWins   … オンライン対戦で value 回勝った
//   cpuWins      … CPU（level の強さ）に value 回勝った        例 { "type": "cpuWins", "level": "hard", "value": 1 }
//   cpuStreak    … CPU（level の強さ）に value 連勝した
//   ruleScore    … 特殊ルール rule で value 点以上（rule が "all" なら、全部のルールで value 点以上）
//   rarityPlaced … レア度 rarity のキャラを、合計 value 体積んだ（value を省略すると 1）
//   auraPlaced   … auras に書いたオーラ（★4）のキャラを、全部の種類1体以上積んだ   例 { "auras": ["light", "dark"] }
//   noRotate     … ひとりモードの1回のゲームで、回転を使わずに value 体積んだ
//   quickStreak  … ひとりモードの1回のゲームで、1手 seconds 秒以内で value 体続けて積んだ
//   edgeLanding  … 土台の端から ratio（土台の幅に対する割合）以内の所に着地させて、積めた
//   eventWins    … イベント event のステージで value 回勝った   例 { "type": "eventWins", "event": "halloween2026", "value": 3 }
//
// そのほかの項目：
//   category … 実績画面の分類（見出し）。同じ分類の実績をまとめて表示する
//   hidden   … true にすると、達成するまで名前・説明・称号を「？？？」で表示する（隠し実績）
//   rank     … 称号の枠の種類："bronze" / "silver" / "gold" / "legend" / "event"（frames.js）
//   event    … イベントの id を書くと期間限定の実績になる。期間中・達成ずみならふつうに表示し、
//              期間外で未達成なら「期間限定（終了）」と表示して、全体の達成数（〇 / 〇）に数えない
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
  // game: 今のゲームの状況 { mode, rule, count, height, score, rotations, aimTimes, edge }。ゲーム中でなければ null
  function isMet(cond, game) {
    const s = Save.data.stats;
    const v = cond.value || 0;
    const solo = !!game && game.mode === "solo";
    switch (cond.type) {
      case "count":
        return !!game && game.count >= v;
      case "height":
        return !!game && game.height >= v;
      case "score":
        return solo && !game.rule && game.score >= v; // 特殊ルールは数えない
      case "noRotate":
        return solo && game.rotations === 0 && game.count >= v;
      case "quickStreak":
        return solo && longestQuickRun(game.aimTimes || [], (cond.seconds || 3) * 1000) >= v;
      case "edgeLanding":
        return !!game && typeof game.edge === "number" && game.edge <= (cond.ratio || 0.05);
      case "ruleScore":
        return ruleScoreMet(cond.rule, v, game);
      default: {
        // 累計の条件（今の数と、目標の数）
        const p = progress(cond);
        return !!p && p.now >= p.goal;
      }
    }
  }

  // 1手ごとの時間の並びの中で、limit ミリ秒以内が一番長く続いた数
  function longestQuickRun(times, limit) {
    let run = 0, best = 0;
    for (const t of times) {
      run = typeof t === "number" && t <= limit ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }

  // 特殊ルールのスコア（"all" なら全部のルール）。記録したハイスコアか、今のゲームのスコアで判定する
  function ruleScoreMet(rule, v, game) {
    const s = Save.data.stats;
    const scoreOf = (id) => Math.max((s.ruleBest[id] || {}).score || 0, game && game.mode === "solo" && game.rule === id ? game.score : 0);
    if (rule === "all") {
      const all = Rules.list().filter((r) => !r.params.event); // 期間限定のルールは数えない
      return all.length > 0 && all.every((r) => scoreOf(r.id) >= v);
    }
    return scoreOf(rule) >= v;
  }

  // 累計の条件の進み具合 { now, goal }（累計でない条件なら null）。実績画面のバーにも使う
  function progress(cond) {
    const s = Save.data.stats;
    const v = cond.value || 0;
    const cpu = (s.cpu || {})[cond.level] || {};
    switch (cond.type) {
      case "plays": {
        // 全部のモードの合計（ひとり・特殊ルール・ともだちと・CPU・オンライン）
        const cpuPlays = Object.values(s.cpu || {}).reduce((sum, r) => sum + (r.plays || 0), 0);
        return { now: s.soloPlays + (s.rulePlays || 0) + s.versusPlays + cpuPlays + ((s.online || {}).plays || 0), goal: v };
      }
      case "totalPieces":
        return { now: s.totalPieces, goal: v };
      case "versusWins":
        return { now: s.versusWins[1] || 0, goal: v };
      case "dexCount":
        return { now: Dex.count(), goal: v };
      case "dexComplete":
        return { now: Dex.count(), goal: Dex.total() };
      case "onlineWins":
        return { now: (s.online || {}).wins || 0, goal: v };
      case "cpuWins":
        return { now: cpu.wins || 0, goal: v };
      case "cpuStreak":
        return { now: cpu.bestStreak || 0, goal: v };
      case "eventWins":
        return { now: Records.eventWins(cond.event), goal: v };
      case "rarityPlaced":
        return { now: (s.placed || {})[cond.rarity] || 0, goal: v || 1 };
      case "auraPlaced": {
        const auras = cond.auras || [];
        return { now: auras.filter((a) => ((s.placedAura || {})[a] || 0) > 0).length, goal: auras.length };
      }
      default:
        return null;
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
    // 実績の達成で、新しい背景・土台が解放されたら知らせる
    if (typeof Themes !== "undefined") Themes.notifyUnlocked(newly);
    return newly;
  }

  // id から実績を探す（背景・土台の解放条件の説明に使う）。無ければ null
  function find(id) {
    return (defs || []).find((a) => a.id === id) || null;
  }

  // 称号の文字から実績を探す（ランキングの称号の枠を決めるのに使う）。無ければ null
  function findByTitle(title) {
    return (defs || []).find((a) => a.title === title) || null;
  }

  // 達成した数と全体の数 { got, total }（実績画面と同じく、もう取れない期間限定の実績は数えない）。
  // 読み込めていなければ null
  function counts() {
    if (!defs) return null;
    const counted = defs.filter((a) => !closed(a));
    return { got: counted.filter((a) => unlocked()[a.id]).length, total: counted.length };
  }

  // 達成した実績の一覧 [{ id, title }]（プロフィールの称号の選択肢に使う）
  function unlockedList() {
    return (defs || []).filter((a) => unlocked()[a.id]).map((a) => ({ id: a.id, title: a.title }));
  }

  // ---------- 実績画面 ----------
  // 分類（category）ごとに見出しをつけて並べる。隠し実績は、達成するまで「？？？」
  function render() {
    const box = $("achievements-list");
    if (!defs) {
      $("achievements-count").textContent = "";
      box.innerHTML = `<p class="empty-message">実績を取得できません。<br>通信できる場所で、もう一度開いてください。</p>`;
      load().then(() => defs && UI.current === "achievements" && render());
      return;
    }
    // 期間が終わって、もう取れない期間限定の実績は、全体の数に入れない
    const c = counts();
    $("achievements-count").textContent = `${c.got} / ${c.total}`;
    // 分類ごとにまとめる（json に書いた順番のまま）
    const groups = new Map();
    for (const a of defs) {
      const cat = a.category || "そのほか";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(a);
    }
    box.innerHTML = [...groups.entries()]
      .map(([cat, list]) => {
        const open = list.filter((a) => !closed(a));
        const done = open.filter((a) => unlocked()[a.id]).length;
        return `<h3 class="ach-section">${UI.escape(cat)}<small>${done} / ${open.length}</small></h3>` + list.map(rowHTML).join("");
      })
      .join("");
  }

  // 期間限定の実績で、期間外（開催前・終了）で、まだ達成していない（もう取れない）か
  function closed(a) {
    return !!a.event && !unlocked()[a.id] && !LimitedEvents.isActive(a.event);
  }

  // 1つ分の行
  function rowHTML(a) {
    const at = unlocked()[a.id];
    if (closed(a)) {
      const label = LimitedEvents.status(a.event) === "before" ? "期間限定（開催前）" : "期間限定（終了）";
      return `
      <div class="ach-row ach-locked ach-closed">
        <span class="ach-icon">⌛</span>
        <span class="ach-main">
          <b>${UI.escape(a.name)}</b>
          <small>${UI.escape(a.description || "")}</small>
          <span class="ach-title ach-limited">${label}</span>
        </span>
      </div>`;
    }
    const date = at ? new Date(at) : null;
    const secret = a.hidden && !at; // 隠し実績で、まだ達成していない
    // 累計の実績は、進み具合のバー（達成していない・隠していないものだけ）
    const p = !at && !secret && a.condition ? progress(a.condition) : null;
    const bar = p && p.goal > 0
      ? `<span class="ach-progress"><i style="width:${Math.min(100, (p.now / p.goal) * 100)}%"></i></span><span class="ach-progress-text">${Math.min(p.now, p.goal)} / ${p.goal}</span>`
      : "";
    return `
      <div class="ach-row ${at ? "ach-done" : "ach-locked"} ${secret ? "ach-secret" : ""}">
        <span class="ach-icon">${at ? "🏆" : secret ? "❓" : "🔒"}</span>
        <span class="ach-main">
          <b>${secret ? "？？？" : UI.escape(a.name)}${a.event ? ` <span class="limited-tag">期間限定</span>` : ""}</b>
          <small>${secret ? "？？？（隠し実績）" : UI.escape(a.description || "")}</small>
          <span class="ach-title">称号「${UI.escape(at ? a.title : "？？？")}」</span>
          ${bar}
        </span>
        ${date ? `<span class="ach-date">${date.getMonth() + 1}/${date.getDate()}</span>` : ""}
      </div>`;
  }

  // 管理者モード：全部達成する（on=true）／全部消す（on=false）
  function setAll(on) {
    const now = new Date().toISOString();
    for (const key of Object.keys(unlocked())) delete unlocked()[key];
    if (on) for (const a of defs || []) unlocked()[a.id] = now;
    Save.write();
    if (typeof Themes !== "undefined") Themes.apply(); // 使えなくなった背景・土台は元に戻す
    if (typeof Profile !== "undefined") Profile.refresh();
  }

  return { init, load, check, counts, unlockedList, find, findByTitle, setAll };
})();
