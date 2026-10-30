// =============================================
// seasons.js
// ランキングのシーズン
//
// ・シーズンごとに、ランキング（フリー・競技）を分ける
// ・config.js の seasons には、シーズンの番号と名前を用意しておく（先のシーズンも書いておける）
// ・今のシーズンは、サーバー（server/ranking.gs の ?seasoninfo=1）で決まる。管理者モードの「シーズン〇を始める」で
//   サーバーを切り替えると、みんなのゲームも、次に開いたとき（開いているあいだは5分ごと）に切り替わる。
//   ただし、config.js に無いシーズンにはならない（このゲームが古いバージョンのときは「更新する」ボタン）
// ・分かったサーバーのシーズンは、この端末に覚えておく（localStorage の stack.season。通信できないときも、前のまま）
// ・保存データ（save.js）：stats.best / compBest は「今のシーズンのベスト」、allBest / allCompBest は「全期間のベスト」、
//   stats.season はそのベストのシーズン、seasonBests は終わったシーズンのベスト。シーズンが変わると save.js が入れかえる
// ・管理者モードの「この端末だけ、次のシーズンにする（テスト）」のあいだは、その次のシーズン（テスト用）を今のシーズンにする
// =============================================

const Seasons = (() => {
  const KNOWN_KEY = "stack.season"; // サーバーで分かった { current, starts }（save.js も読む）
  const SYNC_EVERY = 5 * 60 * 1000;
  const all = () => (window.GAME_CONFIG.seasons || []).filter((s) => s && Number.isInteger(Number(s.id)));
  let listeners = [];

  function known() {
    try {
      const v = JSON.parse(localStorage.getItem(KNOWN_KEY) || "null");
      if (v && typeof v === "object") return { current: Number(v.current) || 1, starts: v.starts && typeof v.starts === "object" ? v.starts : {} };
    } catch (e) {}
    return { current: 1, starts: {} };
  }

  // 今のシーズンの番号（save.js と同じ決め方）
  const currentId = () => Save.currentSeason();

  // シーズン id の情報 { id, name, start }（config.js に無ければ、仮の名前。テスト用の次のシーズンも）。
  // 始まった日は、config.js の start か、サーバーが残した日時
  function get(id) {
    const s = all().find((x) => Number(x.id) === Number(id));
    const start = (s && s.start) || known().starts[id] || "";
    if (s) return { id: Number(s.id), name: String(s.name || `シーズン${s.id}`), start: String(start) };
    return { id: Number(id), name: `シーズン${id}（テスト）`, start: "" };
  }

  function current() {
    return get(currentId());
  }

  // 見られるシーズン（新しい順）。今のシーズンから、シーズン1 まで
  function list() {
    const out = [];
    for (let id = currentId(); id >= 1; id--) out.push(get(id));
    return out;
  }

  // config.js に用意してある、一番先のシーズン
  function lastPrepared() {
    const ids = all().map((s) => Number(s.id));
    return ids.length ? Math.max(...ids) : 1;
  }

  // 「10/30 から」（開始日が分からなければ ""）
  function since(s) {
    const d = s.start ? new Date(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s.start) ? s.start + "T00:00:00" : s.start) : null;
    return d && !isNaN(d) ? `${d.getMonth() + 1}/${d.getDate()} から` : "";
  }

  // 短い名前（ランキングの切りかえ・ラベル用）：「S2」
  const short = (id) => `S${id}`;

  // サーバーの今のシーズンを読んで、覚えなおす。シーズンが変わったら、保存データを入れかえて、知らせる（onChange）。
  // サーバーの方が、このゲームに用意してあるシーズンより先なら、「更新する」ボタンを出す
  async function sync() {
    const url = ((window.GAME_CONFIG.ranking || {}).url || "").trim();
    if (!url) return;
    let json = null;
    try {
      const res = await fetch(`${url}?seasoninfo=1&t=${Date.now()}`, { cache: "no-store" });
      json = await res.json();
    } catch (e) {
      return; // 通信できないときは、前に分かったシーズンのまま
    }
    if (!json || json.action !== "seasoninfo") return; // 古い ranking.gs（シーズンに対応していない）
    const next = { current: Number(json.current) || 1, starts: json.starts && typeof json.starts === "object" ? json.starts : {} };
    try {
      localStorage.setItem(KNOWN_KEY, JSON.stringify(next));
    } catch (e) {}
    if (next.current > lastPrepared() && typeof Updates !== "undefined") Updates.refresh();
    if (Save.checkSeason()) listeners.forEach((fn) => fn());
  }

  // シーズンが変わったときに呼ぶ（main.js：お知らせ・タイトルのハイスコア）
  function onChange(fn) {
    listeners.push(fn);
  }

  // 開いているあいだ、5分ごと・画面にもどったときに、サーバーのシーズンを読みなおす（起動したときは main.js が読む）
  function init() {
    setInterval(() => !document.hidden && sync(), SYNC_EVERY);
    document.addEventListener("visibilitychange", () => !document.hidden && sync());
  }

  return { init, sync, onChange, currentId, current, get, list, since, short, lastPrepared, known };
})();
