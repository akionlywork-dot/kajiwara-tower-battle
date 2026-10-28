// =============================================
// vs-intro.js
// オンライン対戦の、試合が始まる前の「対戦カード」の演出
//
// 流れ（1戦目・約3秒）：
//   画面を少し暗くする → 右上から相手のカード（赤）、左下から自分のカード（青）がななめにすべり込む
//   → 真ん中に「VS」が弾んで出て、画面が少し揺れる（効果音）→ そのまま見せる → カードは来た方向へ抜ける
// 2戦目からは短い版（約1秒）：「第2戦」と、この部屋での勝敗だけ
// 端末の「視差効果を減らす」が ON のときは、すべり込みと揺れをやめて、フェードだけにする（style.css）
// 秒数は config.js の online（introSlide・introTime・introExit・rematchIntroTime）
//
// 演出を出すだけで、試合を始めるのは main.js（2台で同じ時刻に始めるため）。
// タップすると自分の画面の演出は閉じられるが、試合の開始は早くならない
//
// 相手に送るプロフィール（hello の profile）を作る・届いたものを確かめるのも、ここで行う
// =============================================

const VsIntro = (() => {
  const CONF = () => window.GAME_CONFIG.online || {};
  const ms = (key, fallback) => {
    const v = Number(CONF()[key]);
    return Math.round((isFinite(v) && v >= 0 ? v : fallback) * 1000);
  };
  // 相手から届いた写真アイコンとして表示してよい形（小さな JPEG だけ）
  const ICON_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  const ICON_MAX = 20000; // 写真アイコンの文字数の上限（64px の JPEG なら数千文字）
  const ID_PATTERN = /^[0-9a-f]{16,64}$/;

  let el = null; // 演出の要素（#vs-intro）
  let timers = [];

  // ---------- 時間 ----------
  // 演出の長さ（ミリ秒）。short：2戦目からの短い版
  function duration(short) {
    if (short) return ms("rematchIntroTime", 1);
    return ms("introSlide", 0.5) + ms("introTime", 2) + ms("introExit", 0.45);
  }

  // ---------- 演出 ----------
  // data: { short, me, them（下の profile の形。名前は name）, note（真ん中の下の文字）, gameNo, room: [勝, 敗] }
  // total：演出の長さ（ミリ秒）。届くのが遅れたときは短くなる（試合を始める時刻は2台でそろえるため）
  function play(data, total = duration(data.short)) {
    cancel();
    el = document.createElement("div");
    el.id = "vs-intro";
    el.className = "vs-intro" + (data.short ? " short" : "");
    const slide = data.short ? 200 : Math.min(ms("introSlide", 0.5), total / 3);
    const exit = data.short ? 250 : Math.min(ms("introExit", 0.45), total / 3);
    el.style.setProperty("--vs-slide", `${slide}ms`);
    el.style.setProperty("--vs-exit", `${exit}ms`);
    el.innerHTML = data.short ? shortHTML(data) : fullHTML(data);
    // タップしたら、自分の画面の演出だけ閉じる（試合の開始は早めない）
    el.addEventListener("click", close);
    document.getElementById("app").appendChild(el);
    void el.offsetWidth; // アニメーションを最初から
    el.classList.add("show");
    // VS が弾む（カードが止まったところで）
    later(() => {
      el.classList.add("hit");
      Sound.play("vs");
    }, data.short ? 0 : slide);
    // カードが来た方向へ抜ける
    later(() => el.classList.add("out"), Math.max(0, total - exit));
    later(remove, total + 50);
  }

  function later(fn, wait) {
    timers.push(setTimeout(() => el && fn(), wait));
  }

  // タップで閉じる（すぐに消す）
  function close() {
    if (!el) return;
    const target = el;
    timers.forEach(clearTimeout);
    timers = [];
    el = null;
    target.classList.add("closed");
    target.removeEventListener("click", close);
    setTimeout(() => target.remove(), 200);
  }

  function remove() {
    if (el) el.remove();
    el = null;
  }

  // 演出をやめる（通信が切れた・タイトルに戻った・試合が始まったとき）
  function cancel() {
    timers.forEach(clearTimeout);
    timers = [];
    remove();
  }

  // ---------- 中身 ----------
  function fullHTML(d) {
    return `
      <div class="vs-dim"></div>
      <div class="vs-stage">
        ${cardHTML(d.them, "them")}
        <div class="vs-center">
          <b class="vs-mark">VS</b>
          ${d.note ? `<span class="vs-note">${UI.escape(d.note)}</span>` : ""}
        </div>
        ${cardHTML(d.me, "me")}
      </div>`;
  }

  // 2戦目から：「第2戦」と、この部屋での勝敗
  function shortHTML(d) {
    const [w, l] = d.room || [0, 0];
    return `
      <div class="vs-dim"></div>
      <div class="vs-stage">
        <div class="vs-center">
          <b class="vs-mark vs-round">第${Number(d.gameNo)}戦</b>
          <span class="vs-names"><em class="vs-name-me">${UI.escape(d.me.name)}</em> vs <em class="vs-name-them">${UI.escape(d.them.name)}</em></span>
          <span class="vs-note">この部屋で ${Number(w)}勝${Number(l)}敗</span>
        </div>
      </div>`;
  }

  // 1人分のカード（side："me"＝自分・青 / "them"＝相手・赤）。
  // p.card（背景の id）があれば、その背景の絵をカードの下地にする（自分か相手かは、枠と札の色で分かる）
  function cardHTML(p, side) {
    const name = p.name || "プレイヤー";
    const cls = Frames.avatarClass(p.frame);
    const avatar = p.icon
      ? `<span class="avatar vs-avatar ${cls}" style="background-image:url(${p.icon})"></span>`
      : `<span class="avatar avatar-empty vs-avatar ${cls}">${UI.escape([...name][0] || "?")}</span>`;
    const rows = [];
    // ランキング：参加している人は順位とハイスコア、していない人はハイスコアだけ
    if (p.rankNo) rows.push(["ランキング", `${p.rankNo}位`, p.best != null ? `${p.best}点` : ""]);
    else if (p.best != null) rows.push(["ハイスコア", `${p.best}点`, ""]);
    if (p.ach) rows.push(["実績", `🏆 ${p.ach[0]} / ${p.ach[1]}`, ""]);
    if (p.online) rows.push(["オンライン対戦", `${p.online[0]}勝${p.online[1]}敗`, ""]);
    const bg = p.card ? Themes.previewOf("backgrounds", p.card) : null;
    const bgStyle = bg ? ` style="background-image:linear-gradient(rgba(10,16,34,0.3),rgba(10,16,34,0.55)),url(${bg.src})"` : "";
    return `
      <div class="vs-card vs-${side}${bg ? " has-bg" : ""}"${bgStyle}>
        <span class="vs-side">${side === "me" ? "あなた" : "相手"}</span>
        <div class="vs-head">
          ${avatar}
          <span class="vs-who"><b>${UI.escape(name)}</b>${Frames.titleHTML(p.title || "", p.frame)}</span>
        </div>
        ${
          rows.length
            ? `<ul class="vs-stats">${rows
                .map(([label, value, sub]) => `<li><span>${label}</span><b>${UI.escape(value)}${sub ? `<small>${UI.escape(sub)}</small>` : ""}</b></li>`)
                .join("")}</ul>`
            : ""
        }
      </div>`;
  }

  // ---------- 相手に送るプロフィール ----------
  // { title, rank, ev, best, rankNo, ach: [達成数, 全体], online: [勝, 敗], id, icon, card }
  //   card：対戦カードの色にする背景の id（プロフィールで選んだもの。いつもの色なら null）
  //   rankNo：ランキングの順位（参加している人だけ。最後にランキングを開いた・送ったときの値。試合前に取りにはいかない）
  //   id：相手を見分けるための番号（ランキングの番号から作った別の値。ランキングの番号そのものは送らない）
  //   icon：設定「対戦相手に写真アイコンを見せる」が ON の人だけ（64px）
  async function myProfile() {
    const p = Save.data.profile;
    const s = Save.data.stats;
    const frame = Frames.ofTitleId(p.titleId);
    const counts = Achievements.counts();
    const online = s.online || { plays: 0, wins: 0 };
    const lastRank = Save.data.ranking.lastRank;
    // 管理者モードの端末は、データを書きかえられるので、ハイスコア・順位・実績の数・対戦成績を送らない
    const admin = Admin.unlocked;
    return {
      title: Profile.titleText(p.titleId),
      rank: frame ? frame.rank : null,
      ev: frame ? frame.event : null,
      best: !admin && s.best ? s.best.score : null,
      rankNo: !admin && Ranking.joined() && lastRank ? lastRank : null,
      ach: !admin && counts ? [counts.got, counts.total] : null,
      online: admin ? null : [online.wins, online.plays - online.wins],
      id: await Ranking.opponentKey(),
      icon: Settings.get("onlineIcon") && p.icon ? await Profile.smallIcon(p.icon) : "",
      card: cardBgId(),
    };
  }

  // 対戦カードの色にする背景の id（いつもの色なら null）
  function cardBgId() {
    const def = Themes.cardBackground();
    return def ? def.id : null;
  }

  // プロフィール画面に出す、自分の対戦カードの見本（相手の画面に出るのと同じ中身。写真は「見せる」設定のときだけ）
  function myCardHTML() {
    const p = Save.data.profile;
    const s = Save.data.stats;
    const frame = Frames.ofTitleId(p.titleId);
    const counts = Achievements.counts();
    const online = s.online || { plays: 0, wins: 0 };
    const lastRank = Save.data.ranking.lastRank;
    return cardHTML(
      {
        name: Save.playerName(1),
        title: Profile.titleText(p.titleId),
        frame,
        best: s.best ? s.best.score : null,
        rankNo: Ranking.joined() && lastRank ? lastRank : null,
        ach: counts ? [counts.got, counts.total] : null,
        online: [online.wins, online.plays - online.wins],
        icon: Settings.get("onlineIcon") && p.icon ? p.icon : null,
        card: cardBgId(),
      },
      "me"
    );
  }

  // 相手から届いたプロフィールを確かめる（おかしな値は使わない）。
  // 古いバージョンの相手からは届かないので、そのときは名前だけ（{ name }）
  function cleanProfile(name, p) {
    const out = { name, title: "", frame: null, best: null, rankNo: null, ach: null, online: null, id: null, icon: null, card: null };
    if (!p || typeof p !== "object") return out;
    const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
    out.title = typeof p.title === "string" ? p.title.slice(0, 20) : "";
    // 枠：称号の文字から実績を探して決める（飾りも分かる）。見つからなければ、届いた rank で
    out.frame = out.title ? Frames.ofTitleText(out.title) || Frames.clean(p.rank, p.ev) : null;
    out.best = int(p.best, 9999999);
    out.rankNo = int(p.rankNo, 9999999) || null;
    if (Array.isArray(p.ach) && int(p.ach[0], 9999) !== null && int(p.ach[1], 9999) !== null && p.ach[0] <= p.ach[1]) out.ach = [p.ach[0], p.ach[1]];
    if (Array.isArray(p.online) && int(p.online[0], 9999999) !== null && int(p.online[1], 9999999) !== null) out.online = [p.online[0], p.online[1]];
    if (typeof p.id === "string" && ID_PATTERN.test(p.id)) out.id = p.id;
    if (typeof p.icon === "string" && p.icon.length <= ICON_MAX && ICON_PATTERN.test(p.icon)) out.icon = p.icon;
    // 対戦カードの色：config.js にある背景の id だけ使う
    if (typeof p.card === "string" && Themes.previewOf("backgrounds", p.card)) out.card = p.card;
    return out;
  }

  return {
    play,
    cancel,
    duration,
    myProfile,
    myCardHTML,
    cleanProfile,
    get active() { return !!el; },
  };
})();
