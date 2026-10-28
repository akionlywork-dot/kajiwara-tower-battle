// =============================================
// sandbox.js
// 自由配置モード（管理者モードだけ。デバッグ用）
//
// ・次に置くキャラを一覧から選ぶ（レア度・サイズ違い・イベントのキャラもふくむ、すべてのキャラ。反転もできる）
// ・画面をタップした場所（空中でもよい）に、そのキャラを置く
// ・置いたキャラをタップすると選べる。ドラッグで動かす・回す・反転する・消す
// ・「全部消す」で土台以外を全部消す。物理の計算を止める・再開する・止めたまま1コマずつ進める
// ・プレイは、ハイスコア・戦績・実績・図鑑に記録しない（game.js の startSandbox は、記録の処理を通らない）。
//   遊んでいるあいだは、画面の上に「デバッグ中・記録されません」を出しつづける
// 物理と、タップ・ドラッグの処理は game.js（Game.sandbox）にある
// =============================================

const Sandbox = (() => {
  const $ = (id) => document.getElementById(id);
  let active = false;
  let exitTo = null; // 終わったときに呼ぶ関数（main.js の goTitle）
  let timer = null;

  function init(onExit) {
    exitTo = onExit;
    $("sandbox-char").addEventListener("change", (e) => {
      Game.sandbox.setNext({ id: e.target.value });
      render();
    });
    $("sandbox-rotate").addEventListener("click", () => {
      Game.sandbox.rotate();
      render();
    });
    $("sandbox-flip").addEventListener("click", () => {
      Game.sandbox.flip();
      render();
    });
    $("sandbox-delete").addEventListener("click", () => {
      Game.sandbox.remove();
      render();
    });
    $("sandbox-clear").addEventListener("click", () => {
      Game.sandbox.clear();
      render();
    });
    $("sandbox-pause").addEventListener("click", () => {
      Game.sandbox.setPaused(!Game.sandbox.paused);
      render();
    });
    $("sandbox-step").addEventListener("click", () => {
      if (!Game.sandbox.paused) Game.sandbox.setPaused(true);
      Game.sandbox.step();
      render();
    });
    $("sandbox-exit").addEventListener("click", () => exitTo && exitTo());
    // ほかの画面に切りかわったら（タイトルに戻ったなど）、自由配置モードは終わり
    UI.onChange((name) => {
      if (name !== null && active) end();
    });
  }

  // 始める（管理者モードのときだけ）
  function start() {
    if (!Admin.unlocked) return;
    fillChars();
    Game.startSandbox();
    Game.sandbox.setNext({ id: $("sandbox-char").value });
    UI.show(null);
    active = true;
    document.body.classList.add("sandbox-on");
    $("sandbox-ui").classList.remove("hidden");
    Admin.refreshFlags();
    render();
    // 選んでいるキャラは、タップで変わるので、ときどき表示を書きなおす
    clearInterval(timer);
    timer = setInterval(render, 300);
  }

  function end() {
    active = false;
    clearInterval(timer);
    document.body.classList.remove("sandbox-on");
    $("sandbox-ui").classList.add("hidden");
    Admin.refreshFlags();
  }

  // キャラの一覧（レア度ごと。すべてのキャラ）
  function fillChars() {
    const select = $("sandbox-char");
    const current = select.value;
    const table = window.GAME_CONFIG.rarity || {};
    const groups = {};
    for (const c of window.CHARACTERS) (groups[table[c.rarity] ? c.rarity : "N"] = groups[table[c.rarity] ? c.rarity : "N"] || []).push(c);
    const size = { big: "ビッグ", small: "ミニ" };
    select.innerHTML = Object.keys(table)
      .filter((rid) => groups[rid])
      .map((rid) => {
        const label = `${"★".repeat(table[rid].stars)} ${table[rid].name}`;
        const items = groups[rid].map((c) => {
          const tags = [c.variant && size[c.variant], c.event && "イベント", c.weight === 0 && "出ない"].filter(Boolean);
          return `<option value="${UI.escape(c.id)}">${UI.escape(c.name)}${tags.length ? `（${tags.join("・")}）` : ""}</option>`;
        });
        return `<optgroup label="${UI.escape(label)}">${items.join("")}</optgroup>`;
      })
      .join("");
    if (current && window.CHARACTERS.some((c) => c.id === current)) select.value = current;
  }

  // ボタンの文字と、今の状態の表示
  function render() {
    if (!active) return;
    const s = Game.sandbox;
    const next = s.next;
    const paused = s.paused;
    $("sandbox-pause").textContent = paused ? "▶ 再開" : "❚❚ 停止";
    $("sandbox-pause").classList.toggle("btn-primary", paused);
    $("sandbox-step").disabled = false;
    const selected = s.selectedName;
    const deg = Math.round((next.angle * 180) / Math.PI);
    $("sandbox-info").textContent = selected
      ? `選択中：${selected}（回転・反転・削除はこのキャラに）`
      : `次に置く：${deg}°${next.flip ? "・反転" : ""}（何もない所をタップで置く）`;
    $("sandbox-delete").disabled = !selected;
  }

  return { init, start, end, get active() { return active; } };
})();
