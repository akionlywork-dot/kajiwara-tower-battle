// =============================================
// settings.js
// 設定を localStorage に保存・読み込みする
// （ハイスコアやプロフィールなどのプレイデータは save.js）
// =============================================

const Settings = (() => {
  const KEY = "stack.settings";

  // 設定の初期値（初めて遊ぶ人はこの状態から始まる）
  const DEFAULTS = {
    bgm: true, // BGM
    se: true, // 効果音
    release: false, // 指を離したら落とす
    debug: false, // 当たり判定を表示（確認用）
    cardSize: "landscape", // リザルトカードの形（"landscape"=横長 / "portrait"=縦長）
    cardIcon: false, // リザルトカードに写真アイコンを載せるか（初めは載せない）
    ranking: false, // ハイスコアをランキングに自動で送るか（最初に1回だけ聞く）
    eventPreview: false, // 管理者モード：イベント期間中として表示する（確認用）
    rankingIcon: false, // ランキングに写真アイコンも載せるか（写真を設定している人に、1回だけ聞く）
    onlineIcon: false, // オンライン対戦の相手に、写真アイコンを見せるか（初めは見せない）
    rankingProfile: false, // ランキングでプロフィール（実績の数・図鑑の数など）を公開するか（ランキングに参加している人だけ）
    compIntro: true, // 競技を選んだときに、ルールの説明を出すか（「次から表示しない」で false）
    adminFps: false, // 管理者モード：FPS を表示
    adminStats: false, // 管理者モード：キャラの数と高さを表示
    adminLoad: false, // 管理者モード：読み込み状況を表示
  };

  // localStorage は、プライベートモードなどで使えないことがあるので try で囲む
  function read(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // 保存されていた設定に、初期値を足し合わせる（新しく増えた設定項目にも対応できる）
  const values = Object.assign({}, DEFAULTS, read(KEY));

  function get(name) {
    return values[name];
  }

  function set(name, value) {
    values[name] = value;
    write(KEY, values);
  }

  // 全部の設定（バックアップの書き出し用）
  function all() {
    return Object.assign({}, values);
  }

  // 設定をまとめて置きかえる（バックアップの読み込み用）。知らない項目は無視する
  function replaceAll(obj) {
    for (const key of Object.keys(DEFAULTS)) {
      values[key] = typeof obj[key] === typeof DEFAULTS[key] ? obj[key] : DEFAULTS[key];
    }
    write(KEY, values);
  }

  return { get, set, all, replaceAll };
})();
