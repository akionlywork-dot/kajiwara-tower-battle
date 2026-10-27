// =============================================
// かじわらタワーバトル ランキング（Google Apps Script）
//
// Google スプレッドシートの「拡張機能 → Apps Script」に、このファイルの中身を全部貼り付けて
// 「ウェブアプリ」としてデプロイする。手順は README の「ランキング（オンライン）」を参照。
//
// シート「ranking」に、1人1行（その人の一番いいスコア）で記録する：
//   id     … 端末ごとのランダムな番号（ランキングの画面には出ない）
//   name   … 名前
//   score / count / height … スコア・積んだ数・高さ（m）
//   date   … 記録した日
//   hidden … ここに何か書くと（例：x）、その人はランキングに出なくなる（変な名前・不正なスコア用）
//   title  … 称号
//   icon   … 写真アイコン（小さな JPEG を文字にしたもの）。本人が「載せる」を選んだときだけ入る
// =============================================

const SHEET_NAME = "ranking";
const TOP = 100; // ランキングに出す人数
const NAME_MAX = 10; // 名前の最大文字数（ゲームのプロフィールと同じ）
const TITLE_MAX = 20; // 称号の最大文字数
const ICON_MAX = 12000; // 写真アイコンの最大の長さ（文字数。1つのセルに入る量より十分小さく）
const HEADERS = ["id", "name", "score", "count", "height", "date", "hidden", "title", "icon"];
// スコアの計算（config.js の score と同じにする）：積んだ数 × PER_PIECE ＋ 高さ(m) × PER_METER
const PER_PIECE = 100;
const PER_METER = 100;
const MIN_INTERVAL = 5; // 同じ人が続けて送れる間隔（秒）
const TZ = "Asia/Tokyo";

// ---------- ランキングを返す（ゲームのランキング画面が読みに来る） ----------
// ?me=端末の番号 を付けると、その人の順位も返す
function doGet(e) {
  const me = e && e.parameter ? String(e.parameter.me || "") : "";
  const list = ranked_(readRows_());
  const mine = me ? list.find((r) => r.id === me) : null;
  return json_({
    updated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"),
    total: list.length,
    ranking: list.slice(0, TOP).map((r) => {
      const row = { rank: r.rank, name: r.name, title: r.title, score: r.score, count: r.count, height: r.height, date: r.date };
      if (r.icon) row.icon = r.icon;
      if (mine && r.id === me) row.me = true;
      return row;
    }),
    me: mine ? { rank: mine.rank, score: mine.score } : null,
  });
}

// ---------- スコアを受け取る（ゲームが自動で送ってくる） ----------
// 本文（JSON）：{ id, name, title, icon, score, count, height }
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad request" });
  }
  const id = String(d.id || "");
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return json_({ ok: false, error: "bad id" });
  const name = cleanName_(d.name);
  const title = cleanText_(d.title, TITLE_MAX);
  const icon = cleanIcon_(d.icon);
  const count = Number(d.count);
  const height = Math.round(Number(d.height) * 100) / 100;
  const score = Number(d.score);
  // ありえない値は受け付けない（スコアが、積んだ数と高さの計算と合っているかも確かめる）
  const ok =
    Number.isInteger(count) && count >= 0 && count <= 500 &&
    height >= 0 && height <= 200 &&
    Number.isInteger(score) && Math.abs(score - (count * PER_PIECE + Math.floor(Number(d.height) * PER_METER))) <= 1;
  if (!ok) return json_({ ok: false, error: "bad score" });

  // 短い間に何度も送ってくるのを防ぐ
  const cache = CacheService.getScriptCache();
  if (cache.get("t:" + id)) return json_({ ok: false, error: "too fast" });
  cache.put("t:" + id, "1", MIN_INTERVAL);

  // 同時に書きこまないように、順番待ちをする
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    const rows = readRows_();
    const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    const found = rows.find((r) => r.id === id);
    if (!found) {
      sh.appendRow([text_(id), text_(name), score, count, height, text_(today), "", title ? text_(title) : "", icon]);
    } else {
      // 名前・称号・アイコンはいつも新しいものに。スコアは前より高いときだけ書きかえる（hidden はそのまま）
      sh.getRange(found.row, 2).setValue(text_(name));
      sh.getRange(found.row, 8, 1, 2).setValues([[title ? text_(title) : "", icon]]);
      if (score > found.score) sh.getRange(found.row, 3, 1, 4).setValues([[score, count, height, text_(today)]]);
    }
    SpreadsheetApp.flush();
    const list = ranked_(readRows_());
    const mine = list.find((r) => r.id === id);
    return json_({ ok: true, rank: mine ? mine.rank : null, total: list.length });
  } finally {
    lock.release();
  }
}

// ---------- ここから下は、上で使う部品 ----------
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (String(sh.getRange(1, HEADERS.length).getValue()) !== HEADERS[HEADERS.length - 1]) {
    // 前のバージョンで作ったシート：あとから増えた列（title・icon）の見出しを足す
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

// シートの全員分（見出しの行は除く）
function readRows_() {
  const values = sheet_().getDataRange().getValues();
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
  }));
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
