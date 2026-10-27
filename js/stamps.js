// =============================================
// stamps.js
// スタンプ：オンライン対戦のリザルト画面で、相手にキャラのスタンプを送る
//
// ・スタンプは4つ。プロフィール画面で、図鑑に登録したキャラから選ぶ
//   （何も選んでいない枠は、config.js の stamps.defaults の初期スタンプ。初期スタンプは図鑑に関係なく使える）
// ・送るのはキャラの ID（画像のファイル名から拡張子を除いたもの。例 "chara03"）だけ。
//   画像はどちらの端末にも入っているので、受け取った側はその ID の画像を出す（相手の図鑑に無くても出る）
// ・自分のスタンプは右、相手のスタンプは左に、ポンッと出て少したつと消える
// =============================================

const Stamps = (() => {
  const $ = (id) => document.getElementById(id);
  const SLOTS = 4; // スタンプの数
  const COOLDOWN = 1500; // 送ったあと、次を送れるようになるまで（ミリ秒）
  const SHOW_TIME = 2600; // スタンプを表示しておく時間（ミリ秒。CSS のアニメーションと同じ）

  // 送っている相手 { send(id), opponentName }。リザルト画面でスタンプを使えないときは null
  let session = null;
  let coolUntil = 0;
  let pickingSlot = -1; // 選ぶ画面で、どの枠を選んでいるか

  // キャラは ID で見分ける（chars.js）
  const byId = (id) => Chars.byId(id);
  const saved = () => Save.data.stamps;
  const isUnlocked = (c) => !!Save.data.dex[c.id];
  const defaults = () => ((window.GAME_CONFIG.stamps || {}).defaults || []);

  function init() {
    $("stamp-slots").addEventListener("click", (e) => {
      const slot = e.target.closest("[data-slot]");
      if (slot) openPicker(Number(slot.dataset.slot));
    });
    $("stamp-picker-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-stamp]");
      if (btn && !btn.disabled) choose(btn.dataset.stamp);
    });
    $("stamp-picker-default").addEventListener("click", () => choose(null));
    $("stamp-picker-close").addEventListener("click", closePicker);
    $("stamp-buttons").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-stamp]");
      if (btn) send(btn.dataset.stamp);
    });
    // リザルト画面にいるときだけ、スタンプの欄を出す（カード・フォトモードに行ったら隠す）
    UI.onChange(updateBar);
  }

  // 枠 i のスタンプ（選んだキャラが図鑑から消えていたら、初期スタンプにもどる）
  function slotChar(i) {
    const c = byId(saved()[i]);
    if (c && isUnlocked(c)) return c;
    return byId(defaults()[i]) || window.CHARACTERS[i] || null;
  }

  // 枠 i が初期スタンプのままか
  function isDefault(i) {
    const c = byId(saved()[i]);
    return !(c && isUnlocked(c));
  }

  // ---------- プロフィール画面：4つの枠 ----------
  function renderSlots() {
    let html = "";
    for (let i = 0; i < SLOTS; i++) {
      const c = slotChar(i);
      html += `
        <button class="stamp-slot" data-slot="${i}" aria-label="スタンプ${i + 1}を変える">
          ${c ? `<img src="${UI.escape(c.file)}" alt="">` : ""}
          ${isDefault(i) ? `<small>初期</small>` : ""}
        </button>`;
    }
    $("stamp-slots").innerHTML = html;
  }

  // ---------- キャラを選ぶ画面 ----------
  // 図鑑と同じキャラを並べる。図鑑に登録したキャラだけ選べて、まだのキャラはシルエット
  function openPicker(slot) {
    pickingSlot = slot;
    const list = window.CHARACTERS.filter((c) => !c.event || isUnlocked(c) || LimitedEvents.isActive(c.event));
    const current = slotChar(slot);
    $("stamp-picker-title").textContent = `スタンプ${slot + 1}を選ぶ`;
    $("stamp-picker-grid").innerHTML = list
      .map((c) => {
        const open = isUnlocked(c);
        return `
          <button class="stamp-choice ${open ? "" : "locked"} ${current === c && !isDefault(slot) ? "selected" : ""}"
                  data-stamp="${UI.escape(c.id)}" ${open ? "" : "disabled"} aria-label="${open ? UI.escape(c.name) : "まだ図鑑にいないキャラ"}">
            <img src="${UI.escape(c.file)}" alt="">
          </button>`;
      })
      .join("");
    $("stamp-picker").classList.add("active");
  }

  // id のキャラにする（null なら初期スタンプにもどす）
  function choose(id) {
    if (pickingSlot < 0) return;
    const c = id ? byId(id) : null;
    if (id && !(c && isUnlocked(c))) return;
    saved()[pickingSlot] = id;
    Save.write();
    closePicker();
    renderSlots();
  }

  function closePicker() {
    $("stamp-picker").classList.remove("active");
    pickingSlot = -1;
  }

  // ---------- リザルト画面 ----------
  // オンライン対戦のリザルトで使えるようにする。send(id) で相手に送る
  function begin(sendFn, opponentName) {
    session = { send: sendFn, opponentName, left: false };
    coolUntil = 0;
    $("stamp-layer").innerHTML = "";
    $("stamp-status").textContent = "";
    $("stamp-buttons").innerHTML = Array.from({ length: SLOTS }, (_, i) => slotChar(i))
      .filter(Boolean)
      .map((c) => `<button class="stamp-send" data-stamp="${UI.escape(c.id)}" aria-label="${UI.escape(c.name)}"><img src="${UI.escape(c.file)}" alt=""></button>`)
      .join("");
    updateBar();
  }

  // スタンプを使うのをやめる（次のゲームが始まった・タイトルに戻った）
  function end() {
    session = null;
    $("stamp-layer").innerHTML = "";
    $("stamp-status").textContent = "";
    updateBar();
  }

  // 相手がいなくなった（タイトルに戻った・接続が切れた）
  function peerLeft() {
    if (!session) return;
    session.left = true;
    $("stamp-status").textContent = "相手が退出しました";
    updateBar();
  }

  function updateBar() {
    const show = !!session && UI.current === "result";
    $("stamp-bar").classList.toggle("hidden", !show);
    $("screen-result").classList.toggle("with-stamps", !!session);
    for (const b of document.querySelectorAll(".stamp-send")) b.disabled = !session || session.left || Date.now() < coolUntil;
  }

  // 自分のスタンプを送る
  function send(id) {
    if (!session || session.left || Date.now() < coolUntil || !byId(id)) return;
    coolUntil = Date.now() + COOLDOWN;
    updateBar();
    $("stamp-bar").classList.remove("cooling");
    void $("stamp-bar").offsetWidth; // 連打防止の「待ち」の表示を最初から
    $("stamp-bar").classList.add("cooling");
    setTimeout(updateBar, COOLDOWN + 20);
    session.send(id);
    Sound.play("stamp");
    pop(byId(id), "me", "あなた");
  }

  // 相手からスタンプが届いた（知らない ID は無視する）
  function receive(id) {
    const c = byId(String(id || ""));
    if (!c || !session || UI.current !== "result") return;
    Sound.play("stamp");
    pop(c, "them", session.opponentName);
  }

  // スタンプをポンッと出す（自分は右、相手は左）。少したつと消える
  function pop(c, side, who) {
    const el = document.createElement("div");
    el.className = `stamp-pop ${side}`;
    // 高さを少しずつずらして、続けて出たときに重なりにくくする
    el.style.top = `${18 + Math.random() * 30}%`;
    el.innerHTML = `<img src="${UI.escape(c.file)}" alt=""><small>${UI.escape(who)}</small>`;
    $("stamp-layer").appendChild(el);
    setTimeout(() => el.remove(), SHOW_TIME);
  }

  return { init, renderSlots, begin, end, peerLeft, receive };
})();
