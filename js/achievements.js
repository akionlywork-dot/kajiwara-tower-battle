// =============================================
// achievements.js
// 実績・称号（条件と称号は data/achievements.json）
//
// condition の type（条件の種類）：
//   count        … 1回のゲームで value 体積んだ（1人・2人どちらでも。対戦は2人の合計）
//   ownCount     … 1回のゲームで、自分が value 体積んだ（対戦は自分が落として積めた数だけ。オンラインは自分の側、ともだち・CPU はプレイヤー1）
//   height       … 1回のゲームでタワーの高さが value m に届いた
//   score        … ひとりモードで value 点以上（スコアアタックのふつう・特殊ルール（期間限定もふくむ）・競技のどれでも。対戦は数えない）
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
//   flipPlaced   … 1回のゲームで、反転したキャラを value 体積んだ
//   noRotateFlip … ひとりモードの1回のゲームで、回転も反転も使わずに value 体積んだ
//   afterBig     … ビッグ（variant: "big"）のキャラを積んだあと、同じゲームでさらに value 体積んだ
//   buzzerBeater … オンライン対戦で、制限時間の残り seconds 秒以内に落として、積めた
//   challengeWins… 挑戦状で、相手のスコアを上回った回数が value 回
//   stampsSent   … オンライン対戦のリザルトで、スタンプを value 回送った
//   rarityDrawn  … レア度 rarity のキャラが、自分の番に value 回出た（積めなくてもよい）
//   dexAll       … 条件に合うキャラを、全部図鑑に登録した   例 { "type": "dexAll", "rarity": "MR" } / { "type": "dexAll", "variant": true } / { "type": "dexAll", "ids": ["chara16", "chara17"] }
//   fallFirst    … ひとりモードで、1体目で落とした
//   dejaVu       … 1回のゲームで、同じキャラが1体おきに3回出た（A→？→A→？→A）
//   flipStreak   … 1体を落とす前に、反転を value 回続けて押した
//   exactHeight  … タワーの高さが、ちょうど value m（画面の表示の数字。小数2けた）のときに積めた
//   together     … ids に書いたキャラを全部、1回のゲームで同じタワーに積んだ（だれが積んでもよい。1体でも落ちるとゲームが終わるので、全員タワーに乗っている）。
//                  競技では数えない（★4 の公安・別班も同じ確率で出て、すぐそろってしまうため）
//   sameChar     … 1回のゲームで、同じキャラを value 体積んだ
//   variety      … 1回のゲームで、ちがうキャラを value 種類積んだ（競技では数えない）
//   rarityStack  … rarities に書いたレア度のキャラを、1回のゲームで（同じタワーに）合わせて value 体以上積んだ（同じキャラでもよい。競技では数えない）
//                  例 { "type": "rarityStack", "rarities": ["MR", "SEC"], "value": 2 }
//   rarityMix    … rarities に書いたレア度のキャラを、1回のゲームで全部（1体ずつ以上）積んだ（競技では数えない）
//                  例 { "type": "rarityMix", "rarities": ["N", "R", "SR", "UR", "MR"] }
//                  例 { "type": "together", "ids": ["chara18", "chara19"] }
//   ※ 管理者モードの自由配置モードでは、実績の判定をしない（記録の処理を通らないため）
//
// そのほかの項目：
//   category … 実績画面の分類（見出し）。同じ分類の実績をまとめて表示する
//   hidden   … true にすると、達成するまで名前・説明・称号を「？？？」で表示する（隠し実績）
//   hideCondition … true にすると、達成するまで説明（条件）だけを「？？？（条件はひみつ）」にする。名前は見せる（組み合わせの実績）
//   rank     … 称号の枠の種類："bronze" / "silver" / "gold" / "legend" / "mythic"（まぼろし・星5つ）/ "event" / "secret"（隠し）（frames.js）
//   decoration … （省略可）アイコンのふちに並べる飾り："star"（星。省略したとき）/ "pumpkin"（カボチャ）（frames.js の DECORATIONS）
//   reward   … （省略可）ごほうびの背景・土台。{ "background": "背景の id" } か { "platform": "土台の id" }。
//              その背景・土台は、config.js の themes で unlock: "achievement" と書いておく（見た目の色は config.js）
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
  // game: 今のゲームの状況（main.js の gameStatus）。ゲーム中でなければ null
  function isMet(cond, game) {
    const s = Save.data.stats;
    const v = cond.value || 0;
    const solo = !!game && game.mode === "solo";
    switch (cond.type) {
      case "ownCount":
        return !!game && (game.ownCount || 0) >= v;
      case "count":
        return !!game && game.count >= v;
      case "height":
        return !!game && game.height >= v;
      case "score":
        return solo && game.score >= v; // ひとりモードなら、どのルールでも（対戦は数えない）
      case "noRotate":
        return solo && game.rotations === 0 && game.count >= v;
      case "quickStreak":
        return solo && longestQuickRun(game.aimTimes || [], (cond.seconds || 3) * 1000) >= v;
      case "edgeLanding":
        return !!game && typeof game.edge === "number" && game.edge <= (cond.ratio || 0.05);
      case "ruleScore":
        return ruleScoreMet(cond.rule, v, game);
      case "flipPlaced":
        return !!game && (game.flipPlaced || 0) >= v;
      case "noRotateFlip":
        return solo && game.rotations === 0 && game.flips === 0 && game.count >= v;
      case "afterBig":
        return !!game && (game.afterBig || 0) >= v;
      case "buzzerBeater":
        return !!game && typeof game.buzzer === "number" && game.buzzer <= (cond.seconds || 1) * 1000;
      case "fallFirst":
        return solo && !!game.over && game.count === 0;
      case "dejaVu":
        return !!game && hasDejaVu(game.drawn || []);
      case "flipStreak":
        return !!game && (game.flipStreak || 0) >= v;
      case "exactHeight":
        return !!game && (game.heights || []).some((h) => h.toFixed(2) === v.toFixed(2));
      case "together": {
        const ids = cond.ids || [];
        return !!game && !game.comp && ids.length > 0 && ids.every((id) => (game.placedIds || []).includes(id));
      }
      case "sameChar":
        return !!game && Math.max(0, ...Object.values(game.placedCounts || {})) >= v;
      case "variety":
        return !!game && !game.comp && (game.placedIds || []).length >= v;
      case "rarityStack": {
        const rarities = cond.rarities || [];
        const n = Object.entries((game && game.placedCounts) || {}).reduce((sum, [id, k]) => sum + (rarities.includes((Chars.byId(id) || {}).rarity || "N") ? k : 0), 0);
        return !!game && !game.comp && rarities.length > 0 && n >= (v || 1);
      }
      case "rarityMix": {
        const rarities = cond.rarities || [];
        const placed = new Set((game && game.placedIds || []).map((id) => (Chars.byId(id) || {}).rarity || "N"));
        return !!game && !game.comp && rarities.length > 0 && rarities.every((r) => placed.has(r));
      }
      default: {
        // 累計の条件（今の数と、目標の数）
        const p = progress(cond);
        return !!p && p.now >= p.goal;
      }
    }
  }

  // 同じキャラが1体おきに3回出たか（出た順のキャラの ID の並び。A→？→A→？→A）
  function hasDejaVu(ids) {
    for (let i = 4; i < ids.length; i++) {
      if (ids[i] && ids[i] === ids[i - 2] && ids[i] === ids[i - 4]) return true;
    }
    return false;
  }

  // dexAll の条件に合うキャラ（rarity：レア度、variant：サイズ違い、ids：キャラの ID。期間限定のキャラはのぞく）
  function dexTargets(cond) {
    return (window.CHARACTERS || []).filter((c) => !c.event && (!cond.rarity || c.rarity === cond.rarity) && (!cond.variant || !!c.variant) && (!cond.ids || cond.ids.includes(c.id)));
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
        return { now: s.soloPlays + (s.rulePlays || 0) + (s.compPlays || 0) + s.versusPlays + cpuPlays + ((s.online || {}).plays || 0), goal: v };
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
      case "rarityDrawn":
        return { now: (s.drawn || {})[cond.rarity] || 0, goal: v || 1 };
      case "challengeWins":
        return { now: s.challengeWins || 0, goal: v || 1 };
      case "stampsSent":
        return { now: s.stampsSent || 0, goal: v || 1 };
      case "dexAll": {
        const list = dexTargets(cond);
        // 全部そろえる条件なので、対象のキャラがいないときは達成にしない
        return { now: list.filter((c) => Save.data.dex[c.id]).length, goal: list.length || 1 };
      }
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
    if (typeof Custom !== "undefined") Custom.notifyUnlocked(newly); // 名前の色
    return newly;
  }

  // id から実績を探す（背景・土台の解放条件の説明に使う）。無ければ null
  function find(id) {
    return (defs || []).find((a) => a.id === id) || null;
  }

  // ごほうびに、その背景・土台（id）を持つ実績（無ければ null。themes.js が解放を決めるのに使う）
  function rewardOf(kind, id) {
    const key = kind === "platforms" ? "platform" : "background";
    return (defs || []).find((a) => a.reward && a.reward[key] === id) || null;
  }

  // 実績のごほうびの説明（例：「背景『オーロラ』」。無ければ ""）
  function rewardText(a) {
    if (!a.reward) return "";
    const themes = window.GAME_CONFIG.themes || {};
    const name = (kind, id) => ((themes[kind] || []).find((d) => d.id === id) || {}).name || id;
    if (a.reward.background) return `背景「${name("backgrounds", a.reward.background)}」`;
    if (a.reward.platform) return `土台「${name("platforms", a.reward.platform)}」`;
    return "";
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

  // 称号の一覧（称号を選ぶ画面に使う）。まだ取っていないものも含めて、json の順に
  //   [{ id, title, rank, event, hidden, description, got（取ったか）, closed（期間が終わって、もう取れないか）}]
  function titleList() {
    return (defs || [])
      .filter((a) => a.title)
      .map((a) => ({
        id: a.id,
        title: a.title,
        rank: a.rank,
        event: a.event || null,
        decoration: a.decoration || "star",
        hidden: !!a.hidden,
        description: descriptionOf(a),
        got: !!unlocked()[a.id],
        closed: closed(a),
      }));
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
    // みんなの取得率（ranking.gs の集計。届いたら、各行に「持っている人 〇%」を足す。隠し実績は、達成するまで出さない）
    Ranking.titleStats().then((stats) => {
      if (!stats || UI.current !== "achievements") return;
      for (const row of box.querySelectorAll(".ach-row[data-ach]")) {
        const rate = Ranking.rateText(stats, row.dataset.ach);
        if (rate && !row.querySelector(".ach-rate")) row.querySelector(".ach-main").insertAdjacentHTML("beforeend", `<small class="ach-rate">${rate}</small>`);
      }
    });
  }

  // 期間限定の実績で、期間外（開催前・終了）で、まだ達成していない（もう取れない）か
  function closed(a) {
    return !!a.event && !unlocked()[a.id] && !LimitedEvents.isActive(a.event);
  }

  // 説明文（条件を伏せる実績は、達成するまで「？？？（条件はひみつ）」）
  function descriptionOf(a) {
    return a.hideCondition && !unlocked()[a.id] ? "？？？（条件はひみつ）" : a.description || "";
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
      <div class="ach-row ${at ? "ach-done" : "ach-locked"} ${secret ? "ach-secret" : ""}"${secret ? "" : ` data-ach="${UI.escape(a.id)}"`}>
        <span class="ach-icon">${at ? "🏆" : secret ? "❓" : "🔒"}</span>
        <span class="ach-main">
          <b>${secret ? "？？？" : UI.escape(a.name)}${a.event ? ` <span class="limited-tag">期間限定</span>` : ""}</b>
          <small>${secret ? "？？？（隠し実績）" : UI.escape(descriptionOf(a))}</small>
          <span class="ach-title">称号「${UI.escape(at ? a.title : "？？？")}」${a.reward ? `<span class="ach-reward">＋ ${secret ? "？？？" : UI.escape(rewardText(a))}</span>` : ""}</span>
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

  return { init, load, check, counts, titleList, unlockedList, find, findByTitle, rewardOf, setAll };
})();
