// =============================================
// events.js
// 期間限定イベント（内容は data/events.json）
//
// 今はイベントの準備だけ。events.json が空なら、何も表示されず、何も変わらない。
// イベントの期間中だけ、次のものが使えるようになる：
//   ・config.js の rules で  event: "イベントの id"  と書いた特殊ルール（特殊ルールの一覧に「期間限定」で出る）
//   ・characters.js で       event: "イベントの id"  と書いたキャラ（期間中だけ落ちてくる）
// 書き方は README の「期間限定イベント」を参照
// =============================================

const LimitedEvents = (() => {
  let list = []; // 読み込んだイベント（形のおかしいものは除く）

  // events.json を読み込む。読み込めなかったら（オフラインなど）イベントは無しとして扱う
  async function load() {
    const json = await DataFile.load("data/events.json");
    const items = json && Array.isArray(json.events) ? json.events : [];
    list = items.filter((e) => {
      const ok = e && typeof e.id === "string" && e.id && toDate(e.start) && toDate(e.end);
      if (!ok) console.warn("イベントの書き方がおかしいので無視します:", e);
      return ok;
    });
  }

  // "2026-10-25" または "2026-10-25 18:00" を日時にする（端末の時刻で）。おかしければ null
  function toDate(text) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(text || ""));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  // 期間中か。end は「その日の終わりまで」（時刻を書いたときは、その時刻まで）
  function inPeriod(e, now = new Date()) {
    const start = toDate(e.start);
    let end = toDate(e.end);
    if (!/[ T]\d/.test(e.end)) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    return now >= start && now < end;
  }

  // 今開催中のイベントの一覧
  function active() {
    return list.filter((e) => inPeriod(e));
  }

  // id のイベントが開催中か
  function isActive(id) {
    return active().some((e) => e.id === id);
  }

  // event の指定が無いもの（ふつうのルール・キャラ）は、いつでも使える
  function available(item) {
    return !item || !item.event || isActive(item.event);
  }

  return { load, active, isActive, available };
})();
