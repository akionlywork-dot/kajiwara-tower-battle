// =============================================
// save.js
// プレイヤーの保存データ（プロフィール・図鑑・実績・戦績・お知らせの既読）
// すべて localStorage の1つの項目（stack.save）にまとめて保存する。
// データは端末の中だけに保存され、どこにも送信されない。
// =============================================

const Save = (() => {
  const KEY = "stack.save";

  // 保存データの初期値（初めて遊ぶ人はこの状態から始まる）
  function defaults() {
    return {
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
      },
      // お知らせ：最後に読んだお知らせの id
      news: { lastReadId: 0 },
    };
  }

  // 保存されていたデータを読み込む。項目ごとに初期値と合わせるので、
  // 後から項目を増やしても古いデータのまま動く
  function load() {
    const data = defaults();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    if (saved) {
      for (const section of Object.keys(data)) {
        if (saved[section] && typeof saved[section] === "object") {
          data[section] = Object.assign(data[section], saved[section]);
        }
      }
    }
    // 以前のバージョンのハイスコア（stack.best）があれば引き継ぐ
    try {
      const oldBest = JSON.parse(localStorage.getItem("stack.best"));
      if (oldBest && !data.stats.best) data.stats.best = oldBest;
    } catch (e) {}
    return data;
  }

  const data = load();

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

  return { data, write, resetStats, playerName };
})();
