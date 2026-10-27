// =============================================
// dex.js
// キャラ図鑑：一度でも積んだキャラが登録される
// キャラの一覧・名前・説明文は characters.js
// =============================================

const Dex = (() => {
  const $ = (id) => document.getElementById(id);
  // 図鑑に並べるキャラ。期間限定のキャラ（characters.js の event）は、登録ずみか、イベントの期間中だけ出す
  const chars = () => window.CHARACTERS.filter((c) => !c.event || registered()[c.id] || LimitedEvents.isActive(c.event));
  // 「図鑑コンプリート」に数えるキャラ（期間限定のキャラは数えない。期間が終わると集められなくなるため）
  const regular = () => window.CHARACTERS.filter((c) => !c.event);
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
  function render() {
    $("dex-count").textContent = `${count()} / ${total()}体`;
    $("dex-grid").innerHTML = chars()
      .map((c, i) => {
        const got = !!registered()[c.id];
        const no = String(i + 1).padStart(2, "0");
        const r = rarityOf(c);
        // レア度は、未登録のキャラでも★だけ見せる（「レアがまだいる！」と分かるように）
        return `
          <button class="dex-card ${got ? "" : "dex-locked"} ${r.id !== "N" ? "dex-rare" : ""}" style="--rare-color:${r.color}" data-id="${UI.escape(c.id)}" ${got ? "" : "disabled"}>
            <span class="dex-img ${auraClass(c)}"><img src="${UI.escape(c.file)}" alt=""></span>
            <span class="dex-no">No.${no} <span class="rarity-stars">${"★".repeat(r.stars)}</span></span>
            <b class="dex-name">${got ? UI.escape(c.name) : "？？？"}</b>
          </button>`;
      })
      .join("");
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
      `<div class="dex-detail-img ${auraClass(c)}"><img src="${UI.escape(c.file)}" alt=""></div>` +
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
