// =============================================
// halloween.js
// ハロウィンイベント（id "halloween2026"）：ステージ「おばけ屋敷」とごほうび
//
// ・期間（data/events.json）の中だけ、モード選択画面に「🎃 ハロウィン」ボタンを出し、タイトルにかぼちゃ・こうもりを出す。
//   ホーム画面の後ろの絵も、ハロウィンの夜・かぼちゃの台・飾り（halloween-home.js）にする
// ・ステージは CPU 対戦（config.js の events.halloween2026 の rule・cpu）。ギミックの動きは rules.js の haunted
// ・勝つたびに、ごほうび（config.js の events.halloween2026.rewards）を1つずつもらえる。
//   勝利数は Save.data.eventStats に保存し、背景・土台・実績は、この勝利数で使えるようになる（イベントが終わっても残る）
// =============================================

const Halloween = (() => {
  const $ = (id) => document.getElementById(id);
  const EVENT_ID = "halloween2026";
  const conf = () => (window.GAME_CONFIG.events || {})[EVENT_ID] || null;
  const rewards = () => (conf() ? conf().rewards : []);
  const wins = () => Records.eventWins(EVENT_ID);
  let startStage = null; // ステージを始める関数（main.js から受け取る）

  // 期間中か（管理者モードの「イベント期間中として表示」でも true）
  function isOpen() {
    return !!conf() && LimitedEvents.isActive(EVENT_ID);
  }

  // start：ステージ（CPU対戦）を始める関数
  function init(start) {
    startStage = start;
    $("btn-halloween").addEventListener("click", () => UI.show("halloween"));
    $("btn-halloween-start").addEventListener("click", () => {
      if (isOpen() && startStage) startStage(conf().rule, conf().cpu);
    });
    UI.onShow("halloween", render);
    // モード選択画面・タイトルが出るたびと、イベントを読み込み終わったときに、期間に合わせて出し入れする
    UI.onChange((name) => {
      if (name === "mode") updateButton();
      updateTitle(name === "title");
    });
    LimitedEvents.whenLoaded(() => {
      updateButton();
      updateTitle(UI.current === "title");
    });
  }

  // モード選択画面のボタン（期間外は出さない）
  function updateButton() {
    const btn = $("btn-halloween");
    btn.classList.toggle("hidden", !isOpen());
    if (!isOpen()) return;
    const n = wins();
    const all = rewards().length;
    $("halloween-progress").textContent = n >= all ? `制覇！（${n}勝）` : `CPU ふつう に勝ってごほうびをゲット 🎃 ${n}/${all}`;
  }

  // タイトル画面のかぼちゃ・こうもり（CSS）と、後ろの絵（背景「ハロウィンの夜」・かぼちゃの台・飾り。halloween-home.js）。
  // 期間外は出さない。後ろの絵はタイトル画面が出ているあいだだけ入れ、ほかの画面・ゲーム中は選んだ背景・土台に戻す。
  // プロフィールで選んだもの・解放の状態は変えない（まだ解放していない人にも、ホームでは見せる）
  function updateTitle(onTitle) {
    const open = isOpen();
    $("screen-title").classList.toggle("halloween", open);
    Game.setHomeScene(open && onTitle ? HalloweenHome.scene() : null);
  }

  // ステージの説明と、ごほうび3つ（もらったものにはチェック、まだのものは「？」）
  function render() {
    const rule = (window.GAME_CONFIG.rules || {})[conf().rule] || {};
    const ev = LimitedEvents.find(EVENT_ID);
    $("hw-stage-name").textContent = `${rule.icon || ""} ${rule.name || ""}`;
    $("hw-stage-desc").textContent = rule.description || "";
    $("hw-period").textContent = ev ? `期間：${ev.start.replace(/-/g, "/")} 〜 ${ev.end.replace(/-/g, "/")}` : "";
    const n = wins();
    $("hw-wins").textContent = `${Math.min(n, rewards().length)} / ${rewards().length}`;
    $("hw-rewards").innerHTML = rewards()
      .map((r) => {
        const got = n >= r.wins;
        return `
          <div class="hw-reward ${got ? "got" : ""}">
            <span class="hw-mark">${got ? "✔" : "？"}</span>
            <span class="hw-reward-main"><b>${r.wins}勝目</b><small>${got ? UI.escape(r.name) : "？？？"}</small></span>
          </div>`;
      })
      .join("");
    $("hw-done").classList.toggle("hidden", n < rewards().length);
    $("btn-halloween-start").disabled = !isOpen();
  }

  // リザルト画面に出す、ごほうびの知らせ（HTML）。勝利数を記録したあとに、main.js から呼ばれる
  // won：勝ったか、n：記録したあとの勝利数
  function resultHTML(won, n) {
    const all = rewards().length;
    const got = won ? rewards().find((r) => r.wins === n) : null;
    if (got) {
      const where = got.type === "achievement" ? "称号は、プロフィール画面で選べます" : "プロフィール画面で選べます";
      return `<div class="reward-get"><span>🎁 ごほうびゲット！</span><b>${UI.escape(got.name)}</b><small>${where}</small></div>`;
    }
    if (n >= all) return `<p class="reward-note">🎃 おばけ屋敷 制覇ずみ（${n}勝）</p>`;
    return `<p class="reward-note">🎃 あと${rewards().find((r) => r.wins > n).wins - n}勝で、次のごほうび</p>`;
  }

  // このイベントの CPU の強さか（main.js が、ふつうの CPU 対戦と分けて記録するため）
  function isStageCpu(level) {
    return !!conf() && level === conf().cpu;
  }

  return { init, resultHTML, isStageCpu, isOpen, EVENT_ID };
})();
