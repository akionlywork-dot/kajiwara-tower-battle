// =============================================
// events.js
// 期間限定イベント（内容は data/events.json）
//
// イベントの期間中だけ、次のものが使えるようになる：
//   ・config.js の rules で  event: "イベントの id"  と書いた特殊ルール（特殊ルールの一覧に「期間限定」で出る。
//                            stage: true と書いたものは一覧に出さず、イベントのステージ用に使う）
//   ・characters.js で       event: "イベントの id"  と書いたキャラ（期間中だけ落ちてくる）
//   ・config.js の events に書いたイベントのステージ（ハロウィンの「おばけ屋敷」など。halloween.js）
// 管理者モードの「イベント期間中として表示」が ON のときは、events.json のイベントを全部「期間中」とみなす（確認用）
// 書き方は README の「期間限定イベント」を参照
// =============================================

const LimitedEvents = (() => {
  let list = []; // 読み込んだイベント（形のおかしいものは除く）
  let preview = false; // 管理者モード：イベント期間中として表示する
  let offset = 0; // 管理者モード：テスト日付（実際の時刻からのずれ。ミリ秒。0 なら実際の日付）
  const now = () => new Date(Date.now() + offset); // ゲームの中の「今」
  let onLoad = []; // 読み込みが終わったら呼ぶ関数

  // events.json を読み込む。読み込めなかったら（オフラインなど）イベントは無しとして扱う
  async function load() {
    const json = await DataFile.load("data/events.json");
    const items = json && Array.isArray(json.events) ? json.events : [];
    list = items.filter((e) => {
      const ok = e && typeof e.id === "string" && e.id && toDate(e.start) && toDate(e.end);
      if (!ok) console.warn("イベントの書き方がおかしいので無視します:", e);
      return ok;
    });
    for (const fn of onLoad) fn();
  }

  // 読み込みが終わったときに呼ぶ関数を登録する（ボタンやタイトルの飾りを、期間に合わせて出しなおすため）
  function whenLoaded(fn) {
    onLoad.push(fn);
  }

  // 管理者モード：イベント期間中として表示する（パソコンの日付を変えずに確認するため）
  function setPreview(on) {
    preview = !!on;
    for (const fn of onLoad) fn();
  }

  // 管理者モード：ゲームの中の日付を変える（date は Date。null なら実際の日付に戻す）。時計はそこから進む
  function setTestDate(date) {
    offset = date ? date.getTime() - Date.now() : 0;
    for (const fn of onLoad) fn();
  }

  // "2026-10-25" または "2026-10-25 18:00" を日時にする（端末の時刻で）。おかしければ null
  function toDate(text) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(String(text || ""));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  // 期間中か。end は「その日の終わりまで」（時刻を書いたときは、その時刻まで）
  function inPeriod(e, at = now()) {
    const start = toDate(e.start);
    let end = toDate(e.end);
    if (!/[ T]\d/.test(e.end)) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    return at >= start && at < end;
  }

  // 今開催中のイベントの一覧。
  //   real：管理者モードのテスト日付・確認表示を使わず、実際の日付で決める（オンライン対戦の抽選。相手に影響しないように）
  function active(real) {
    return list.filter((e) => (real ? inPeriod(e, new Date()) : preview || inPeriod(e)));
  }

  // id のイベント（events.json に無ければ null）
  function find(id) {
    return list.find((e) => e.id === id) || null;
  }

  // イベントの名前（無ければ「イベント」）
  function nameOf(id) {
    const e = find(id);
    return (e && e.name) || "イベント";
  }

  // イベントの今の状態："before"（開催前）/ "active"（期間中）/ "ended"（終わった）/ "unknown"（events.json に無い）
  function status(id) {
    const e = find(id);
    if (!e) return "unknown";
    if (preview || inPeriod(e)) return "active";
    return now() < toDate(e.start) ? "before" : "ended";
  }

  // id のイベントが開催中か
  function isActive(id, real) {
    return active(real).some((e) => e.id === id);
  }

  // event の指定が無いもの（ふつうのルール・キャラ）は、いつでも使える
  function available(item, real) {
    return !item || !item.event || isActive(item.event, real);
  }

  return {
    load, whenLoaded, setPreview, setTestDate, active, find, nameOf, status, isActive, available,
    get preview() { return preview; },
    get testDate() { return offset ? now() : null; }, // テスト日付（変えていなければ null）
  };
})();
