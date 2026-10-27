// =============================================
// frames.js
// 称号の枠（アイコンのまわりの枠と、称号の札のデザイン）
//
// 枠は、選んでいる称号の実績の rank（data/achievements.json）で決まる：
//   bronze … 銅色の細い枠 ／ silver … 銀色・角に小さな飾り ／ gold … 金色・ときどき光が走る
//   legend … 虹色がゆっくり変わる ／ event … イベントごとの専用デザイン（実績の "event" で決まる。
//            halloween2026 はかぼちゃとこうもり）
// 称号を選んでいない・実績が見つからないときは、枠なし。
// 見た目は style.css の「称号の枠」（動く枠は CSS のアニメーション。「視差効果を減らす」では止まる）。
// リザルトカードの画像の枠は card.js が、ここで決めた rank を見て描く
// =============================================

const Frames = (() => {
  const RANKS = ["bronze", "silver", "gold", "legend", "event"];
  const EVENT_PATTERN = /^[a-z0-9_-]{1,40}$/; // イベントの id として使ってよい形（CSS のクラス名に使うため）

  // 枠 { rank, event } を正しい形にする（オンライン対戦で相手から届いたものにも使う）。おかしければ null
  function clean(rank, event) {
    if (!RANKS.includes(rank)) return null;
    return { rank, event: rank === "event" && EVENT_PATTERN.test(String(event || "")) ? event : null };
  }

  // 称号（実績の id）の枠。称号を選んでいなければ null
  function ofTitleId(id) {
    if (!id) return null;
    if (id === "developer") return clean("legend"); // 管理者モードの称号「開発者」
    const a = typeof Achievements !== "undefined" ? Achievements.find(id) : null;
    return a ? clean(a.rank, a.event) : null;
  }

  // 称号の文字から、枠を決める（ランキングのように、称号の文字しか分からないとき）。見つからなければ null
  function ofTitleText(text) {
    if (!text) return null;
    if (text === "開発者") return clean("legend");
    const a = typeof Achievements !== "undefined" ? Achievements.findByTitle(text) : null;
    return a ? clean(a.rank, a.event) : null;
  }

  // アイコンに付けるクラス名（枠なしなら ""）
  function avatarClass(f) {
    return f ? `frame frame-${f.rank}${f.event ? ` frame-ev-${f.event}` : ""}` : "";
  }

  // アイコンの要素に枠を付けなおす
  function applyAvatar(el, f) {
    el.className = el.className.replace(/\bframe(-[\w-]+)?\b/g, "").replace(/\s+/g, " ").trim();
    if (f) el.className += " " + avatarClass(f);
  }

  // 称号の札（HTML）。称号が無ければ ""
  function titleHTML(text, f) {
    if (!text) return "";
    return `<span class="title-badge${f ? ` rank-${f.rank}${f.event ? ` rank-ev-${f.event}` : ""}` : ""}">${UI.escape(text)}</span>`;
  }

  return { clean, ofTitleId, ofTitleText, avatarClass, applyAvatar, titleHTML };
})();
