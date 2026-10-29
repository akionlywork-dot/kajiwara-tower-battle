// =============================================
// custom.js
// プロフィールのカスタマイズ：名前の色・お気に入りのキャラ・キャラのアイコン
//
// ・名前の色：config.js の nameColors。背景・土台と同じく、unlock に書いた実績を達成すると選べる。
//   タイトル画面の名前・プロフィール・対戦カード（相手にも）・ランキングに出る。
//   相手・ランキングから届いた色は、config.js にある id だけ使う
// ・お気に入りのキャラ：図鑑に登録したキャラから1体。対戦カード（相手にも）・ランキングのプロフィール（公開している人）に出る
// ・キャラのアイコン：図鑑に登録したキャラの絵から、丸いアイコン（256px の JPEG）を作って、写真のアイコンの代わりにする。
//   できあがりは写真と同じ扱い（Save.data.profile.icon）なので、ランキング・対戦相手に見せるかは、写真と同じ設定で決まる。
//   どのキャラで作ったかは Save.data.profile.iconChar に残す（プロフィール画面の表示用）
// =============================================

const Custom = (() => {
  const $ = (id) => document.getElementById(id);
  const ICON_SIZE = 256;
  const colors = () => window.GAME_CONFIG.nameColors || [];
  const colorDef = (id) => colors().find((c) => c.id === id) || null;
  const registered = (c) => !!c && !!Save.data.dex[c.id];

  // ---------- 名前の色 ----------
  function colorUnlocked(def) {
    return !def.unlock || !!Save.data.achievements[def.unlock];
  }

  // 自分の名前の色の id（いつもの色・まだ使えない色なら null）
  function myColor() {
    const d = colorDef(Save.data.profile.nameColor);
    return d && (d.color || d.style) && colorUnlocked(d) ? d.id : null;
  }

  // 相手・ランキングから届いた色の id を確かめる（config.js にある色だけ。いつもの色なら null）
  function cleanColor(id) {
    const d = typeof id === "string" ? colorDef(id) : null;
    return d && (d.color || d.style) ? d.id : null;
  }

  // 色をつけた名前の HTML（name はそのままの文字。ここで escape する）
  function nameHTML(name, id) {
    const text = UI.escape(name);
    const d = cleanColor(id) ? colorDef(id) : null;
    if (!d) return text;
    if (d.style) return `<span class="pname pname-${d.style}">${text}</span>`;
    return `<span class="pname" style="color:${d.color}">${text}</span>`;
  }

  // 解放条件の説明（背景・土台と同じ書き方）
  function conditionText(def) {
    const a = typeof Achievements !== "undefined" ? Achievements.find(def.unlock) : null;
    if (a && a.hidden && !Save.data.achievements[a.id]) return "隠し実績を達成";
    return a ? `実績「${a.name}」を達成` : "ある実績を達成";
  }

  function renderColors() {
    const name = Save.playerName(1);
    const current = myColor();
    $("name-colors").innerHTML = colors()
      .map((d) => {
        const open = colorUnlocked(d);
        const id = d.color || d.style ? d.id : null;
        const sel = (id || null) === current;
        return `
          <button class="name-color ${open ? "" : "locked"} ${sel ? "selected" : ""}" data-color="${UI.escape(d.id)}" ${open ? "" : "disabled"}>
            <b>${open ? nameHTML(name, id) : "🔒"}</b>
            <small>${UI.escape(d.name)}${open ? "" : `<br>${UI.escape(conditionText(d))}`}</small>
          </button>`;
      })
      .join("");
  }

  function selectColor(id) {
    const d = colorDef(id);
    if (!d || !colorUnlocked(d)) return;
    Save.data.profile.nameColor = d.color || d.style ? d.id : null;
    Save.write();
    renderColors();
    Profile.refresh();
    renderCardPreview();
  }

  // ---------- お気に入りのキャラ ----------
  // 自分のお気に入り（図鑑から消えていたら null）
  function myFavorite() {
    const c = Chars.byId(Save.data.profile.favorite);
    return registered(c) ? c : null;
  }

  // 相手・ランキングから届いたキャラの id を確かめる（このゲームにいるキャラだけ）
  function cleanFavorite(id) {
    const c = typeof id === "string" ? Chars.byId(id) : null;
    return c ? c.id : null;
  }

  function renderFavorite() {
    const c = myFavorite();
    $("btn-fav").innerHTML = c ? `<img src="${UI.escape(c.file)}" alt="">` : `<small>選ぶ</small>`;
    $("fav-name").textContent = c ? c.name : "まだ選んでいません";
    $("btn-fav-clear").classList.toggle("hidden", !c);
  }

  // ---------- キャラを選ぶ画面（お気に入り・アイコン） ----------
  let picking = null; // "favorite" | "icon"

  function openPicker(mode) {
    picking = mode;
    const list = window.CHARACTERS.filter((c) => !c.event || registered(c) || LimitedEvents.isActive(c.event));
    const current = mode === "favorite" ? Save.data.profile.favorite : Save.data.profile.iconChar;
    $("char-picker-title").textContent = mode === "favorite" ? "お気に入りのキャラを選ぶ" : "アイコンにするキャラを選ぶ";
    $("char-picker-grid").innerHTML = list
      .map((c) => {
        const open = registered(c);
        return `
          <button class="stamp-choice ${open ? "" : "locked"} ${current === c.id ? "selected" : ""}"
                  data-char="${UI.escape(c.id)}" ${open ? "" : "disabled"} aria-label="${open ? UI.escape(c.name) : "まだ図鑑にいないキャラ"}">
            <img src="${UI.escape(c.file)}" alt="">
          </button>`;
      })
      .join("");
    $("char-picker").classList.add("active");
  }

  function closePicker() {
    $("char-picker").classList.remove("active");
    picking = null;
  }

  async function choose(id) {
    const c = Chars.byId(id);
    if (!registered(c)) return;
    const mode = picking;
    closePicker();
    if (mode === "favorite") {
      Save.data.profile.favorite = c.id;
      Save.write();
      renderFavorite();
      Profile.refresh();
    renderCardPreview();
      return;
    }
    // アイコン：キャラの絵から丸いアイコンを作る
    const icon = await makeIcon(c);
    if (!icon) return UI.toast("アイコンを作れませんでした");
    const before = { icon: Save.data.profile.icon, iconChar: Save.data.profile.iconChar };
    Save.data.profile.icon = icon;
    Save.data.profile.iconChar = c.id;
    if (!Save.write()) {
      Object.assign(Save.data.profile, before);
      UI.toast("保存できませんでした（端末の保存容量が足りません）");
    }
    Profile.refresh();
    renderCardPreview();
  }

  // キャラの絵 → 256px の JPEG（レア度の色のうすい背景に、キャラ全体が収まるように）。作れなければ null
  function makeIcon(c) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = ICON_SIZE;
        const ctx = cv.getContext("2d");
        const r = (window.GAME_CONFIG.rarity || {})[c.rarity] || {};
        const g = ctx.createRadialGradient(ICON_SIZE / 2, ICON_SIZE * 0.4, 10, ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE * 0.75);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, r.color || "#b9c4d6");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
        // 丸く切り抜いて見せるので、まわりを少し空けて、まん中に置く
        const box = ICON_SIZE * 0.74;
        const s = Math.min(box / img.width, box / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = c.file;
    });
  }

  // ---------- プロフィール画面 ----------
  // 対戦カードの見本も、名前の色・お気に入りに合わせて書きなおす
  function renderCardPreview() {
    if ($("card-preview")) $("card-preview").innerHTML = VsIntro.myCardHTML();
  }

  function render() {
    renderColors();
    renderFavorite();
    $("btn-icon-char").textContent = Save.data.profile.iconChar ? "キャラを変える" : "キャラにする";
  }

  // 実績を達成したとき（achievements.js から）：それで使えるようになった名前の色を知らせる
  function notifyUnlocked(newAchievements) {
    const ids = newAchievements.map((a) => a.id);
    for (const d of colors()) if (d.unlock && ids.includes(d.unlock)) UI.toast(`🎨 名前の色「${UI.escape(d.name)}」が使えるようになりました`);
  }

  function init() {
    $("name-colors").addEventListener("click", (e) => {
      const b = e.target.closest("[data-color]");
      if (b && !b.disabled) selectColor(b.dataset.color);
    });
    $("btn-fav").addEventListener("click", () => openPicker("favorite"));
    $("btn-fav-clear").addEventListener("click", () => {
      Save.data.profile.favorite = null;
      Save.write();
      renderFavorite();
      Profile.refresh();
    renderCardPreview();
    });
    $("btn-icon-char").addEventListener("click", () => openPicker("icon"));
    $("char-picker-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-char]");
      if (b && !b.disabled) choose(b.dataset.char);
    });
    $("char-picker-close").addEventListener("click", closePicker);
  }

  return { init, render, myColor, cleanColor, nameHTML, myFavorite, cleanFavorite, notifyUnlocked, makeIcon };
})();
