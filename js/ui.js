// =============================================
// ui.js
// 画面の切りかえと、画面まわりの演出（紙吹雪・数字のカウントアップ）
// =============================================

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  // 画面の名前 → HTML の要素
  // id が "screen-〇〇" の <section> を自動で登録する（例：screen-news → "news"）
  const SCREENS = {};
  for (const el of document.querySelectorAll("section.screen")) {
    SCREENS[el.id.replace("screen-", "")] = el;
  }
  let current = "title";
  const listeners = {}; // 画面が開いたときに呼ぶ関数（画面の名前 → 関数）

  // 画面を切りかえる。name に null を渡すとゲーム画面（画面を全部閉じて HUD を出す）
  // 実際のアニメーションは CSS の .screen / .screen.active に書いてある
  function show(name) {
    if (name !== null && !SCREENS[name]) return; // 存在しない画面の名前なら何もしない
    for (const [key, el] of Object.entries(SCREENS)) {
      el.classList.toggle("active", key === name);
    }
    // ゲーム中の表示（スコア・操作ボタン）は、画面が何も開いていないときだけ出す
    for (const el of document.querySelectorAll(".game-ui")) {
      el.classList.toggle("off", name !== null);
    }
    current = name;
    if (listeners[name]) listeners[name]();
  }

  // 画面が開いたときに、中身を最新にする処理を登録する
  function onShow(name, fn) {
    listeners[name] = fn;
  }

  // ---------- 確認ダイアログ ----------
  // ブラウザの confirm() の代わり。ゲームの見た目に合わせたダイアログを出し、
  // 「OK」なら true、「キャンセル」なら false で終わる Promise を返す
  // 使い方： if (await UI.confirm("本当にリセットしますか？")) { ... }
  function confirm(message, okLabel = "OK") {
    return new Promise((resolve) => {
      const box = $("dialog");
      $("dialog-message").textContent = message;
      $("dialog-ok").textContent = okLabel;
      box.classList.add("active");
      const close = (result) => {
        box.classList.remove("active");
        $("dialog-ok").onclick = $("dialog-cancel").onclick = null;
        resolve(result);
      };
      $("dialog-ok").onclick = () => close(true);
      $("dialog-cancel").onclick = () => close(false);
    });
  }

  // ---------- 通知（画面の上から出てきて、少したつと消える） ----------
  // 「実績解除！」などに使う。続けて呼ばれたら、順番に1つずつ出す
  const toastQueue = [];
  let toastBusy = false;

  function toast(html) {
    toastQueue.push(html);
    if (!toastBusy) nextToast();
  }

  function nextToast() {
    const html = toastQueue.shift();
    if (html === undefined) {
      toastBusy = false;
      return;
    }
    toastBusy = true;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    $("toasts").appendChild(el);
    setTimeout(() => el.classList.add("leave"), 2600); // 2.6秒表示したら消える
    setTimeout(() => {
      el.remove();
      nextToast();
    }, 3000);
  }

  // HTML に入れる文字を安全にする（名前などに < > が入っていても、そのまま文字として表示する）
  function escape(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // 画面の中のアニメーション（ロゴが弾んで登場、など）を最初から再生しなおす
  // 画面は見えていない間もアニメーションが進んでしまうので、表示したときに巻き戻す
  function replayAnimations(name) {
    const el = SCREENS[name];
    if (!el.getAnimations) return; // 古いブラウザではあきらめる（表示はされる）
    for (const anim of el.getAnimations({ subtree: true })) {
      anim.cancel();
      anim.play();
    }
  }

  // ---------- スプラッシュ画面 ----------
  // 会社名を1文字ずつ浮かび上がらせ、displayTime 秒表示したらフェードアウトする。
  // 画面をタップするとすぐにフェードアウト（スキップ）。
  // フェードアウトが始まったときに終わる Promise を返す（後ろのタイトル画面と重ねて切りかえるため）
  function splash(text, displayTime) {
    return new Promise((resolve) => {
      const el = $("splash");
      const p = $("splash-text");
      p.innerHTML = "";
      [...text].forEach((ch, i) => {
        const span = document.createElement("span");
        span.textContent = ch === " " ? " " : ch; // 空白も1文字分の幅をとる
        span.style.setProperty("--i", i); // 何文字目か → CSS で出てくる時間をずらす
        p.appendChild(span);
      });
      el.classList.remove("hidden", "fade-out");

      // 全部の文字が出そろうまでの時間（CSS の animation-delay・duration と合わせてある）
      const appearMs = 200 + text.length * 60 + 600;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        el.classList.add("fade-out");
        setTimeout(() => el.classList.add("hidden"), 700);
        resolve();
      };
      const timer = setTimeout(finish, appearMs + displayTime * 1000);
      el.addEventListener("pointerdown", finish, { once: true });
    });
  }

  // ---------- 演出 ----------
  // 紙吹雪を降らせる（colors の色をランダムに使う）
  function confetti(colors) {
    const box = $("confetti");
    box.innerHTML = "";
    for (let i = 0; i < 40; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "%";
      s.style.background = colors[i % colors.length];
      s.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
      s.style.animationDelay = Math.random() * 0.6 + "s";
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(s);
    }
  }

  function clearConfetti() {
    $("confetti").innerHTML = "";
  }

  // 数字を 0 から to まで、duration ミリ秒かけて増やしながら表示する
  function countUp(el, to, duration) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // 最後はゆっくり
      el.textContent = Math.round(to * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // iPhone の Safari で、ボタンを押したときの :active（縮む演出）を効かせるためのおまじない
  document.addEventListener("touchstart", () => {}, { passive: true });

  // ---------- 画面の拡大を防ぐ ----------
  // iPhone の Safari は <meta name="viewport"> の拡大禁止を無視するので、ここで止める
  // gesturestart / gesturechange … iPhone 独自の「2本指で拡大」の操作
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (e) => e.preventDefault());
  }
  // 2本指以上でさわって動かしたら、ブラウザの拡大を止める（1本指のスクロールはそのまま）
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  return {
    show, onShow, replayAnimations, splash, confetti, clearConfetti, countUp, confirm, toast, escape,
    get current() { return current; },
  };
})();
