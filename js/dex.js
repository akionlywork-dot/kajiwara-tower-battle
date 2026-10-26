// =============================================
// dex.js
// キャラ図鑑：一度でも積んだキャラが登録される
// キャラの一覧・名前・説明文は characters.js
// =============================================

const Dex = (() => {
  const $ = (id) => document.getElementById(id);
  const chars = () => window.CHARACTERS;
  const registered = () => Save.data.dex; // ファイル名 → 登録した日時

  function init() {
    UI.onShow("dex", render);
    $("dex-grid").addEventListener("click", (e) => {
      const card = e.target.closest("[data-file]");
      if (card && registered()[card.dataset.file]) openDetail(card.dataset.file);
    });
    $("dex-popup-close").addEventListener("click", () => $("dex-popup").classList.remove("active"));
  }

  // キャラを登録する（main.js から、キャラを1体積めたときに呼ばれる）
  // 初めて登録したときだけ true を返す
  function register(file) {
    if (!file || registered()[file]) return false;
    registered()[file] = new Date().toISOString();
    Save.write();
    const c = chars().find((x) => x.file === file);
    UI.toast(`<img class="toast-img" src="${file}" alt="">図鑑に登録：<b>${UI.escape(c ? c.name : "")}</b>`);
    return true;
  }

  // 登録数（今の characters.js にあるキャラだけを数える）
  function count() {
    return chars().filter((c) => registered()[c.file]).length;
  }

  function total() {
    return chars().length;
  }

  // ---------- 図鑑画面 ----------
  function render() {
    $("dex-count").textContent = `${count()} / ${total()}体`;
    $("dex-grid").innerHTML = chars()
      .map((c, i) => {
        const got = !!registered()[c.file];
        const no = String(i + 1).padStart(2, "0");
        return `
          <button class="dex-card ${got ? "" : "dex-locked"}" data-file="${UI.escape(c.file)}" ${got ? "" : "disabled"}>
            <span class="dex-img"><img src="${UI.escape(c.file)}" alt=""></span>
            <span class="dex-no">No.${no}</span>
            <b class="dex-name">${got ? UI.escape(c.name) : "？？？"}</b>
          </button>`;
      })
      .join("");
  }

  function openDetail(file) {
    const c = chars().find((x) => x.file === file);
    if (!c) return;
    const date = new Date(registered()[file]);
    $("dex-popup-content").innerHTML =
      `<div class="dex-detail-img"><img src="${UI.escape(c.file)}" alt=""></div>` +
      `<h3 class="dex-detail-name">${UI.escape(c.name)}</h3>` +
      `<p class="dex-detail-text">${UI.escape(c.description || "")}</p>` +
      `<p class="dex-detail-date">登録日：${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}</p>`;
    $("dex-popup").classList.add("active");
  }

  return { init, register, count, total };
})();
