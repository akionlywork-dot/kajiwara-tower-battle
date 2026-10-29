// =============================================
// dex.js
// キャラ図鑑：一度でも積んだキャラが登録される
// キャラの一覧・名前・説明文は characters.js
// =============================================

const Dex = (() => {
  const $ = (id) => document.getElementById(id);
  // 図鑑に並べるキャラ。期間限定のキャラ（characters.js の event）は、登録ずみか、イベントの期間中だけ出す
  const chars = () => window.CHARACTERS.filter((c) => !c.event || registered()[c.id] || LimitedEvents.isActive(c.event));
  // 「図鑑コンプリート」に数えるキャラ（期間限定のキャラは数えない。期間が終わると集められなくなるため。
  // まぼろしのように出る確率が 0 のキャラも、まだ集められないので数えない）
  const regular = () => window.CHARACTERS.filter((c) => !c.event && Chars.appears(c));
  const registered = () => Save.data.dex; // キャラの ID → 登録した日時

  function init() {
    UI.onShow("dex", render);
    $("dex-grid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-id]");
      if (card && registered()[card.dataset.id]) openDetail(card.dataset.id);
    });
    $("dex-popup-close").addEventListener("click", () => $("dex-popup").classList.remove("active"));
  }

  // キャラを登録する（main.js から、キャラを1体積めたときに呼ばれる）
  // 初めて登録したときだけ true を返す
  // id：キャラの ID（知らない ID なら何もしない）
  function register(id) {
    const c = Chars.byId(id);
    if (!c || registered()[id]) return false;
    registered()[id] = new Date().toISOString();
    Save.write();
    UI.toast(`<img class="toast-img" src="${UI.escape(c.file)}" alt="">図鑑に登録：<b>${UI.escape(c.name)}</b>`);
    return true;
  }

  // 登録数（今の characters.js にある、期間限定でないキャラだけを数える）
  function count() {
    return regular().filter((c) => registered()[c.id]).length;
  }

  function total() {
    return regular().length;
  }

  // ---------- 図鑑画面 ----------
  // レア度の低い順（★1 → ★6）に、レア度ごとに区切って並べる。
  // 同じレア度の中は characters.js の順番。No. は並べた順につける
  // 見出しに、全体とレア度ごとの解放率（登録した数 ÷ 集められるキャラの数）を出す
  function render() {
    $("dex-count").textContent = `${count()} / ${total()}体（${percent(count(), total())}%）`;
    const list = chars();
    const groups = new Map(); // レア度の id → そのレア度のキャラ
    for (const c of list) {
      const id = rarityOf(c).id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(c);
    }
    const order = [...groups.keys()].sort((a, b) => rarityOf({ rarity: a }).stars - rarityOf({ rarity: b }).stars);
    let no = 0;
    $("dex-grid").innerHTML = order
      .map((rid) => {
        const r = rarityOf({ rarity: rid });
        // 解放率は、集められるキャラ（期間限定・まだ登場しないキャラを除く）で数える
        const members = regular().filter((c) => rarityOf(c).id === rid);
        const got = members.filter((c) => registered()[c.id]).length;
        const rate = members.length ? `${got} / ${members.length}（${percent(got, members.length)}%）` : "まだだれも見つけていない";
        const head = `
          <h3 class="dex-section" style="--rare-color:${r.color}">
            <span class="rarity-stars">${"★".repeat(r.stars)}</span> ${UI.escape(r.name)}
            <small>${rate}</small>
          </h3>`;
        return head + groups.get(rid).map((c) => cardHTML(c, r, ++no)).join("");
      })
      .join("");
  }

  // 割合（%。小数は切り捨て。0人中なら 0）
  function percent(n, all) {
    return all ? Math.floor((n / all) * 100) : 0;
  }

  // 1体分のカード（レア度は、未登録のキャラでも★だけ見せる。「レアがまだいる！」と分かるように）
  //   ★5（まぼろし）は専用の枠。まだ登録していない★5は、シルエットではなく「？」にする（どんな姿かは秘密）
  //   ★6（シークレット）は金と黒の専用の枠。まだのキャラは★5と同じく「？」
  //   サイズ違い（variant）は、絵を大きく・小さく見せて「BIG」「MINI」の札を付ける
  function cardHTML(c, r, no) {
    const got = !!registered()[c.id];
    const legend = r.stars >= 5;
    const secret = r.stars >= 6;
    const img = legend && !got ? `<span class="dex-question">？</span>` : `<img src="${UI.escape(c.file)}" alt="">`;
    const size = c.variant === "big" || c.variant === "small" ? `<em class="dex-size dex-size-${c.variant}">${c.variant === "big" ? "BIG" : "MINI"}</em>` : "";
    return `
      <button class="dex-card ${got ? "" : "dex-locked"} ${r.id !== "N" ? "dex-rare" : ""} ${secret ? "dex-secret" : legend ? "dex-legend" : ""}" style="--rare-color:${r.color}" data-id="${UI.escape(c.id)}" ${got ? "" : "disabled"}>
        <span class="dex-img ${auraClass(c)} ${c.variant ? "dex-variant-" + c.variant : ""}">${img}${size}</span>
        <span class="dex-no">No.${String(no).padStart(2, "0")} <span class="rarity-stars">${"★".repeat(r.stars)}</span></span>
        <b class="dex-name">${got ? UI.escape(c.name) : "？？？"}</b>
      </button>`;
  }

  // キャラのレア度の情報 { id, name, color, stars }（config.js の rarity）
  function rarityOf(c) {
    const table = window.GAME_CONFIG.rarity;
    const id = table[c.rarity] ? c.rarity : "N";
    return Object.assign({ id }, table[id]);
  }

  // ★4のオーラを、図鑑のカードと詳細で動いて見せるための CSS のクラス（オーラが無ければ ""）
  function auraClass(c) {
    return c.aura && Aura.has(c.aura) ? `aura-card aura-${c.aura}` : "";
  }

  function openDetail(id) {
    const c = chars().find((x) => x.id === id);
    if (!c) return;
    const date = new Date(registered()[id]);
    const r = rarityOf(c);
    $("dex-popup-content").innerHTML =
      `<div class="dex-detail-img ${auraClass(c)} ${c.variant ? "dex-variant-" + c.variant : ""} ${r.stars >= 6 ? "dex-detail-secret" : r.stars >= 5 ? "dex-detail-legend" : ""}"><img src="${UI.escape(c.file)}" alt=""></div>` +
      `<h3 class="dex-detail-name">${UI.escape(c.name)}</h3>` +
      `<span class="rarity-label" style="--rare-color:${r.color}">${"★".repeat(r.stars)} ${UI.escape(r.name)}</span>` +
      `<p class="dex-detail-text">${UI.escape(c.description || "")}</p>` +
      `<p class="dex-detail-date">登録日：${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}</p>`;
    $("dex-popup").classList.add("active");
  }

  // 管理者モード：全部登録する（on=true）／全部消す（on=false）
  function setAll(on) {
    const now = new Date().toISOString();
    for (const key of Object.keys(registered())) delete registered()[key];
    if (on) for (const c of chars()) registered()[c.id] = now;
    Save.write();
  }

  return { init, register, count, total, setAll };
})();
