// =============================================
// news.js
// お知らせ（内容は data/news.json）
//
// 未読の判定：最後に読んだお知らせの id を保存しておき、それより大きい id があれば未読
// =============================================

const News = (() => {
  const $ = (id) => document.getElementById(id);
  const TYPE_LABELS = { update: "アップデート", event: "イベント" };

  let items = null; // 読み込んだお知らせ（新しい順）。読み込めなかったら null
  let loaded = false;
  let newSince = 0; // 一覧を開いたときに「NEW」を付ける基準（その時点での既読 id）

  function init() {
    UI.onShow("news", renderList);
    $("news-popup-close").addEventListener("click", closePopup);
    $("news-popup-list").addEventListener("click", () => {
      closePopup();
      UI.show("news");
    });
    // 一覧のお知らせをタップしたら詳細へ
    $("news-list").addEventListener("click", (e) => {
      const row = e.target.closest("[data-news-id]");
      if (row) openDetail(Number(row.dataset.newsId));
    });
  }

  // news.json を読み込む
  async function load() {
    const json = await DataFile.load("data/news.json");
    loaded = true;
    if (json && Array.isArray(json.news)) {
      // 新しい順（日付が新しい順、同じ日なら id が大きい順）に並べる
      items = json.news.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
    } else {
      items = null;
    }
    updateBadge();
  }

  function lastReadId() {
    return Save.data.news.lastReadId || 0;
  }

  function unreadItems() {
    return (items || []).filter((n) => n.id > lastReadId());
  }

  // 全部読んだことにする（一番大きい id を保存）
  function markAllRead() {
    if (!items || !items.length) return;
    Save.data.news.lastReadId = Math.max(lastReadId(), ...items.map((n) => n.id));
    Save.write();
    updateBadge();
  }

  // 未読があれば、メニューのアイコンに赤い点
  function updateBadge() {
    $("news-badge").classList.toggle("hidden", unreadItems().length === 0);
  }

  // ---------- 一覧 ----------
  function renderList() {
    const box = $("news-list");
    if (!loaded) {
      box.innerHTML = `<p class="empty-message">読み込み中…</p>`;
      load().then(renderList);
      return;
    }
    if (!items) {
      box.innerHTML = `<p class="empty-message">お知らせを取得できません。<br>通信できる場所で、もう一度開いてください。</p>`;
      load(); // 次に開いたときのために、もう一度読みにいく
      return;
    }
    if (!items.length) {
      box.innerHTML = `<p class="empty-message">お知らせはありません。</p>`;
      return;
    }
    newSince = lastReadId();
    box.innerHTML = items
      .map(
        (n) => `
        <button class="list-row news-row" data-news-id="${Number(n.id)}">
          <span class="news-meta">${typeTag(n.type)}<span class="news-date">${UI.escape(n.date)}</span>${n.id > newSince ? `<span class="new-tag">NEW</span>` : ""}</span>
          <b class="news-title">${UI.escape(n.title)}</b>
        </button>`
      )
      .join("");
    markAllRead(); // 一覧を開いたら、全部読んだことにする
  }

  function typeTag(type) {
    return `<span class="type-tag type-${type === "event" ? "event" : "update"}">${TYPE_LABELS[type] || "お知らせ"}</span>`;
  }

  // ---------- 詳細 ----------
  function detailHTML(n) {
    return (
      `<div class="news-meta">${typeTag(n.type)}<span class="news-date">${UI.escape(n.date)}</span></div>` +
      `<h3 class="news-detail-title">${UI.escape(n.title)}</h3>` +
      `<p class="news-body">${UI.escape(n.body)}</p>`
    );
  }

  function openDetail(id) {
    const n = (items || []).find((x) => x.id === id);
    if (!n) return;
    $("news-detail").innerHTML = `<article class="panel">${detailHTML(n)}</article>`;
    UI.show("news-detail");
  }

  // ---------- 起動時のポップアップ ----------
  // 未読があれば、一番新しい未読のお知らせを出す
  async function popupIfUnread() {
    if (!loaded) await load();
    const unread = unreadItems();
    if (!unread.length) return;
    const more = unread.length > 1 ? `<p class="news-more">ほかに ${unread.length - 1} 件の新しいお知らせがあります</p>` : "";
    $("news-popup-content").innerHTML = detailHTML(unread[0]) + more;
    $("news-popup").classList.add("active");
  }

  function closePopup() {
    $("news-popup").classList.remove("active");
    markAllRead();
  }

  return { init, load, popupIfUnread };
})();
