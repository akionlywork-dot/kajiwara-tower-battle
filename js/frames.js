// =============================================
// frames.js
// 称号の枠（アイコンのまわりの枠と、称号の札のデザイン）
//
// 枠は、選んでいる称号の実績の rank（data/achievements.json）で決まる。
// 形はどの格も同じ（輪＋てっぺんの小さな星）で、違うのは色だけ：
//   bronze … 銅色 ／ silver … 銀色 ／ gold … 金色・ときどき光が走る
//   legend … 虹色（輪がゆっくり回る） ／ event … オレンジ×紫（期間限定の実績）
//   mythic … まぼろし。虹の輪が回り、まわりが白く光る。星5つ
//   secret … 隠し（隠し実績）。紫×黒。ふちには星の代わりに「？」（decoration: "question"）
//   code   … 合言葉（合言葉でもらう称号だけ。codes.js）。深い緑の輪に、金色がゆっくり回る。札は深い緑に金の文字。ふちには鍵（decoration: "key"）
// 称号を選んでいない・実績が見つからないときは、枠なし。
// 見た目は style.css の「称号の枠」（色は CSS の変数で切りかえる。動く枠は CSS のアニメーションで、「視差効果を減らす」では止まる）。
// リザルトカードの画像の枠は card.js が、ここで決めた rank を見て描く
// =============================================

const Frames = (() => {
  const RANKS = ["bronze", "silver", "gold", "legend", "mythic", "event", "secret", "code"];
  // 枠のてっぺんに並べる星の数（格が上がるほど増える。期間限定・隠しはゴールドと同じ）
  const STARS = { bronze: 1, silver: 2, gold: 3, legend: 4, mythic: 5, event: 3, secret: 3, code: 3 };
  const EVENT_PATTERN = /^[a-z0-9_-]{1,40}$/; // イベントの id として使ってよい形（CSS のクラス名に使うため）

  // アイコンのふちに並べる飾り（称号ごと。achievements.json の decoration。書いていなければ star）。
  // 星以外は images/decorations/ の画像を、星と同じ場所・同じ数に並べる（style.css の .deco-〇〇・card.js）
  // 開発者の称号だけは、星やカボチャではなく、専用のコード風の枠（rank "dev"。下の developer）
  const DECORATIONS = {
    star: null, // 星（枠の色の星）
    pumpkin: "images/decorations/pumpkin.svg", // カボチャ（パンプキング）
    snow: "images/decorations/snowflake.svg", // 雪の結晶（今は使っている称号なし。足すときに）
    question: "images/decorations/question.svg", // 「？」（隠し実績の称号）
    key: "images/decorations/key.svg", // 鍵（合言葉でもらう称号だけの飾り。js/codes.js）
  };
  const decoOf = (d) => (Object.prototype.hasOwnProperty.call(DECORATIONS, d) ? d : "star");

  // 枠 { rank, event, decoration } を正しい形にする（オンライン対戦で相手から届いたものにも使う）。おかしければ null。
  // 開発者の枠（"dev"）はここでは作らない（相手から届いたものを、開発者の枠にしないため）
  function clean(rank, event, decoration) {
    if (!RANKS.includes(rank)) return null;
    return { rank, event: rank === "event" && EVENT_PATTERN.test(String(event || "")) ? event : null, decoration: decoOf(decoration) };
  }

  // 実績（achievements.json の1つ）の枠
  function ofAchievement(a) {
    return a ? clean(a.rank, a.event, a.decoration) : null;
  }

  // ---------- スタッフの称号（開発者・管理者・社員・運営） ----------
  // 実績ではもらえない特別な称号。管理者モードの「スタッフの称号」で、1つずつ獲得・リセットする
  // （獲得したものは Save.data.staffTitles に入り、管理者モードを終えても、その端末で選べる）。
  //   rank：枠の種類（style.css の .frame-dev・.frame-staff、card.js の FRAME_COLORS）、label：枠の下の札の文字
  // ほかの人（オンライン対戦の相手・ランキング）から「開発者」などの文字が届いても、専用の枠にはしない（だれでも名乗れてしまうため）。
  // 手で書く ranking.json だけは、"title": "developer" / "admin" / "employee" / "operator" と書くと、専用の札になる
  const STAFF = {
    developer: { title: "開発者", rank: "dev" }, // コード風（</> と 0・1）
    admin: { title: "管理者", rank: "staff-admin", label: "ADMIN" }, // 黒×金
    employee: { title: "社員", rank: "staff-employee", label: "STAFF" }, // 紺×白（名札ふう）
    operator: { title: "運営", rank: "staff-operator", label: "運営" }, // 赤×白（腕章ふう）
  };
  const isStaff = (id) => Object.prototype.hasOwnProperty.call(STAFF, id || "");
  // この端末で、スタッフの称号 id を獲得しているか
  const staffGranted = (id) => isStaff(id) && typeof Save !== "undefined" && !!(Save.data.staffTitles || {})[id];

  // スタッフの称号 id の枠
  function staff(id) {
    const s = STAFF[id];
    return s ? { rank: s.rank, event: null, decoration: id, label: s.label || "" } : null;
  }

  // 開発者の枠（獲得した端末の称号「開発者」と、手で書く ranking.json の "title": "developer" の人だけ）
  function developer() {
    return staff("developer");
  }

  // 称号（実績の id か、スタッフの称号の id）の枠。称号を選んでいなければ null
  function ofTitleId(id) {
    if (!id) return null;
    if (isStaff(id)) return staffGranted(id) ? staff(id) : null; // スタッフの称号は、獲得した端末だけ
    return ofAchievement(typeof Achievements !== "undefined" ? Achievements.find(id) : null);
  }

  // 称号の文字から、枠を決める（ランキング・オンライン対戦の相手のように、称号の文字しか分からないとき）。見つからなければ null。
  // 「開発者」の文字が届いても、開発者の枠にはしない（だれでも名乗れてしまうため）
  function ofTitleText(text) {
    if (!text) return null;
    return ofAchievement(typeof Achievements !== "undefined" ? Achievements.findByTitle(text) : null);
  }

  // アイコンに付けるクラス名（枠なしなら ""）。stars-〇 はふちの飾りの数、deco-〇〇 は星以外の飾り
  function avatarClass(f) {
    if (!f) return "";
    if (f.rank === "dev") return "frame frame-dev";
    if (String(f.rank).startsWith("staff-")) return `frame frame-staff frame-${f.rank}`; // 管理者・社員・運営（星の代わりに、枠の下に札）
    const deco = f.decoration && f.decoration !== "star" ? ` deco-${f.decoration}` : "";
    return `frame frame-${f.rank} stars-${STARS[f.rank] || 1}${deco}${f.event ? ` frame-ev-${f.event}` : ""}`;
  }

  // 飾りのクラス（称号を選ぶ画面の、まだ取っていない称号の灰色の枠にも、飾りの見本として付ける）
  function decoClass(decoration) {
    const d = decoOf(decoration);
    return d === "star" ? "" : `deco-${d}`;
  }

  // 飾りの画像の場所（星なら null。リザルトカードの画像に使う）
  function decorationImage(decoration) {
    return DECORATIONS[decoOf(decoration)];
  }

  // 星の数のクラス（称号を選ぶ画面の、まだ取っていない称号の灰色の枠にも使う）
  function starsClass(rank) {
    return `stars-${STARS[rank] || 1}`;
  }

  // アイコンの要素に枠を付けなおす
  function applyAvatar(el, f) {
    el.className = el.className.replace(/\b(frame(-[\w-]+)?|stars-\d|deco-[\w-]+)\b/g, "").replace(/\s+/g, " ").trim();
    if (f) el.className += " " + avatarClass(f);
  }

  // 枠の星の数（リザルトカードの画像に使う）
  function starCount(rank) {
    return STARS[rank] || 1;
  }

  // 星の並び（数ごと）：s＝星の大きさ（アイコンの直径に対する割合）、angles＝置く角度（真上が 0 度、右がプラス）。
  // 数が増えるほど小さく・間を詰めて、重ならないようにする。style.css の .stars-〇 の数値も、この表から計算したもの
  const STAR_LAYOUT = {
    1: { s: 0.34, angles: [0] },
    2: { s: 0.3, angles: [-20, 20] },
    3: { s: 0.27, angles: [-34, 0, 34] },
    4: { s: 0.24, angles: [-48, -16, 16, 48] },
    5: { s: 0.21, angles: [-64, -32, 0, 32, 64] },
  };
  function starLayout(n) {
    return STAR_LAYOUT[n] || STAR_LAYOUT[1];
  }

  // 称号の札（HTML）。称号が無ければ ""。枠があれば、枠と同じ色の札（ranked）にする（星は枠の方に付く）
  // 開発者は、コード風の専用の札（</> と、点滅するカーソル）
  function titleHTML(text, f) {
    if (!text) return "";
    if (f && f.rank === "dev") return `<span class="title-badge dev-title"><span class="dev-code">&lt;/&gt;</span>${UI.escape(text)}<span class="dev-caret"></span></span>`;
    if (f && String(f.rank).startsWith("staff-")) return `<span class="title-badge staff-title rank-${f.rank}">${UI.escape(text)}</span>`;
    return `<span class="title-badge${f ? ` ranked rank-${f.rank}${f.event ? ` rank-ev-${f.event}` : ""}` : ""}">${UI.escape(text)}</span>`;
  }

  return { clean, ofAchievement, developer, STAFF, isStaff, staffGranted, staff, ofTitleId, ofTitleText, avatarClass, starsClass, decoClass, decorationImage, starCount, starLayout, applyAvatar, titleHTML };
})();
