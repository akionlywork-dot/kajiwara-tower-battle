// =============================================
// かじわらタワーバトル ランキング（Google Apps Script）
//
// Google スプレッドシートの「拡張機能 → Apps Script」に、このファイルの中身を全部貼り付けて
// 「ウェブアプリ」としてデプロイする。手順は README の「ランキング（オンライン）」を参照。
//
// ランキングは2つ。どちらも1人1行（その人の一番いいスコア）で記録する：
//   フリー（いつものスコアアタック）… シート「ranking」
//   競技（config.js の competitive）… シート「ranking_comp」（無ければ自動で作る）
//
// シーズン制（config.js の seasons と同じ番号）：
//   シーズン1 は、上のシート「ranking」「ranking_comp」（今までの記録がそのまま、シーズン1 になる）。
//   シーズン2 からは、シートの名前の後ろに番号を付ける：「ranking_s2」「ranking_comp_s2」…（最初に書きこむときに自動で作る）
//   今のシーズンの番号は、このスクリプトのプロパティ「season」（無ければ 1）。コードを書きかえなくても変えられる
//   （ゲームの管理者モードの「シーズン〇を始める」で書きかえる。手で変えるときは、
//    Apps Script の「プロジェクトの設定」→「スクリプト プロパティ」の season）
//   ・スコアを受け取るのは、今のシーズンのものだけ。ゲームが送る season がちがうときは
//     { ok: false, error: "season", season: 今のシーズン } を返す（season を送らない古いバージョンのゲームは、シーズン1 として扱う）
//   ・読むときは ?season=番号（無ければ今のシーズン）。今より先のシーズンなら、空のランキングと upcoming: true
//   ・シーズンが終わったときの1〜3位：?awards=1&me=端末の番号 で、前のシーズンまでの1〜3位を返す（ゲームが称号を出す）。
//     同じ返事の ranks に、ランキングの称号（下の「ランキングの称号」）を持てる順位を入れる
//   ・歴代（全シーズンを通した記録）：?season=all。1人1行（全シーズンでいちばん良いスコア）。行の season に、そのスコアを出したシーズン。
//     歴代のシートは持たず、読むたびに全シーズンのシートから計算する（書きこみが増えない・hidden や記録の削除がそのまま効くため）
//
// ランキングの称号（ゲームの js/rank-titles.js と同じ決まり。称号の文字は、ゲームがここと同じ形で作る）：
//   シーズンの称号：「シーズン2 フリー 1位」… 終わったシーズン（今のシーズンより前）の1〜3位。ずっと持てる
//   歴代の称号  ：「歴代 競技 2位」… 今の歴代の1〜3位（RANK_TITLE_ALL_PLACES）。順位が下がったら外れる
//   この称号は、本当にその順位の人しか名乗れない：スコアを受け取るときに確かめて、ちがえば称号を空にして保存する。
//   歴代の称号は、あとで順位が下がることがあるので、ランキングを返すときにも確かめなおす（ちがえば、称号を出さない）。
//   確かめた称号の行には rankTitle: { kind: "season" | "all", season, mode, place } を付けて返す（ゲームは、これがある行だけ専用の見た目にする）
//   ・今のシーズン：?seasoninfo=1 で { action: "seasoninfo", current, starts: { シーズンの番号: 始まった日時 } }。
//     ゲームは、これで今のシーズンを決める（管理者モードで切り替えると、みんなのゲームも次に開いたときに切り替わる）。
//     始まった日時は、切り替えたときに、スクリプトのプロパティ「seasonStarts」に残す
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
//   staff  … スタッフの称号の id（developer・admin・employee・operator のどれか。ゲームの管理者モードで獲得し、つけている人だけ）。
//            ここに値がある人は、ランキングで専用の枠と札になる。消すと、ふつうの称号の表示に戻る（次に送られたときに、また入る）
//   achList … 持っている実績（称号）の id の一覧（カンマ区切り）。「プロフィールを公開」が ON の人だけ。
//            ランキングには出さず、?stats=titles の「みんなの称号の取得率」を数えるのにだけ使う
//   nameColor … 名前の色の id（NAME_COLORS にあるものだけ。いつもの色なら空）
//   fav     … お気に入りのキャラの ID（「プロフィールを公開」が ON の人だけ）
//
// アップデート予告（ゲームの管理者モードで設定し、タイトル画面に「〇月〇日 〇時にアップデートします」と出す）：
//   シートではなく、このスクリプトのプロパティ（notice）に1つだけ保存する。?notice=1 で読む
//   書きこめるのは、管理者モードの鍵を持っている人だけ（ADMIN_PASS_HASH で確かめる）
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
  "ach", "achTotal", "dex", "dexTotal", "bg", "platform", "plays", "pieces", "onlineWins", "onlineLosses", "staff", "achList", "nameColor", "fav"];
const PROFILE_COL = 10; // プロフィールの列が始まる場所（ach の列。1から数える）
const STAFF_COL = HEADERS.indexOf("staff") + 1; // スタッフの称号の列（1から数える）
const ACH_LIST_COL = HEADERS.indexOf("achList") + 1; // 持っている実績の id の一覧の列
const NAME_COLOR_COL = HEADERS.indexOf("nameColor") + 1; // 名前の色・お気に入りのキャラの列（この2つは並んでいる）
// 名前の色の id（config.js の nameColors のうち、色があるものと同じにする。ここに無い id は保存しない）
const NAME_COLORS = ["sky", "pink", "orange", "green", "purple", "gold", "rainbow"];
const ACH_LIST_MAX = 300; // 実績の id の数の上限（おかしな量のデータを保存しないように）
const STATS_CACHE = 300; // 「みんなの称号の取得率」を覚えておく秒数（毎回シートを全部読まないように）
const PROFILE_KEYS = HEADERS.slice(PROFILE_COL - 1, STAFF_COL - 1); // ["ach", …, "onlineLosses"]
// スタッフの称号の id と称号の文字（ゲームの js/frames.js の STAFF と同じにする。ここに無い id は保存しない）
const STAFF_TITLES = { developer: "開発者", admin: "管理者", employee: "社員", operator: "運営" };
// 背景・土台の id（config.js の themes の backgrounds・platforms と同じにする。ここに無い id は保存しない）
const BACKGROUNDS = ["sky", "sunset", "sakura", "night", "galaxy", "halloween_night", "wonderland", "aurora", "desert", "rainbow", "golden_night", "dawn"];
const PLATFORMS = ["wood", "stone", "ice", "gold", "diamond", "pumpkin", "steel", "cardboard", "ship", "wa", "block", "yoga"];
const MIN_INTERVAL = 5; // 同じ人が続けて送れる間隔（秒）
// 管理者モードの確認用の番号（config.js の admin.passHash と同じにする）。アップデート予告を書きこめるのは、
// この番号に合う鍵（管理者モードを開いた端末に保存されている）を送ってきたときだけ。"" なら、だれも書きこめない
const ADMIN_PASS_HASH = "3c9aa8962b53664710053311a8ec7aaed3bfc7c3e3c5b14cb49665d3dbfae97e";
const NOTICE_MESSAGE_MAX = 80; // アップデート予告のひとことの最大文字数
const AWARD_PLACES = 3; // シーズンが終わったときに、称号がもらえる順位（1〜3位）
// シーズンの順位でもらう称号の文字（data/achievements.json の、condition が seasonRank の実績と同じにする）。
// この称号は、本当にその順位だった人しか名乗れない（ちがう人から届いたら、称号を空にして保存する）
const AWARD_TITLES = {
  "シーズン王者": { mode: "free", place: 1 },
  "シーズン準王者": { mode: "free", place: 2 },
  "シーズン3位": { mode: "free", place: 3 },
  "競技シーズン王者": { mode: "comp", place: 1 },
  "競技シーズン準王者": { mode: "comp", place: 2 },
  "競技シーズン3位": { mode: "comp", place: 3 },
};
const TZ = "Asia/Tokyo";
const RANK_TITLE_ALL_PLACES = 3; // 歴代の称号がもらえる順位（1〜3位。1位と2〜3位で見た目が変わる）
const MODE_LABELS = { free: "フリー", comp: "競技" }; // ランキングの称号の文字に入れる、ランキングの種類の名前

// ---------- ランキングを返す（ゲームのランキング画面が読みに来る） ----------
// ?mode=comp で競技（無ければフリー）。?me=端末の番号 を付けると、その人の順位も返す
// ?stats=titles で、みんなの称号の取得率（titleStats_）を返す
// ?notice=1 で、アップデート予告を返す：{ action: "notice", notice: { at, version, message, updated } か null }
function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  if (p.stats === "titles") return json_(titleStats_());
  if (p.notice) return json_({ action: "notice", notice: readNotice_() });
  const current = currentSeason_();
  if (p.awards) return json_({ action: "awards", current: current, awards: awardsOf_(String(p.me || "")), ranks: rankTitlesOf_(String(p.me || ""), current) });
  if (p.seasoninfo) return json_({ action: "seasoninfo", current: current, starts: seasonStarts_() });
  const mode = modeOf_(p.mode);
  if (p.season === "all") return json_(Object.assign(rankingResponse_(allTimeList_(mode, current), mode, "all", current, String(p.me || "")), { all: true }));
  const season = p.season ? seasonOf_(p.season) : current;
  if (!season) return json_({ ok: false, error: "bad season" });
  // まだ始まっていないシーズン（ゲームは新しいのに、サーバーの切り替えがまだ）：空のランキング
  if (season > current) return json_({ mode: mode, season: season, current: current, upcoming: true, total: 0, ranking: [], me: null });
  return json_(rankingResponse_(ranked_(readRows_(mode, season)), mode, season, current, String(p.me || "")));
}

// ランキングの返事（list：ranked_ で並べた全員。season：シーズンの番号か、歴代なら "all"。me：端末の番号）
function rankingResponse_(list, mode, season, current, me) {
  const mine = me ? list.find((r) => r.id === me) : null;
  const check = rankTitleChecker_();
  return {
    mode: mode,
    season: season,
    current: current,
    updated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm"),
    total: list.length,
    ranking: list.slice(0, TOP).map((r) => {
      // ランキングの称号は、今もその順位のときだけ出す（歴代の順位が下がった人は、称号なし）
      const rankTitle = parseRankTitle_(r.title);
      const ok = !!rankTitle && check(r.id, rankTitle);
      const row = { rank: r.rank, name: r.name, title: rankTitle && !ok ? "" : r.title, score: r.score, count: r.count, height: r.height, date: r.date };
      if (ok) row.rankTitle = rankTitle;
      if (season === "all") row.season = r.season; // 歴代：そのスコアを出したシーズン
      if (r.icon) row.icon = r.icon;
      if (r.profile) row.profile = r.profile; // プロフィールを公開している人だけ
      if (r.staff) row.staff = r.staff; // スタッフの称号の人だけ
      if (r.nameColor) row.nameColor = r.nameColor; // 名前の色
      if (r.profile && r.fav) row.profile.fav = r.fav; // お気に入りのキャラ（プロフィールを公開している人だけ）
      if (mine && r.id === me) row.me = true;
      return row;
    }),
    me: mine ? { rank: mine.rank, score: mine.score, season: season === "all" ? mine.season : season } : null,
  };
}

// 歴代のランキング：全シーズン（シーズン1 から今のシーズンまで）のシートをまとめて、1人1行にして並べる。
//   スコア・積んだ数・高さ・日付・season は、その人のいちばん良い記録（同じ点数なら、先に出した方）。
//   名前・称号・アイコン・プロフィールは、いちばん新しいシーズンの行のもの。hidden の行は使わない
function allTimeList_(mode, current) {
  const by = {}; // 端末の番号 → まとめた行
  for (let season = 1; season <= (current || currentSeason_()); season++) {
    for (const r of readRows_(mode, season)) {
      if (!r.id || r.hidden) continue;
      r.season = season;
      const b = by[r.id];
      if (!b) {
        by[r.id] = r;
        continue;
      }
      const best = r.score > b.score ? r : b; // シーズンは古い順に読むので、同じ点数なら前のもの（b）
      by[r.id] = Object.assign({}, r, { score: best.score, count: best.count, height: best.height, date: best.date, season: best.season });
    }
  }
  return ranked_(Object.keys(by).map((id) => by[id]));
}

// ---------- スコアを受け取る（ゲームが自動で送ってくる） ----------
// 記録を消す（ゲームの設定画面で「ランキングへの参加の同意を取り消す」を押したとき）：
//   本文（JSON）：{ action: "delete", id }。その端末の番号の行を、フリー・競技の両方のシートから消す
//   返す JSON：{ ok: true, action: "delete", deleted: 消した行の数 }
// 本文（JSON）：{ mode, id, name, title, staff, icon, score, count, height, profile }
//   staff … スタッフの称号の id（つけている人だけ。STAFF_TITLES にある id だけ保存し、称号の文字もそれにそろえる）
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
  if (d.action === "notice") return writeNotice_(d);
  if (d.action === "season") return writeSeason_(d);
  // シーズン：今のシーズンのスコアだけ受け付ける（season を送らない古いバージョンは、シーズン1）
  const current = currentSeason_();
  const sentSeason = d.season === undefined || d.season === null ? 1 : seasonOf_(d.season);
  if (sentSeason !== current) return json_({ ok: false, error: "season", season: current });
  const mode = modeOf_(d.mode);
  const conf = MODES[mode];
  const id = String(d.id || "");
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return json_({ ok: false, error: "bad id" });
  const name = cleanName_(d.name);
  // スタッフの称号：決まった id だけ。そのときは称号の文字も、その称号にそろえる
  const staff = Object.prototype.hasOwnProperty.call(STAFF_TITLES, String(d.staff || "")) ? String(d.staff) : "";
  let title = staff ? STAFF_TITLES[staff] : cleanText_(d.title, TITLE_MAX);
  // ランキングの称号（「シーズン2 フリー 1位」「歴代 競技 2位」）は、本当にその順位の人だけ（ちがえば、称号なしで保存する）
  const rankTitle = parseRankTitle_(title);
  if (rankTitle && !rankTitleChecker_()(id, rankTitle)) title = "";
  // 前のバージョンのゲームの、シーズンの順位の称号（「シーズン王者」など）も同じ
  if (Object.prototype.hasOwnProperty.call(AWARD_TITLES, title)) {
    const need = AWARD_TITLES[title];
    if (!awardsOf_(id).some((a) => a.mode === need.mode && a.place === need.place)) title = "";
  }
  const icon = cleanIcon_(d.icon);
  const profile = profileCells_(d.profile); // シートに書く値（公開していなければ、全部 ""）
  const achList = achListCell_(d.profile); // 持っている実績の id の一覧（公開していなければ ""）
  const nameColor = NAME_COLORS.indexOf(String(d.nameColor || "")) >= 0 ? String(d.nameColor) : "";
  const fav = d.profile && /^[a-z0-9_]{1,40}$/.test(String(d.profile.fav || "")) ? String(d.profile.fav) : ""; // 公開している人だけ
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
    const sh = sheet_(mode, current);
    const rows = readRows_(mode, current);
    const today = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
    const found = rows.find((r) => r.id === id);
    if (!found) {
      sh.appendRow([text_(id), text_(name), score, count, height, text_(today), "", title ? text_(title) : "", icon].concat(profile, [staff, achList, nameColor, fav]));
    } else {
      // 名前・称号・アイコンはいつも新しいものに。スコアは前より高いときだけ書きかえる（hidden はそのまま）
      sh.getRange(found.row, 2).setValue(text_(name));
      sh.getRange(found.row, 8, 1, 2).setValues([[title ? text_(title) : "", icon]]);
      sh.getRange(found.row, PROFILE_COL, 1, PROFILE_KEYS.length).setValues([profile]); // 公開をやめた人は、ここで消える
      sh.getRange(found.row, STAFF_COL, 1, 2).setValues([[staff, achList]]); // スタッフの称号をはずした人・公開をやめた人は、ここで消える
      sh.getRange(found.row, NAME_COLOR_COL, 1, 2).setValues([[nameColor, fav]]);
      if (score > found.score) sh.getRange(found.row, 3, 1, 4).setValues([[score, count, height, text_(today)]]);
    }
    SpreadsheetApp.flush();
    const list = ranked_(readRows_(mode, current));
    const mine = list.find((r) => r.id === id);
    return json_({ ok: true, mode: mode, season: current, rank: mine ? mine.rank : null, total: list.length });
  } finally {
    lock.releaseLock(); // 順番待ちを終わる（Apps Script の LockService の書き方）
  }
}

// 端末の番号 id の行を、フリー・競技の両方のシートから消す（下の行から消す。上から消すと、行の番号がずれるため）
function deleteRecords_(id) {
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return json_({ ok: false, error: "bad id" });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let deleted = 0;
    for (let season = 1; season <= currentSeason_(); season++) {
      for (const mode of Object.keys(MODES)) {
        const sh = existingSheet_(mode, season);
        if (!sh) continue;
        const rows = readRows_(mode, season).filter((r) => r.id === id).sort((a, b) => b.row - a.row);
        for (const r of rows) {
          sh.deleteRow(r.row);
          deleted++;
        }
      }
    }
    SpreadsheetApp.flush();
    return json_({ ok: true, action: "delete", deleted: deleted });
  } finally {
    lock.releaseLock(); // 順番待ちを終わる（Apps Script の LockService の書き方）
  }
}

// ---------- シーズン ----------
// 今のシーズンの番号（スクリプトのプロパティ「season」。無い・おかしいときは 1）
function currentSeason_() {
  return seasonOf_(PropertiesService.getScriptProperties().getProperty("season")) || 1;
}

// シーズンの番号として正しければ、その数（1以上の整数）。ちがえば 0
function seasonOf_(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 0;
}

// 今のシーズンを書きかえる（ゲームの管理者モードから。鍵の確かめ方は、アップデート予告と同じ）
//   本文（JSON）：{ action: "season", key: 管理者モードの鍵, season: 新しいシーズンの番号 }
//   返す JSON：{ ok: true, action: "season", season, previous } / 鍵がちがうとき { ok: false, error: "forbidden" }
function writeSeason_(d) {
  if (!ADMIN_PASS_HASH || sha256Hex_("verify:" + String(d.key || "")) !== ADMIN_PASS_HASH) return json_({ ok: false, error: "forbidden" });
  const season = seasonOf_(d.season);
  if (!season) return json_({ ok: false, error: "bad season" });
  const previous = currentSeason_();
  const props = PropertiesService.getScriptProperties();
  props.setProperty("season", String(season));
  // 始まった日時を残す（同じシーズンにもう一度切り替えたときは、最初の日時のまま）
  const starts = seasonStarts_();
  if (!starts[season]) starts[season] = new Date().toISOString();
  props.setProperty("seasonStarts", JSON.stringify(starts));
  CacheService.getScriptCache().remove("stats:titles");
  return json_({ ok: true, action: "season", season: season, previous: previous });
}

// シーズンが始まった日時 { シーズンの番号: ISO の文字 }（管理者モードで切り替えたときに残したもの）
function seasonStarts_() {
  try {
    const v = JSON.parse(PropertiesService.getScriptProperties().getProperty("seasonStarts") || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (err) {
    return {};
  }
}

// その端末が、終わったシーズン（今のシーズンより前）で取った1〜3位：[{ season, mode, place }]
// （hidden の人は数えない。同じ点数は同じ順位）
function awardsOf_(id) {
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return [];
  const out = [];
  const current = currentSeason_();
  for (let season = 1; season < current; season++) {
    for (const mode of Object.keys(MODES)) {
      const mine = ranked_(readRows_(mode, season)).find((r) => r.id === id);
      if (mine && mine.rank <= AWARD_PLACES) out.push({ season: season, mode: mode, place: mine.rank });
    }
  }
  return out;
}

// ---------- ランキングの称号 ----------
// その端末が持てるランキングの称号：
//   [{ kind: "season", season, mode, place }（終わったシーズンの1〜3位）, { kind: "all", mode, place }（今の歴代の1〜3位）]
function rankTitlesOf_(id, current) {
  if (!/^[0-9a-zA-Z-]{16,64}$/.test(id)) return [];
  const out = awardsOf_(id).map((a) => ({ kind: "season", season: a.season, mode: a.mode, place: a.place }));
  for (const mode of Object.keys(MODES)) {
    const mine = allTimeList_(mode, current).find((r) => r.id === id);
    if (mine && mine.rank <= RANK_TITLE_ALL_PLACES) out.push({ kind: "all", mode: mode, place: mine.rank });
  }
  return out;
}

// 称号の文字が、ランキングの称号なら { kind, season, mode, place }。ちがえば null
//   「シーズン2 フリー 1位」→ { kind: "season", season: 2, mode: "free", place: 1 }
//   「歴代 競技 3位」     → { kind: "all", mode: "comp", place: 3 }
function parseRankTitle_(title) {
  const t = String(title || "");
  const modeOf = (label) => Object.keys(MODE_LABELS).find((m) => MODE_LABELS[m] === label);
  let m = /^シーズン(\d{1,3}) (\S+) ([1-9]\d*)位$/.exec(t);
  if (m && modeOf(m[2]) && seasonOf_(m[1])) return { kind: "season", season: Number(m[1]), mode: modeOf(m[2]), place: Number(m[3]) };
  m = /^歴代 (\S+) ([1-9]\d*)位$/.exec(t);
  if (m && modeOf(m[1])) return { kind: "all", mode: modeOf(m[1]), place: Number(m[2]) };
  return null;
}

// ランキングの称号を確かめる関数 (端末の番号, parseRankTitle_ の結果) → 本当にその順位なら true。
// 1つの返事の中で何人も確かめるので、読んだシートの順位を覚えておく（使うシーズン・種類のシートだけ読む）
function rankTitleChecker_() {
  const current = currentSeason_();
  const memo = {};
  const ranksOf = (key, make) => {
    if (!memo[key]) {
      memo[key] = {};
      for (const r of make()) memo[key][r.id] = r.rank;
    }
    return memo[key];
  };
  return (id, t) => {
    if (!id || !t || !MODES[t.mode]) return false;
    if (t.kind === "season") {
      if (t.season >= current || t.place > AWARD_PLACES) return false; // 終わったシーズンの1〜3位だけ
      return ranksOf(t.mode + ":" + t.season, () => ranked_(readRows_(t.mode, t.season)))[id] === t.place;
    }
    if (t.kind === "all") {
      if (t.place > RANK_TITLE_ALL_PLACES) return false;
      return ranksOf(t.mode + ":all", () => allTimeList_(t.mode, current))[id] === t.place;
    }
    return false;
  };
}

// ---------- アップデート予告 ----------
// 書きこむ（ゲームの管理者モードから）：
//   本文（JSON）：{ action: "notice", key: 管理者モードの鍵, notice: { at: 日時（ISO の文字）, version: "v3.1.1", message: "ひとこと" } }
//   notice を null にすると、予告を消す
//   返す JSON：{ ok: true, action: "notice", notice: 保存した予告か null } / 鍵がちがうとき { ok: false, error: "forbidden" }
function writeNotice_(d) {
  if (!ADMIN_PASS_HASH || sha256Hex_("verify:" + String(d.key || "")) !== ADMIN_PASS_HASH) return json_({ ok: false, error: "forbidden" });
  const props = PropertiesService.getScriptProperties();
  const n = d.notice;
  if (!n) {
    props.deleteProperty("notice");
    return json_({ ok: true, action: "notice", notice: null });
  }
  const at = new Date(String(n.at || ""));
  if (isNaN(at.getTime())) return json_({ ok: false, error: "bad time" });
  const notice = {
    at: at.toISOString(),
    version: cleanText_(n.version, 16),
    message: cleanText_(n.message, NOTICE_MESSAGE_MAX),
    updated: new Date().toISOString(),
  };
  props.setProperty("notice", JSON.stringify(notice));
  return json_({ ok: true, action: "notice", notice: notice });
}

// 保存してある予告（無ければ null）
function readNotice_() {
  const v = PropertiesService.getScriptProperties().getProperty("notice");
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch (err) {
    return null;
  }
}

// 文字 → SHA-256 の番号（16進数の文字列。ゲームの admin.js の sha256 と同じ結果になる）
function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, "0"))
    .join("");
}

// ---------- ここから下は、上で使う部品 ----------
// "comp" なら競技、それ以外はフリー
function modeOf_(v) {
  return String(v || "") === "comp" ? "comp" : "free";
}

// その種類・シーズンのシートの名前（シーズン1 は「ranking」「ranking_comp」、シーズン2 からは「ranking_s2」など）
function sheetName_(mode, season) {
  const base = MODES[modeOf_(mode)].sheet;
  return !season || season === 1 ? base : base + "_s" + season;
}

// その種類・シーズンのシート（無ければ null。読むだけのときに使う。作らない）
function existingSheet_(mode, season) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName_(mode, season));
}

// その種類・シーズンのシート（無ければ、見出しの行（hidden の列もふくむ）を付けて作る）
function sheet_(mode, season) {
  const name = sheetName_(mode, season);
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

// その種類・シーズンのシートの全員分（見出しの行は除く。シートが無ければ空。season を省くと今のシーズン）
function readRows_(mode, season) {
  const sh = existingSheet_(mode, season || currentSeason_());
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
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
    profile: readProfile_(v.slice(PROFILE_COL - 1, STAFF_COL - 1)),
    staff: Object.prototype.hasOwnProperty.call(STAFF_TITLES, String(v[STAFF_COL - 1] || "")) ? String(v[STAFF_COL - 1]) : "",
    achList: String(v[ACH_LIST_COL - 1] || ""),
    nameColor: NAME_COLORS.indexOf(String(v[NAME_COLOR_COL - 1] || "")) >= 0 ? String(v[NAME_COLOR_COL - 1]) : "",
    fav: String(v[NAME_COLOR_COL] || ""),
  }));
}

// ---------- みんなの称号の取得率 ----------
// 届いた profile の achIds（持っている実績の id）を、シートに書く文字にする（カンマ区切り。おかしい id は入れない）
function achListCell_(p) {
  if (!p || typeof p !== "object" || !Array.isArray(p.achIds)) return "";
  const ids = p.achIds.map(String).filter((id) => /^[a-z0-9_]{1,40}$/.test(id));
  return Array.from(new Set(ids)).slice(0, ACH_LIST_MAX).join(",");
}

// プロフィールを公開している人のうち、それぞれの実績（称号）を持っている人の数。
// フリー・競技の両方のシートを見て、同じ端末（id）は1人と数える（新しい方の一覧を使う）。hidden の人は数えない
//   返す JSON：{ mode: "stats", players: 数えた人の数, counts: { 実績の id: 持っている人の数 } }
function titleStats_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("stats:titles");
  if (hit) return JSON.parse(hit);
  const lists = {}; // 端末の番号 → 実績の id の一覧
  for (let season = 1; season <= currentSeason_(); season++) {
    for (const mode of Object.keys(MODES)) {
      for (const r of readRows_(mode, season)) {
        if (!r.id || r.hidden || !r.achList) continue;
        lists[r.id] = r.achList.split(",");
      }
    }
  }
  const counts = {};
  const ids = Object.keys(lists);
  for (const id of ids) for (const a of lists[id]) counts[a] = (counts[a] || 0) + 1;
  const result = { mode: "stats", players: ids.length, counts: counts };
  cache.put("stats:titles", JSON.stringify(result), STATS_CACHE);
  return result;
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
