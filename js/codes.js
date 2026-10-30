// =============================================
// codes.js
// 合言葉：ホーム画面の 🔑 から入力すると、ごほうび（称号・背景・土台）がもらえる
//
// ・合言葉の一覧は data/codes.json（1つ足すと合言葉が増える）。ソースはだれでも見られるので、
//   合言葉そのものは書かずに、SHA-256 の番号（hash）で書く。入力された文字を同じ作り方で番号にして見比べる
//     番号 ＝ SHA-256("kajiwara-code:" ＋ そろえた合言葉) の16進数。管理者モードの「合言葉」で作れる
// ・入力をそろえる（normalize）：全角・半角（NFKC）、空白を消す、大文字 → 小文字、カタカナ → ひらがな、のばす棒・ハイフン → 「ー」
// ・ごほうび（codes.json の reward）：
//     title      … 称号（data/achievements.json の実績の id。その実績の condition を { "type": "code", "code": 合言葉の id } にしておく）
//     background … 背景の id ／ platform … 土台の id（config.js の themes。unlock: "code" にすると、合言葉でしか手に入らないものになる。
//                  ほかの unlock の背景・土台も、合言葉で先にもらえる）
// ・使った合言葉は Save.data.codes に { 合言葉の id: { at: 使った日時, reward } } で残す（1人1回。データの書き出しにも入る）。
//   もらった背景・土台は、ここに残した reward で決めるので、あとで codes.json から合言葉を消しても、使えたまま
// ・まちがいが MAX_FAILS 回続いたら、LOCK_MS のあいだ入力できない（総当たりを防ぐ。この端末の localStorage に残す）
// =============================================

const Codes = (() => {
  const $ = (id) => document.getElementById(id);
  const SALT = "kajiwara-code:"; // 番号を作るときに前に付ける文字（変えると、codes.json の番号を全部作りなおす）
  const MAX_FAILS = 5;
  const LOCK_MS = 30 * 1000;
  const LOCK_KEY = "stack.codeLock"; // { fails, until }
  const ID_PATTERN = /^[a-z0-9_]{1,40}$/;
  let defs = null; // codes.json の中身（読み込めなかったら null）

  const used = () => (Save.data.codes = Save.data.codes || {});

  // ---------- 入力をそろえる・番号にする ----------
  function normalize(text) {
    return String(text || "")
      .normalize("NFKC") // 全角の英数字 → 半角、半角カナ → 全角
      .replace(/\s+/g, "") // 空白（全角の空白もふくむ）を消す
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ → ひらがな
      .replace(/[-‐‑‒–—―−ｰー]/g, "ー"); // のばす棒・ハイフンのいろいろ → 「ー」
  }

  async function hashOf(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + normalize(text)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function load() {
    const json = await DataFile.load("data/codes.json");
    defs = json && Array.isArray(json.codes) ? json.codes.filter((c) => c && ID_PATTERN.test(String(c.id)) && /^[0-9a-f]{64}$/.test(String(c.hash))) : null;
    return defs;
  }

  // ---------- まちがいの回数 ----------
  function readLock() {
    try {
      const v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null");
      if (v && typeof v === "object") return { fails: Number(v.fails) || 0, until: Number(v.until) || 0 };
    } catch (e) {}
    return { fails: 0, until: 0 };
  }
  function writeLock(v) {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify(v));
    } catch (e) {}
  }
  // あと何秒待つか（待たなくてよければ 0）
  function waitSeconds() {
    return Math.max(0, Math.ceil((readLock().until - Date.now()) / 1000));
  }

  // ---------- 合言葉を使う ----------
  // 結果：{ status: "ok", def, reward } / "empty" / "wrong"（left：あと何回）/ "used"（def）/ "locked"（wait：秒）/ "offline" / "unsupported"
  async function redeem(text) {
    const wait = waitSeconds();
    if (wait > 0) return { status: "locked", wait };
    if (!normalize(text)) return { status: "empty" };
    if (!window.crypto || !crypto.subtle) return { status: "unsupported" };
    if (!(await load())) return { status: "offline" };
    const h = await hashOf(text);
    const def = defs.find((d) => d.hash === h);
    if (!def) {
      const lock = readLock();
      lock.fails++;
      if (lock.fails >= MAX_FAILS) {
        writeLock({ fails: 0, until: Date.now() + LOCK_MS });
        return { status: "locked", wait: Math.ceil(LOCK_MS / 1000), justLocked: true };
      }
      writeLock(lock);
      return { status: "wrong", left: MAX_FAILS - lock.fails };
    }
    writeLock({ fails: 0, until: 0 });
    if (used()[def.id]) return { status: "used", def };
    const reward = cleanReward(def.reward);
    used()[def.id] = { at: new Date().toISOString(), reward };
    Save.write();
    // 称号：実績（condition が { type: "code" } のもの）を達成にする。背景・土台：解放を見なおす
    if (typeof Achievements !== "undefined") Achievements.check(null);
    if (typeof Themes !== "undefined") Themes.apply();
    if (typeof Profile !== "undefined") Profile.refresh();
    return { status: "ok", def, reward };
  }

  // ごほうびの id を確かめる（おかしな id は使わない）
  function cleanReward(r) {
    const out = {};
    if (!r || typeof r !== "object") return out;
    for (const k of ["title", "background", "platform"]) if (ID_PATTERN.test(String(r[k] || ""))) out[k] = String(r[k]);
    return out;
  }

  // 背景・土台 id を、使った合言葉でもらっているか（themes.js から）
  function grants(kind, id) {
    const key = kind === "platforms" ? "platform" : "background";
    return Object.values(used()).some((u) => u && u.reward && u.reward[key] === id);
  }

  // 実績の condition { type: "code", code } を満たしているか（achievements.js から）
  function hasUsed(codeId) {
    return !!used()[codeId];
  }

  // ---------- 画面 ----------
  function open() {
    $("code-input").value = "";
    showForm();
    $("code-dialog").classList.add("active");
    setTimeout(() => $("code-input").focus(), 50);
  }

  function close() {
    $("code-dialog").classList.remove("active");
  }

  function showForm(message = "", kind = "") {
    $("code-form").classList.remove("hidden");
    $("code-result").classList.add("hidden");
    $("code-message").textContent = message;
    $("code-message").className = "code-message" + (kind ? " code-" + kind : "");
    renderWait();
  }

  // 待っているあいだは、ボタンを押せないようにして、残りの秒数を出す
  let waitTimer = null;
  function renderWait() {
    clearInterval(waitTimer);
    const tick = () => {
      const w = waitSeconds();
      $("btn-code-ok").disabled = w > 0;
      $("btn-code-ok").textContent = w > 0 ? `あと ${w} 秒` : "たしかめる";
      if (w <= 0) clearInterval(waitTimer);
    };
    tick();
    if (waitSeconds() > 0) waitTimer = setInterval(tick, 500);
  }

  async function submit() {
    $("btn-code-ok").disabled = true;
    const r = await redeem($("code-input").value);
    if (r.status === "ok") return showResult(r);
    const msg = {
      empty: ["合言葉を入れてください", "info"],
      wrong: [`合言葉がちがいます${r.left <= 2 ? `（あと ${r.left} 回まちがえると、しばらく入力できません）` : ""}`, "error"],
      used: [`この合言葉は、もう使っています（「${r.def && r.def.name ? r.def.name : ""}」は受け取りずみ）`, "info"],
      locked: [r.justLocked ? `${MAX_FAILS} 回まちがえたので、${r.wait} 秒待ってから、もう一度ためしてください` : `まちがいが続いたので、少し待ってから、もう一度ためしてください`, "error"],
      offline: ["合言葉を確かめられませんでした。通信できる場所で、もう一度ためしてください", "error"],
      unsupported: ["このブラウザでは、合言葉を使えません", "error"],
    }[r.status];
    showForm(msg[0], msg[1]);
    if (r.status === "wrong" || r.status === "locked") Sound.play("gameover");
  }

  // 成功：ごほうびを並べて、紙吹雪
  function showResult({ def, reward }) {
    const items = [];
    if (reward.title && typeof Achievements !== "undefined") {
      const a = Achievements.find(reward.title);
      if (a) items.push(`<li class="code-reward"><span class="code-reward-kind">称号</span>${Frames.titleHTML(a.title, Frames.ofAchievement(a))}</li>`);
    }
    for (const [key, kind, label] of [["background", "backgrounds", "背景"], ["platform", "platforms", "土台"]]) {
      const t = reward[key] ? Themes.previewOf(kind, reward[key]) : null;
      if (t) items.push(`<li class="code-reward"><span class="code-reward-kind">${label}</span><img src="${t.src}" alt=""><b>${UI.escape(t.name)}</b></li>`);
    }
    $("code-result-name").textContent = def.name || "合言葉";
    // もらったものの使い方（もらったものだけ書く）
    const how = [];
    if (reward.title) how.push("称号はプロフィールの「称号」");
    if (reward.background || reward.platform) how.push(`${reward.background && reward.platform ? "背景・土台" : reward.background ? "背景" : "土台"}はプロフィール`);
    $("code-result-note").textContent = how.length ? `${how.join("、")}で選べます` : "";
    $("code-result-list").innerHTML = items.join("") || `<li class="code-reward">ごほうびを受け取りました</li>`;
    $("code-form").classList.add("hidden");
    $("code-result").classList.remove("hidden");
    UI.confetti(["#ffd54a", "#ff8fb1", "#7ec8ff", "#7ee08a"], $("code-confetti"));
    Sound.play("record");
  }

  // ---------- 管理者モードから ----------
  // 使った合言葉を全部消す（合言葉でもらった称号・背景・土台も、使えなくなる）
  function resetAll() {
    const ids = Object.keys(used());
    Save.data.codes = {};
    // 合言葉の称号（condition が code の実績）を、達成していないことに戻す
    if (typeof Achievements !== "undefined") for (const id of Achievements.codeAchievementIds()) delete Save.data.achievements[id];
    writeLock({ fails: 0, until: 0 });
    Save.write();
    if (typeof Themes !== "undefined") Themes.apply();
    if (typeof Profile !== "undefined") Profile.refresh();
    return ids.length;
  }

  function init() {
    $("btn-codes").addEventListener("click", open);
    $("btn-code-ok").addEventListener("click", submit);
    $("code-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!$("btn-code-ok").disabled) submit();
      }
    });
    $("btn-code-cancel").addEventListener("click", close);
    $("btn-code-done").addEventListener("click", close);
  }

  return { init, open, normalize, hashOf, redeem, grants, hasUsed, resetAll, waitSeconds };
})();
