// =============================================
// save.js
// プレイヤーの保存データ（プロフィール・図鑑・実績・戦績・お知らせの既読）
// すべて localStorage の1つの項目（stack.save）にまとめて保存する。
// データは端末の中に保存される（ランキングやオンライン対戦の相手に送るのは、その一部だけ。ranking.js・vs-intro.js）。
// =============================================

const Save = (() => {
  const KEY = "stack.save";
  // 保存データの形のバージョン。データの形を変えたら数字を1つ上げ、
  // 下の migrate() に「古い形 → 新しい形」に直す処理を足す
  const VERSION = 3; // 2：図鑑を、画像のファイル名ではなくキャラの ID で記録するように / 3：床アレルギー（chara10）をミニ床アレルギー（chara10_small）に
  // バックアップファイルの目印（このゲームのファイルかどうかの確認に使う）
  const APP_ID = "kajiwara-tower-battle";

  // 保存データの初期値（初めて遊ぶ人はこの状態から始まる）
  function defaults() {
    return {
      version: VERSION,
      // プロフィール
      profile: {
        name: "", // 名前（空欄なら「プレイヤー」と表示）
        nameColor: null, // 名前の色（config.js の nameColors の id。null ならいつもの色。custom.js）
        favorite: null, // お気に入りのキャラの ID（図鑑に登録したキャラ。custom.js）
        iconChar: null, // アイコンをキャラの絵から作ったときの、そのキャラの ID（写真なら null。custom.js）
        icon: null, // アイコン画像（256px の JPEG を文字列にしたもの）
        titleId: null, // 名前の横に表示する称号（実績の id）
      },
      // キャラ図鑑：積んだことのあるキャラの ID（例 "chara03"）→ 初めて積んだ日時
      dex: {},
      // 実績：達成した実績の id → 達成した日時
      achievements: {},
      // 使った合言葉：合言葉の id → { at: 使った日時, reward: もらったごほうび }（codes.js。1人1回）
      codes: {},
      // 戦績
      stats: {
        soloPlays: 0, // 1人モードのプレイ回数
        soloTotalScore: 0, // 1人モードのスコアの合計（平均を出すため）
        best: null, // 今のシーズンのハイスコア { score, count, height }（シーズンが変わると、seasonBests に入れて空にする）
        allBest: null, // 全期間のハイスコア（シーズンに関係なく、一番いいもの）
        season: null, // best・compBest がどのシーズンのものか（config.js の seasons の id。null は、シーズン制より前の古いデータ）
        seasonBests: {}, // 終わったシーズンのハイスコア：シーズンの id → { free, comp }
        bestCount: 0, // 1回のゲームで積んだ数の最高
        bestHeight: 0, // 1回のゲームの高さの最高（m）
        versusPlays: 0, // 2人対戦の回数
        versusWins: { 1: 0, 2: 0 }, // プレイヤー1・2の勝利数
        totalPieces: 0, // これまでに積んだキャラの合計（両モード）
        // CPU対戦の強さごとの対戦数・勝利数・今の連勝数・一番の連勝数（人どうしの対戦とは別に数える）
        cpu: {
          easy: { plays: 0, wins: 0, streak: 0, bestStreak: 0 },
          normal: { plays: 0, wins: 0, streak: 0, bestStreak: 0 },
          hard: { plays: 0, wins: 0, streak: 0, bestStreak: 0 },
        },
        online: { plays: 0, wins: 0 }, // オンライン対戦の対戦数と勝利数
        rulePlays: 0, // 特殊ルールのプレイ回数
        ruleBest: {}, // 特殊ルールごとのハイスコア（ルール名 → { score, count, height }）
        placed: {}, // レア度ごとの、積んだキャラの数（レア度 → 数。例 { SR: 3 }）
        placedAura: {}, // ★4のオーラの種類ごとの、積んだ数（例 { light: 1, dark: 2 }）
        drawn: {}, // レア度ごとの、自分の番に出た数（積めなくても数える。例 { MR: 1 }）
        stampsSent: 0, // オンライン対戦のリザルトで送ったスタンプの数
        challengeWins: 0, // 挑戦状で、相手のスコアを上回った回数
        // 競技モード（フリーのスコアアタックとは別に記録する）
        compPlays: 0, // プレイ回数
        compTotalScore: 0, // スコアの合計（平均を出すため）
        compBest: null, // 今のシーズンの、競技のハイスコア { score, count, height }
        allCompBest: null, // 全期間の、競技のハイスコア
      },
      // 実績の世代番号（config.js の achievementsEpoch）。config の番号の方が大きければ、1回だけ実績と戦績をリセットする
      //   epochResetNotice：リセットしたことを、次にタイトル画面が出たときに知らせるか
      //   seasonNotice：シーズンが変わったことを知らせるシーズンの id（知らせたら 0。1回だけ）
      meta: { achievementsEpoch: currentEpoch(), epochResetNotice: false, seasonNotice: 0 },
      // シーズンが終わったときの順位（1〜3位）：[{ season, mode, place }]（ranking.gs の ?awards=1 から。称号になる）
      seasonAwards: [],
      // お知らせ：最後に読んだお知らせの id
      news: { lastReadId: 0 },
      // ランキング（オンライン）
      ranking: {
        id: null, // この端末の番号（ランダム。ランキングで自分の行を見分ける）
        asked: false, // 「ランキングに送りますか？」を聞いたか
        iconAsked: false, // 「写真アイコンも載せますか？」を聞いたか
        sentScore: 0, // 最後に送ったスコア（これより高くなったら、また送る）
        sentScoreComp: 0, // 競技のランキングに最後に送ったスコア
        sentProfileComp: "", // 競技のランキングに最後に送った名前・称号・アイコンの目印
        sentProfile: "", // 最後に送った名前・称号・アイコンの目印（変えたら、また送る）
        lastRank: null, // 最後に分かった自分の順位（ランキングを開いた・送ったとき。オンライン対戦の対戦カードに出す）
      },
      // イベントのステージの戦績：イベントの id → { wins, losses }（負けても勝利数は減らない）。
      // ごほうび（背景・土台・実績）は、この勝利数で決まる。実績のリセット（achievementsEpoch）でも消さない
      eventStats: {},
      // オンライン対戦の、相手ごとの成績：相手の目印（相手の端末の番号から作った値）→ { w: 勝, l: 敗, name: 最後の名前, at: 最後に対戦した日時 }
      opponents: {},
      // スタンプ（オンライン対戦のリザルトで使う4つ）：キャラの ID（例 "chara03"）。null の枠は初期スタンプ
      stamps: [null, null, null, null],
      // スタッフの称号（frames.js の STAFF。開発者・管理者・社員・運営）：称号の id → 獲得した日時。管理者モードで獲得・リセットする
      staffTitles: {},
      // 選んでいる背景と土台（config.js の themes の id）。
      //   cardBg：オンライン対戦の対戦カードの色にする背景の id（null なら、いつもの色）
      cosmetics: { background: "sky", platform: "wood", cardBg: null },
    };
  }

  // 古いバージョンのデータを、今の形に直す
  // （例：バージョン2で項目の名前を変えたら、ここに「if (saved.version < 2) { ... }」を足す）
  function migrate(saved) {
    if (!saved.version) saved.version = 1; // バージョン番号が無いのは、最初の形（バージョン1）
    // 1 → 2：図鑑の記録を「画像のファイル名」から「キャラの ID」に直す
    //   （"images/chara03.webp" → "chara03"。同じ画像を使う★4のキャラと見分けるため）
    if (saved.version < 2 && saved.dex && typeof saved.dex === "object") {
      const dex = {};
      for (const [key, date] of Object.entries(saved.dex)) {
        dex[key.includes("/") ? Chars.idFromFile(key) : key] = date;
      }
      saved.dex = dex;
    }
    // 2 → 3：★1「床アレルギー」（chara10）が、★3「ミニ床アレルギー」（chara10_small）になった。
    //   図鑑の登録とスタンプを、新しい ID に直す（登録していた人のデータが消えないように）
    if (saved.version < 3) {
      const RENAMED = { chara10: "chara10_small" };
      if (saved.dex && typeof saved.dex === "object") {
        for (const [from, to] of Object.entries(RENAMED)) {
          if (saved.dex[from] && !saved.dex[to]) saved.dex[to] = saved.dex[from];
          delete saved.dex[from];
        }
      }
      if (Array.isArray(saved.stamps)) saved.stamps = saved.stamps.map((id) => RENAMED[id] || id);
    }
    saved.version = VERSION;
    return saved;
  }

  // config.js の実績の世代番号（書いていなければ 1）
  function currentEpoch() {
    const n = (window.GAME_CONFIG || {}).achievementsEpoch;
    return typeof n === "number" ? n : 1;
  }

  // 保存データ（またはバックアップの中身）を、初期値と合わせて今の形にする。
  // 項目ごとに初期値と合わせるので、後から項目を増やしても古いデータのまま動く
  function normalize(saved) {
    const result = defaults();
    if (!saved) return result;
    // 実績の世代番号（古いデータには無いので 1 とみなす）。マージする前に読んでおく
    const savedEpoch = saved.meta && typeof saved.meta.achievementsEpoch === "number" ? saved.meta.achievementsEpoch : 1;
    migrate(saved);
    for (const section of Object.keys(result)) {
      if (saved[section] && typeof saved[section] === "object" && typeof result[section] === "object") {
        result[section] = Object.assign(result[section], saved[section]);
      }
    }
    if (savedEpoch < currentEpoch()) resetForNewEpoch(result);
    applySeason(result, !!saved);
    return result;
  }

  // ---------- シーズン（config.js の seasons。js/seasons.js） ----------
  const SEASON_TEST_KEY = "stack.admin.seasonTest"; // 管理者モード：この端末だけ、次のシーズンにする（テスト）

  // 今のシーズンの番号：サーバーで分かった今のシーズン（seasons.js が localStorage の stack.season に覚える。分からなければ 1）。
  // ただし、config.js の seasons に用意してあるシーズンまで。テスト中は、その次
  function currentSeason() {
    const ids = (window.GAME_CONFIG.seasons || []).map((s) => Number(s && s.id)).filter((n) => Number.isInteger(n) && n >= 1);
    const prepared = ids.length ? Math.max(...ids) : 1;
    let n = 1;
    try {
      n = Number((JSON.parse(localStorage.getItem("stack.season") || "null") || {}).current) || 1;
    } catch (e) {}
    n = Math.max(1, Math.min(n, prepared));
    try {
      if (localStorage.getItem(SEASON_TEST_KEY)) n += 1;
    } catch (e) {}
    return n;
  }

  // シーズンが変わっていたら、ベストを入れかえる。変わったら true
  //   ・シーズン制より前の古いデータ（season が無い）：今のベストは「シーズン1」のもの。全期間のベストにも入れる
  //   ・前のシーズンのベストは seasonBests に残し、今のシーズンのベストは空から。ランキングに送った記録・順位も、新しいシーズンでは0から
  //   ・hadData：前からのデータか（初めて遊ぶ人には「シーズン〇が始まりました」を出さない）
  function applySeason(d, hadData) {
    const s = d.stats;
    const now = currentSeason();
    if (typeof s.season !== "number") {
      s.season = 1;
      if (!s.allBest) s.allBest = s.best;
      if (!s.allCompBest) s.allCompBest = s.compBest;
    }
    if (!s.seasonBests || typeof s.seasonBests !== "object") s.seasonBests = {};
    if (s.season >= now) return false;
    if (s.best || s.compBest) s.seasonBests[s.season] = { free: s.best || null, comp: s.compBest || null };
    s.best = null;
    s.compBest = null;
    s.season = now;
    Object.assign(d.ranking, { sentScore: 0, sentScoreComp: 0, sentProfile: "", sentProfileComp: "", lastRank: null });
    if (hadData) d.meta.seasonNotice = now;
    return true;
  }

  // 遊んでいるあいだにシーズンが変わったか調べる（管理者モードのテストの切りかえ）。変わったら保存して true
  function checkSeason() {
    const changed = applySeason(data, true);
    if (changed) write();
    return changed;
  }

  // 実績が新しくなった（config.js の achievementsEpoch を上げた）ときに、1回だけ行うリセット。
  // 実績・戦績・称号・背景と土台の選択を初期に戻す（図鑑・名前・写真・設定・スタンプは残す）。
  // 戦績も戻すのは、「合計100回」などの累計の実績が、リセットした直後にまた解除されないようにするため
  function resetForNewEpoch(d) {
    const fresh = defaults();
    d.achievements = {};
    d.stats = fresh.stats;
    d.profile.titleId = null;
    d.cosmetics = fresh.cosmetics;
    d.meta.achievementsEpoch = currentEpoch();
    d.meta.epochResetNotice = true; // 次にタイトル画面が出たときに知らせる
    try {
      localStorage.removeItem("stack.best"); // 古いハイスコアが引き継がれないように
    } catch (e) {}
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
      if (oldBest && !result.stats.best) {
        result.stats.best = oldBest;
        if (!result.stats.allBest) result.stats.allBest = oldBest;
      }
    } catch (e) {}
    return result;
  }

  const data = load();
  // 実績の世代が変わってリセットしたとき・シーズンが変わったときは、すぐに保存する（次に開いたとき、もう一度しないように）
  if (data.meta.epochResetNotice || data.meta.seasonNotice) write();

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

  // ---------- よく使う値 ----------
  // プレイヤーの名前（2人対戦のプレイヤー2は、いつも「プレイヤー2」）
  function playerName(n) {
    if (n === 2) return "プレイヤー2";
    return data.profile.name || "プレイヤー";
  }

  return { data, write, playerName, exportData, checkImport, importData, defaults, currentSeason, checkSeason, SEASON_TEST_KEY };
})();
