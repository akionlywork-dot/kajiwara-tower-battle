// =============================================
// themes.js
// 背景と土台の解放・選択（種類と解放条件は config.js の themes）
//
// 解放条件は「実績の id」。その実績を達成すると、その背景・土台が使えるようになる。
// { event: "イベントの id", wins: 数 } と書くと、そのイベントのステージで wins 回勝ったら使えるようになる
// （イベントが終わっても、ずっと使える）
// =============================================

const Themes = (() => {
  const KINDS = {
    backgrounds: { label: "背景", saveKey: "background" },
    platforms: { label: "土台", saveKey: "platform" },
  };

  const list = (kind) => (window.GAME_CONFIG.themes || {})[kind] || [];
  const chosen = () => Save.data.cosmetics;

  // その背景・土台をごほうびにしている実績（unlock: "achievement" のとき。achievements.json の reward）
  function rewardOf(def) {
    if (typeof Achievements === "undefined") return null;
    const kind = list("platforms").includes(def) ? "platforms" : "backgrounds";
    return Achievements.rewardOf(kind, def.id);
  }

  // 解放ずみか（条件なし、条件の実績を達成ずみ、またはイベントの勝利数が届いた）
  function isUnlocked(def) {
    const u = def.unlock;
    if (!u) return true;
    if (u === "achievement") {
      // achievements.json の reward で決める（実績を読み込めていなければ、解放しない）
      const a = rewardOf(def);
      return !!a && !!Save.data.achievements[a.id];
    }
    if (typeof u === "object") return Records.eventWins(u.event) >= (u.wins || 1);
    return !!Save.data.achievements[u];
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
    if (def.unlock && typeof def.unlock === "object") return `${LimitedEvents.nameOf(def.unlock.event)}で${def.unlock.wins || 1}勝`;
    const a = def.unlock === "achievement" ? rewardOf(def) : typeof Achievements !== "undefined" ? Achievements.find(def.unlock) : null;
    if (a && a.hidden && !Save.data.achievements[a.id]) return "隠し実績を達成"; // 隠し実績は、名前も出さない
    return a ? `実績「${a.name}」を達成` : "ある実績を達成";
  }

  // 実績を達成したとき（main.js から呼ばれる）：それで解放されたものを通知する
  function notifyUnlocked(newAchievements) {
    const ids = newAchievements.map((a) => a.id);
    for (const kind of Object.keys(KINDS)) {
      for (const def of list(kind)) {
        const by = def.unlock === "achievement" ? rewardOf(def) : null;
        if ((def.unlock && ids.includes(def.unlock)) || (by && ids.includes(by.id))) {
          UI.toast(`🎨 新しい${KINDS[kind].label}「<b>${UI.escape(def.name)}</b>」が解放されました`);
        }
      }
    }
  }

  // ---------- 選ぶ画面（プロフィール画面の中） ----------
  // 見本を3列に並べる。解放ずみはタップで選べる。未解放は鍵マークと解放条件（長いときは省略。タップで全文）
  function renderPicker(container, kind) {
    const now = current(kind);
    container.innerHTML = list(kind)
      .map((def) => {
        const open = isUnlocked(def);
        return `
          <button class="theme-tile ${def.id === now.id ? "selected" : ""} ${open ? "" : "locked"}"
                  data-kind="${kind}" data-id="${UI.escape(def.id)}" aria-label="${UI.escape(def.name)}${open ? "" : "（" + UI.escape(conditionText(def)) + "）"}">
            <span class="theme-preview"><img src="${previewImage(kind, def)}" alt="">${open ? "" : `<em>🔒</em>`}</span>
            <b>${UI.escape(def.name)}</b>
            ${open ? "" : `<small>${UI.escape(conditionText(def))}</small>`}
          </button>`;
      })
      .join("");
  }

  // ---------- 見本の絵（ゲームと同じ描き方を小さくしたもの。1回作ったら使い回す） ----------
  const PREVIEW_W = 160, PREVIEW_H = 90; // 見本の絵の大きさ（ピクセル。画面では小さく表示する）
  const previews = new Map();

  // bgDef：土台の見本の後ろの背景（省略すると、自分が選んでいる背景）
  function previewImage(kind, def, bgDef) {
    const bg = kind === "backgrounds" ? def : bgDef || current("backgrounds");
    const key = `${kind}|${def.id}|${bg.id}`;
    if (!previews.has(key)) {
      const c = document.createElement("canvas");
      c.width = PREVIEW_W;
      c.height = PREVIEW_H;
      const ctx = c.getContext("2d");
      drawSkyPreview(ctx, bg, kind === "backgrounds");
      if (kind === "platforms") drawPlatformPreview(ctx, def);
      previews.set(key, c.toDataURL());
    }
    return previews.get(key);
  }

  // 空（グラデーション・星・月・雲）と地面。full が false なら、土台の見本の後ろ用に地面を低く
  function drawSkyPreview(ctx, bg, full) {
    const W = PREVIEW_W, H = PREVIEW_H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg.top);
    g.addColorStop(1, bg.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (bg.stars) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const [x, y] of [[14, 10], [40, 22], [70, 8], [104, 18], [130, 30], [150, 9], [24, 36]]) ctx.fillRect(x, y, 1.6, 1.6);
    }
    if (bg.rainbow) {
      ctx.lineWidth = 3;
      ["#ff5d73", "#ff9f40", "#ffd64a", "#56d66e", "#3d8bff", "#a05cf0"].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.78, W * 0.42 - i * 3, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    if (bg.goldDust) {
      ctx.fillStyle = "#ffd54a";
      for (const [x, y] of [[20, 44], [52, 30], [78, 50], [112, 36], [140, 46], [96, 14], [60, 12]]) circle(ctx, x, y, 1.4);
    }
    if (bg.sun) {
      ctx.fillStyle = "rgba(255, 236, 180, 0.35)";
      circle(ctx, W * 0.74, H * (full ? 0.66 : 0.8), 22);
      ctx.fillStyle = bg.sun;
      circle(ctx, W * 0.74, H * (full ? 0.66 : 0.8), 14);
    }
    if (bg.moon) {
      ctx.fillStyle = "rgba(255, 240, 190, 0.35)";
      circle(ctx, 124, 24, 15);
      ctx.fillStyle = "#fff4c8";
      circle(ctx, 124, 24, 10);
    }
    ctx.fillStyle = bg.cloud;
    for (const [x, y, s] of [[34, 26, 1], [96, 40, 0.8]]) {
      circle(ctx, x, y, 8 * s);
      circle(ctx, x - 8 * s, y + 3 * s, 6 * s);
      circle(ctx, x + 9 * s, y + 2 * s, 6.5 * s);
    }
    // 地面（なだらかな丘）
    const top = full ? H * 0.72 : H * 0.86;
    if (bg.dunes) {
      ctx.fillStyle = bg.dunes;
      ctx.beginPath();
      ctx.moveTo(0, top + 4);
      for (let x = 0; x <= W; x += 6) ctx.lineTo(x, top - 8 * (0.55 + 0.45 * Math.sin(x / 18)));
      ctx.lineTo(W, top + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = bg.ground;
    ctx.beginPath();
    ctx.moveTo(0, top + 3);
    ctx.quadraticCurveTo(W * 0.3, top - 4, W / 2, top);
    ctx.quadraticCurveTo(W * 0.75, top + 3, W, top - 2);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  // 土台と柱（platform-art.js の絵を、そのまま小さくして貼る）
  function drawPlatformPreview(ctx, def) {
    const size = Game.platformSize;
    const art = PlatformArt.build(def, size);
    const s = 120 / size.w; // 土台の四角が、見本の横幅の 3/4 くらいになる倍率
    const left = (PREVIEW_W - size.w * s) / 2, top = 34;
    ctx.drawImage(art.pillar.canvas, PREVIEW_W / 2 - (art.pillar.w * s) / 2, top + size.h * s, art.pillar.w * s, art.pillar.h * s);
    ctx.drawImage(art.platform.canvas, left + art.platform.x * s, top + art.platform.y * s, art.platform.w * s, art.platform.h * s);
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 対戦カードの色（プロフィールで選ぶ。持っている背景だけ） ----------
  // 対戦カードにする背景（自分の）。選んでいない・使えなくなっていたら null（いつもの色）
  function cardBackground() {
    const def = list("backgrounds").find((d) => d.id === chosen().cardBg);
    return def && isUnlocked(def) ? def : null;
  }

  // 対戦カードの色を選ぶ。id が null なら、いつもの色。持っていない背景は選べない
  function selectCardBg(id) {
    const def = id ? list("backgrounds").find((d) => d.id === id) : null;
    if (id && (!def || !isUnlocked(def))) return;
    chosen().cardBg = id || null;
    Save.write();
  }

  // 対戦カードの色の見本を並べる（いちばん左が「いつもの色」、そのあとに持っている背景）
  function renderCardPicker(container) {
    const now = cardBackground();
    container.innerHTML =
      `<button class="theme-tile ${now ? "" : "selected"}" data-card-bg="">
        <span class="theme-preview card-default-swatch"></span>
        <b>いつもの色</b>
      </button>` +
      list("backgrounds")
        .filter(isUnlocked)
        .map(
          (def) => `
          <button class="theme-tile ${now && now.id === def.id ? "selected" : ""}" data-card-bg="${UI.escape(def.id)}" aria-label="${UI.escape(def.name)}">
            <span class="theme-preview"><img src="${previewImage("backgrounds", def)}" alt=""></span>
            <b>${UI.escape(def.name)}</b>
          </button>`
        )
        .join("");
  }

  // ほかの人の背景・土台の見本（ランキングのプロフィールで使う）。{ name, src }。id が無ければ null
  //   bgId：土台の見本の後ろに描く背景の id（その人が選んでいる背景）
  function previewOf(kind, id, bgId) {
    const def = list(kind).find((d) => d.id === id);
    if (!def) return null;
    const bg = list("backgrounds").find((d) => d.id === bgId) || list("backgrounds")[0];
    return { name: def.name, src: previewImage(kind, def, bg) };
  }

  return { apply, select, renderPicker, notifyUnlocked, previewOf, cardBackground, selectCardBg, renderCardPicker };
})();
