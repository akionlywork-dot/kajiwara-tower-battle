// =============================================
// かじわらタワーバトル ランキング（Google Apps Script）
//
// Google スプレッドシートの「拡張機能 → Apps Script」に、このファイルの中身を全部貼り付けて
// 「ウェブアプリ」としてデプロイする。手順は README の「ランキング（オンライン）」を参照。
//
// ランキングは2つ。どちらも1人1行（その人の一番いいスコア）で記録する：
//   フリー（いつものスコアアタック）… シート「ranking」
//   競技（config.js の competitive）… シート「ranking_comp」（無ければ自動で作る）
//   ゲームが送ってくる mode が "comp" なら競技、それ以外（"free"・古いバージョンで mode が無い）ならフリー。
//   ゲームが読みに来るときも ?mode=comp で競技、無ければフリー。返す JSON に mode を入れる
//   （ゲームは、mode: "comp" が返ってくる＝このファイルが競技に対応している、と分かってから競技のスコアを送る）
// 列（どちらのシートも同じ）：
//   id     … 端末ごとのランダムな番号（ランキングの画面には出ない）
//   name   … 名前
//   score / count / height … スコア・積んだ数・高さ（m）
//   date   … 記録した日
//   hidden … ここに何か書くと（例：x）、その人はランキングに出なくなる（変な名前・不正なスコア用）
//   title  … 称号
//   icon   … 写真アイコン（小さな JPEG を文字にしたもの）。本人が「載せる」を選んだときだけ入る
//   ここから下は、本人が「ランキングでプロフィールを公開」を ON にしたときだけ入る（OFF にすると、次に送られたときに消す）：
//   ach / achTotal       … 実績の達成数 / 全部の数
//   dex / dexTotal       … 図鑑の登録数 / 全部の数
//   bg / platform        … 選んでいる背景・土台の id（config.js の themes にあるものだけ）
//   plays / pieces       … プレイ回数・これまでに積んだ数の合計
//   onlineWins / onlineLosses … オンライン対戦の勝ち・負け
// =============================================

// ランキングの種類ごとのシートの名前と、スコアの計算（config.js の score・competitive と同じにする）：
//   スコア ＝ 積んだ数 × perPiece ＋ 高さ(m) × perMeter
const PER_PIECE = 100;
const PER_METER = 100;
const COMP_PER_PIECE = 100; // config.js の competitive.perPiece
const COMP_PER_METER = 100; // config.js の competitive.perMeter
const MODES = {
  free: { sheet: "ranking", perPiece: PER_PIECE, perMeter: PER_METER },
  comp: { sheet: "ranking_comp", perPiece: COMP_PER_PIECE, perMeter: COMP_PER_METER },
};
const TOP = 100; // ランキングに出す人数
const NAME_MAX = 10; // 名前の最大文字数（ゲームのプロフィールと同じ）
const TITLE_MAX = 20; // 称号の最大文字数
const ICON_MAX = 12000; // 写真アイコンの最大の長さ（文字数。1つのセルに入る量より十分小さく）
const HEADERS = ["id", "name", "score", "count", "height", "date", "hidden", "title", "icon",
  "ach", "achTotal", "dex", "dexTotal", "bg", "platform", "plays", "pieces", "onlineWins", "onlineLosses"];
const PROFILE_COL = 10; // プロフィールの列が始まる場所（ach の列。1から数える）
const PROFILE_KEYS = HEADERS.slice(PROFILE_COL - 1); // ["ach", …, "onlineLosses"]
// 背景・土台の id（config.js の themes の backgrounds・platforms と同じにする。ここに無い id は保存しない）
const BACKGROUNDS = ["sky", "sunset", "sakura", "night", "galaxy", "halloween_night", "wonderland", "aurora"];
const PLATFORMS = ["wood", "stone", "ice", "gold", "diamond", "pumpkin", "steel", "cardboard"];
const MIN_INTERVAL = 5; // 同じ人が続けて送れる間隔（秒）
const TZ = "Asia/Tokyo";

// ---------- ランキングを返す（ゲームのランキング画面が読みに来る） ----------
// ?mode=comp で競技（無ければフリー）。?me=端末の番号 を付けると、その人の順位も返す
function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const mode = modeOf_(p.mode);
  const me = String(p.me || "");
  const list = ranked_(readRows_(mode));
  const mine = me ? list.find((r) => r.id === me) : null;
  return json_({
    mode: mode,
    updated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"),
    total: list.length,
    ranking: list.slice(0, TOP).map((r) => {
      const row = { rank: r.rank, name: r.name, title: r.title, score: r.score, count: r.count, height: r.height, date: r.date };
      if (r.icon) row.icon = r.icon;
      if (r.profile) row.profile = r.profile; // プロフィールを公開している人だけ
      if (mine && r.id === me) row.me = true;
      return row;
    }),
    me: mine ? { rank: mine.rank, score: mine.score } : null,
  });
}

// ---------- スコアを受け取る（ゲームが自動で送ってくる） ----------
// 記録を消す（ゲームの設定画面で「ランキングへの参加の同意を取り消す」を押したとき）：
//   本文（JSON）：{ action: "delete", id }。その端末の番号の行を、フリー・競技の両方のシートから消す
//   返す JSON：{ ok: true, action: "delete", deleted: 消した行の数 }
// 本文（JSON）：{ mode, id, name, title, icon, score, count, height, profile }
//   mode … "comp" なら競技のシート、それ以外（"free"・無い）ならフリーのシートに書く
//   profile … 「ランキングでプロフィールを公開」が ON の人だけ。OFF の人・古いバージョンからは届かない（そのときは消す）
//     { ach: [達成数, 全部], dex: [登録数, 全部], bg, platform, plays, pieces, online: [勝ち, 負け] }
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad request" });
  }
  if (d.action === "delete") return deleteRecords_(String(d.id || ""));
  const mode = modeOf_(d.mode);
  const conf = MODES[mode];
  const id = String(d.id || "");
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return json_({ ok: false, error: "bad id" });
  const name = cleanName_(d.name);
  const title = cleanText_(d.title, TITLE_MAX);
  const icon = cleanIcon_(d.icon);
  const profile = profileCells_(d.profile); // シートに書く値（公開していなければ、全部 ""）
  const count = Number(d.count);
  const height = Math.round(Number(d.height) * 100) / 100;
  const score = Number(d.score);
  // ありえない値は受け付けない（スコアが、積んだ数と高さの計算と合っているかも確かめる）
  const ok =
    Number.isInteger(count) && count >= 0 && count <= 500 &&
    height >= 0 && height <= 200 &&
    Number.isInteger(score) && Math.abs(score - (count * conf.perPiece + Math.floor(Number(d.height) * conf.perMeter))) <= 1;
  if (!ok) return json_({ ok: false, error: "bad score" });

  // 短い間に何度も送ってくるのを防ぐ（フリーと競技は別に数える。ゲームは2つを続けて送るため）
  const cache = CacheService.getScriptCache();
  const key = "t:" + (mode === "free" ? "" : mode + ":") + id;
  if (cache.get(key)) return json_({ ok: false, error: "too fast" });
  cache.put(key, "1", MIN_INTERVAL);

  // 同時に書きこまないように、順番待ちをする
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(mode);
    const rows = readRows_(mode);
    const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    const found = rows.find((r) => r.id === id);
    if (!found) {
      sh.appendRow([text_(id), text_(name), score, count, height, text_(today), "", title ? text_(title) : "", icon].concat(profile));
    } else {
      // 名前・称号・アイコンはいつも新しいものに。スコアは前より高いときだけ書きかえる（hidden はそのまま）
      sh.getRange(found.row, 2).setValue(text_(name));
      sh.getRange(found.row, 8, 1, 2).setValues([[title ? text_(title) : "", icon]]);
      sh.getRange(found.row, PROFILE_COL, 1, PROFILE_KEYS.length).setValues([profile]); // 公開をやめた人は、ここで消える
      if (score > found.score) sh.getRange(found.row, 3, 1, 4).setValues([[score, count, height, text_(today)]]);
    }
    SpreadsheetApp.flush();
    const list = ranked_(readRows_(mode));
    const mine = list.find((r) => r.id === id);
    return json_({ ok: true, mode: mode, rank: mine ? mine.rank : null, total: list.length });
  } finally {
    lock.release();
  }
}

// 端末の番号 id の行を、フリー・競技の両方のシートから消す（下の行から消す。上から消すと、行の番号がずれるため）
function deleteRecords_(id) {
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return json_({ ok: false, error: "bad id" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let deleted = 0;
    for (const mode of Object.keys(MODES)) {
      const sh = sheet_(mode);
      const rows = readRows_(mode).filter((r) => r.id === id).sort((a, b) => b.row - a.row);
      for (const r of rows) {
        sh.deleteRow(r.row);
        deleted++;
      }
    }
    SpreadsheetApp.flush();
    return json_({ ok: true, action: "delete", deleted: deleted });
  } finally {
    lock.release();
  }
}

// ---------- ここから下は、上で使う部品 ----------
// "comp" なら競技、それ以外はフリー
function modeOf_(v) {
  return String(v || "") === "comp" ? "comp" : "free";
}

// その種類のシート（無ければ、見出しの行（hidden の列もふくむ）を付けて作る）
function sheet_(mode) {
  const name = MODES[modeOf_(mode)].sheet;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (String(sh.getRange(1, HEADERS.length).getValue()) !== HEADERS[HEADERS.length - 1]) {
    // 前のバージョンで作ったシート：あとから増えた列（title・icon・プロフィール）の見出しを足す
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

// その種類のシートの全員分（見出しの行は除く）
function readRows_(mode) {
  const values = sheet_(mode).getDataRange().getValues();
  values.shift();
  return values.map((v, i) => ({
    row: i + 2,
    id: String(v[0]),
    name: String(v[1]),
    score: Number(v[2]) || 0,
    count: Number(v[3]) || 0,
    height: Number(v[4]) || 0,
    date: v[5] instanceof Date ? Utilities.formatDate(v[5], TZ, "yyyy-MM-dd") : String(v[5]),
    hidden: String(v[6]).trim() !== "",
    title: String(v[7] || ""),
    icon: String(v[8] || ""),
    profile: readProfile_(v.slice(PROFILE_COL - 1)),
  }));
}

// ---------- プロフィール（公開している人だけ） ----------
// 届いた profile を、シートに書く値の並び（PROFILE_KEYS の順）にする。
// おかしい値は保存しない（その欄は ""）。profile が無ければ全部 ""（＝公開をやめた人のデータを消す）
function profileCells_(p) {
  const empty = PROFILE_KEYS.map(() => "");
  if (!p || typeof p !== "object") return empty;
  const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : "");
  const pair = (a, max) => {
    if (!Array.isArray(a)) return ["", ""];
    const x = int(a[0], max), y = int(a[1], max);
    return x === "" || y === "" || x > y ? ["", ""] : [x, y]; // 達成数が全部の数より多いのはおかしい
  };
  const online = Array.isArray(p.online) ? [int(p.online[0], 1000000), int(p.online[1], 1000000)] : ["", ""];
  const cells = []
    .concat(pair(p.ach, 1000))
    .concat(pair(p.dex, 1000))
    .concat([
      BACKGROUNDS.indexOf(p.bg) >= 0 ? text_(p.bg) : "",
      PLATFORMS.indexOf(p.platform) >= 0 ? text_(p.platform) : "",
      int(p.plays, 10000000),
      int(p.pieces, 100000000),
    ])
    .concat(online[0] === "" || online[1] === "" ? ["", ""] : online);
  return cells;
}

// シートの値から、ゲームに返す profile を作る（1つも無ければ null）
function readProfile_(v) {
  const get = (i) => (v[i] === "" || v[i] === undefined || v[i] === null ? null : v[i]);
  const num = (i) => (get(i) === null || !isFinite(Number(v[i])) ? null : Number(v[i]));
  const p = {};
  if (num(0) !== null && num(1) !== null) p.ach = [num(0), num(1)];
  if (num(2) !== null && num(3) !== null) p.dex = [num(2), num(3)];
  if (get(4) !== null) p.bg = String(v[4]);
  if (get(5) !== null) p.platform = String(v[5]);
  if (num(6) !== null) p.plays = num(6);
  if (num(7) !== null) p.pieces = num(7);
  if (num(8) !== null && num(9) !== null) p.online = [num(8), num(9)];
  return Object.keys(p).length ? p : null;
}

// 隠していない人を、スコアの高い順に並べて順位をつける（同じ点数は同じ順位）
function ranked_(rows) {
  const list = rows.filter((r) => r.id && !r.hidden).sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  list.forEach((r, i) => (r.rank = i > 0 && r.score === list[i - 1].score ? list[i - 1].rank : i + 1));
  return list;
}

// 名前：見えない文字を取りのぞき、前後の空白を消して、最大 NAME_MAX 文字
function cleanName_(v) {
  return cleanText_(v, NAME_MAX) || "プレイヤー";
}

// 文字：見えない文字を取りのぞき、前後の空白を消して、最大 max 文字
function cleanText_(v, max) {
  return Array.from(String(v || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()).slice(0, max).join("");
}

// 写真アイコン：小さな JPEG の画像（data:image/jpeg;base64,...）だけ受け付ける。それ以外は「なし」
function cleanIcon_(v) {
  const s = String(v || "");
  return s.length <= ICON_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) ? s : "";
}

// 文字のままシートに書く（「=」などで始まる名前が、計算式や日付として扱われないように）
function text_(s) {
  return "'" + s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
