// =============================================
// save.js
// プレイヤーの保存データ（プロフィール・図鑑・実績・戦績・お知らせの既読）
// すべて localStorage の1つの項目（stack.save）にまとめて保存する。
// データは端末の中だけに保存され、どこにも送信されない。
// =============================================

const Save = (() => {
  const KEY = "stack.save";
  // 保存データの形のバージョン。データの形を変えたら数字を1つ上げ、
  // 下の migrate() に「古い形 → 新しい形」に直す処理を足す
  const VERSION = 1;
  // バックアップファイルの目印（このゲームのファイルかどうかの確認に使う）
  const APP_ID = "kajiwara-tower-battle";

  // 保存データの初期値（初めて遊ぶ人はこの状態から始まる）
  function defaults() {
    return {
      version: VERSION,
      // プロフィール
      profile: {
        name: "", // 名前（空欄なら「プレイヤー」と表示）
        icon: null, // アイコン画像（256px の JPEG を文字列にしたもの）
        titleId: null, // 名前の横に表示する称号（実績の id）
      },
      // キャラ図鑑：積んだことのあるキャラのファイル名 → 初めて積んだ日時
      dex: {},
      // 実績：達成した実績の id → 達成した日時
      achievements: {},
      // 戦績
      stats: {
        soloPlays: 0, // 1人モードのプレイ回数
        soloTotalScore: 0, // 1人モードのスコアの合計（平均を出すため）
        best: null, // ハイスコアの記録 { score, count, height }
        bestCount: 0, // 1回のゲームで積んだ数の最高
        bestHeight: 0, // 1回のゲームの高さの最高（m）
        versusPlays: 0, // 2人対戦の回数
        versusWins: { 1: 0, 2: 0 }, // プレイヤー1・2の勝利数
        totalPieces: 0, // これまでに積んだキャラの合計（両モード）
        // CPU対戦の強さごとの対戦数と勝利数（人どうしの対戦とは別に数える）
        cpu: { easy: { plays: 0, wins: 0 }, normal: { plays: 0, wins: 0 }, hard: { plays: 0, wins: 0 } },
        online: { plays: 0, wins: 0 }, // オンライン対戦の対戦数と勝利数
        rulePlays: 0, // 特殊ルールのプレイ回数
        ruleBest: {}, // 特殊ルールごとのハイスコア（ルール名 → { score, count, height }）
      },
      // お知らせ：最後に読んだお知らせの id
      news: { lastReadId: 0 },
      // ランキング（オンライン）
      ranking: {
        id: null, // この端末の番号（ランダム。ランキングで自分の行を見分ける）
        asked: false, // 「ランキングに送りますか？」を聞いたか
        sentScore: 0, // 最後に送ったスコア（これより高くなったら、また送る）
        sentName: "", // 最後に送った名前（名前を変えたら、また送る）
      },
      // 選んでいる背景と土台（config.js の themes の id）
      cosmetics: { background: "sky", platform: "wood" },
    };
  }

  // 古いバージョンのデータを、今の形に直す
  // （例：バージョン2で項目の名前を変えたら、ここに「if (saved.version < 2) { ... }」を足す）
  function migrate(saved) {
    if (!saved.version) saved.version = 1; // バージョン番号が無いのは、最初の形（バージョン1）
    // 今はバージョン1だけなので、直す処理はまだ無い
    saved.version = VERSION;
    return saved;
  }

  // 保存データ（またはバックアップの中身）を、初期値と合わせて今の形にする。
  // 項目ごとに初期値と合わせるので、後から項目を増やしても古いデータのまま動く
  function normalize(saved) {
    const result = defaults();
    if (!saved) return result;
    migrate(saved);
    for (const section of Object.keys(result)) {
      if (saved[section] && typeof saved[section] === "object" && typeof result[section] === "object") {
        result[section] = Object.assign(result[section], saved[section]);
      }
    }
    return result;
  }

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    const result = normalize(saved);
    // 以前のバージョンのハイスコア（stack.best）があれば引き継ぐ
    try {
      const oldBest = JSON.parse(localStorage.getItem("stack.best"));
      if (oldBest && !result.stats.best) result.stats.best = oldBest;
    } catch (e) {}
    return result;
  }

  const data = load();

  // ---------- バックアップ（書き出し・読み込み） ----------
  // 書き出すデータ：プレイデータと設定を1つにまとめる
  function exportData() {
    return {
      app: APP_ID, // このゲームのファイルだという目印
      saveVersion: VERSION, // データの形のバージョン
      exportedAt: new Date().toISOString(), // 書き出した日時
      save: data,
      settings: Settings.all(),
    };
  }

  // 読み込んだファイルの中身を確認する。
  // 正しければ { ok: true, save, settings }、だめなら { ok: false, error: "理由" }
  function checkImport(json) {
    if (!json || typeof json !== "object" || json.app !== APP_ID) {
      return { ok: false, error: "このゲームのバックアップファイルではありません。" };
    }
    if (typeof json.saveVersion !== "number" || !json.save || typeof json.save !== "object") {
      return { ok: false, error: "ファイルが壊れているため読み込めません。" };
    }
    if (json.saveVersion > VERSION) {
      return { ok: false, error: "新しいバージョンのゲームで書き出されたファイルです。\nゲームを最新にしてから読み込んでください。" };
    }
    const s = json.save;
    const looksRight = s.profile && typeof s.profile === "object" && s.stats && typeof s.stats === "object";
    if (!looksRight) return { ok: false, error: "ファイルが壊れているため読み込めません。" };
    return { ok: true, save: normalize(JSON.parse(JSON.stringify(s))), settings: json.settings || {}, exportedAt: json.exportedAt };
  }

  // 確認ずみのデータで、今のデータを上書きする
  function importData(checked) {
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, checked.save);
    Settings.replaceAll(checked.settings);
    try {
      localStorage.removeItem("stack.best"); // 古いハイスコアが混ざらないように
    } catch (e) {}
    return write();
  }

  // 保存する。容量オーバーなどで保存できなかったら false を返す
  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn("保存できませんでした:", e.message);
      return false;
    }
  }

  // 戦績だけを初期状態に戻す（プロフィール・図鑑・実績はそのまま）
  function resetStats() {
    data.stats = defaults().stats;
    try {
      localStorage.removeItem("stack.best"); // 古いハイスコアも消す（引き継がれないように）
    } catch (e) {}
    write();
  }

  // ---------- よく使う値 ----------
  // プレイヤーの名前（2人対戦のプレイヤー2は、いつも「プレイヤー2」）
  function playerName(n) {
    if (n === 2) return "プレイヤー2";
    return data.profile.name || "プレイヤー";
  }

  return { data, write, resetStats, playerName, exportData, checkImport, importData };
})();
