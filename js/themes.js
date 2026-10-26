// =============================================
// themes.js
// 背景と土台の解放・選択（種類と解放条件は config.js の themes）
//
// 解放条件は「実績の id」。その実績を達成すると、その背景・土台が使えるようになる
// =============================================

const Themes = (() => {
  const KINDS = {
    backgrounds: { label: "背景", saveKey: "background" },
    platforms: { label: "土台", saveKey: "platform" },
  };

  const list = (kind) => (window.GAME_CONFIG.themes || {})[kind] || [];
  const chosen = () => Save.data.cosmetics;

  // 解放ずみか（条件なし、または条件の実績を達成ずみ）
  function isUnlocked(def) {
    return !def.unlock || !!Save.data.achievements[def.unlock];
  }

  // 今選んでいるもの（選んでいたものが使えなくなっていたら、最初のものに戻す）
  function current(kind) {
    const all = list(kind);
    const def = all.find((d) => d.id === chosen()[KINDS[kind].saveKey]);
    return def && isUnlocked(def) ? def : all[0];
  }

  // 選んだ背景・土台をゲームの絵に反映する
  function apply() {
    Game.setTheme(current("backgrounds"), current("platforms"));
  }

  function select(kind, id) {
    const def = list(kind).find((d) => d.id === id);
    if (!def || !isUnlocked(def)) return;
    chosen()[KINDS[kind].saveKey] = id;
    Save.write();
    apply();
  }

  // 解放条件の説明（例：「実績『10体積み』を達成」）
  function conditionText(def) {
    const a = typeof Achievements !== "undefined" ? Achievements.find(def.unlock) : null;
    return a ? `実績「${a.name}」を達成` : "ある実績を達成";
  }

  // 実績を達成したとき（main.js から呼ばれる）：それで解放されたものを通知する
  function notifyUnlocked(newAchievements) {
    const ids = newAchievements.map((a) => a.id);
    for (const kind of Object.keys(KINDS)) {
      for (const def of list(kind)) {
        if (def.unlock && ids.includes(def.unlock)) {
          UI.toast(`🎨 新しい${KINDS[kind].label}「<b>${UI.escape(def.name)}</b>」が解放されました`);
        }
      }
    }
  }

  // ---------- 選ぶ画面（プロフィール画面の中） ----------
  // 見本を並べる。解放ずみはタップで選べる。未解放は鍵マークと解放条件
  function renderPicker(container, kind) {
    const now = current(kind);
    container.innerHTML = list(kind)
      .map((def) => {
        const open = isUnlocked(def);
        return `
          <button class="theme-tile ${def.id === now.id ? "selected" : ""} ${open ? "" : "locked"}"
                  data-kind="${kind}" data-id="${UI.escape(def.id)}" ${open ? "" : "disabled"}>
            <span class="theme-preview" style="${previewStyle(kind, def)}">
              ${kind === "platforms" ? `<i style="background:${def.body};border-top-color:${def.top}"></i>` : ""}
              ${open ? "" : `<em>🔒</em>`}
            </span>
            <b>${UI.escape(def.name)}</b>
            ${open ? "" : `<small>${UI.escape(conditionText(def))}</small>`}
          </button>`;
      })
      .join("");
  }

  // 見本の見た目（背景は空のグラデーション、土台は空の上に台）
  function previewStyle(kind, def) {
    if (kind === "backgrounds") return `background:linear-gradient(${def.top}, ${def.bottom} 70%, ${def.ground} 70%)`;
    const bg = current("backgrounds");
    return `background:linear-gradient(${bg.top}, ${bg.bottom})`;
  }

  return { apply, select, renderPicker, notifyUnlocked };
})();
