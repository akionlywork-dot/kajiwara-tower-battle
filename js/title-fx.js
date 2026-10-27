// =============================================
// title-fx.js
// タイトル画面の演出（ロゴ・スタートボタン・メニューのアイコン）
//
// ・登場：ロゴが1文字ずつ弾んで出る → タグライン → スタートボタン・メニューが下から出る
// ・ロゴはふわふわ上下に動き、ときどきキラッと光が走る。スタートボタンは脈打つ
// ・メニューのアイコンは、押すと少し縮んで戻る
// 動き自体は style.css（「タイトル画面の演出」）。ここでは、タイミング（config.js の titleFx）を CSS に渡し、
// キラッと光らせる合図を出す。背景の雲・鳥・揺れ・砂ぼこりは game.js
// タイトル以外の画面に移ったら止める（CSS のくり返しの動きは、画面が隠れると止まるようにしてある）
// =============================================

const TitleFx = (() => {
  const $ = (id) => document.getElementById(id);
  const conf = () => window.GAME_CONFIG.titleFx || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let shineTimer = null;

  function init() {
    splitLogo();
    applyTiming();
    // メニューのアイコン：押したら、少し縮んで戻る
    document.querySelector(".title-menu").addEventListener("pointerdown", (e) => {
      const icon = e.target.closest(".menu-icon");
      if (!icon) return;
      icon.classList.remove("pressed");
      void icon.offsetWidth; // アニメーションを最初から
      icon.classList.add("pressed");
    });
    document.querySelector(".title-menu").addEventListener("animationend", (e) => {
      if (e.target.classList.contains("menu-icon")) e.target.classList.remove("pressed");
    });
    UI.onChange((name) => setActive(name === "title"));
  }

  // ロゴの文字を、1文字ずつの <span> に分ける（1文字ずつ弾んで出すため）。
  // キラッと光る用に、同じ文字を重ねた透明な層も作る
  function splitLogo() {
    const logo = document.querySelector(".logo");
    const source = logo.innerHTML; // 「かじわら<br>タワーバトル」
    let i = 0;
    logo.innerHTML = source
      .split(/(<br\s*\/?>)/i)
      .map((part) => (/^<br/i.test(part) ? part : [...part].map((ch) => `<span class="logo-char" style="--i:${i++}">${ch}</span>`).join("")))
      .join("");
    logo.style.setProperty("--chars", i);
    const shine = document.createElement("span");
    shine.className = "logo-shine";
    shine.setAttribute("aria-hidden", "true");
    shine.innerHTML = source;
    logo.appendChild(shine);
  }

  // config.js の数値を、CSS の変数にする（登場の順番とタイミング）
  function applyTiming() {
    const c = conf();
    const chars = Number(document.querySelector(".logo").style.getPropertyValue("--chars")) || 10;
    const start = c.logoStart ?? 0.15;
    const step = c.logoStep ?? 0.07;
    const logoDone = start + step * (chars - 1) + 0.5; // 最後の文字が弾み終わるころ
    const tagline = logoDone + (c.taglineAfter ?? 0.15);
    const button = tagline + (c.buttonAfter ?? 0.3);
    const vars = {
      "--logo-start": start, "--logo-step": step, "--logo-done": logoDone,
      "--tagline-at": tagline, "--button-at": button, "--menu-at": button + 0.15,
      "--float-time": c.floatTime ?? 3.2, "--pulse-time": c.pulseTime ?? 1.6,
    };
    for (const [k, v] of Object.entries(vars)) $("screen-title").style.setProperty(k, `${Math.round(v * 1000) / 1000}s`);
  }

  // タイトル画面が出た・隠れた
  function setActive(on) {
    Game.setTitleFx(on);
    clearTimeout(shineTimer);
    if (on && !reducedMotion.matches) scheduleShine(true);
  }

  // ときどきロゴにキラッと光を走らせる
  function scheduleShine(first) {
    const [a, b] = conf().shineEvery || [4, 8];
    // 最初の1回は、登場が終わってから
    const firstWait = first ? parseFloat($("screen-title").style.getPropertyValue("--button-at")) || 2 : 0;
    shineTimer = setTimeout(() => {
      if (UI.current !== "title") return;
      const el = document.querySelector(".logo-shine");
      el.classList.remove("on");
      void el.offsetWidth;
      el.classList.add("on");
      scheduleShine(false);
    }, (firstWait + a + Math.random() * (b - a)) * 1000);
  }

  return { init };
})();
