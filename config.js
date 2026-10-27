// =============================================
// ゲームの設定ファイル（数値を変えるとゲームのルールが変わります）
// =============================================
window.GAME_CONFIG = {
  // バージョン番号（タイトル画面の右下に表示される）
  version: "v1.3.0",

  // 開発用の機能を使うか。公開するときは false にする
  // true にすると、設定画面に「当たり判定を表示」のスイッチが出る
  devMode: false,

  // 管理者モード（自分だけが使うデバッグ用のメニュー）
  //   タイトル画面右下のバージョン表示を、すばやく7回タップすると開く
  //   passHash : 合言葉から作った番号。合言葉そのものはここに書かない（書くと誰でも見られるため）。
  //              設定のしかたは README の「管理者モード」を参照。"" のあいだは誰も開けない
  //   salt     : 番号を作るときに混ぜる文字（変えると、passHash を作り直す必要がある）
  admin: {
    salt: "27f1e11ee17a728152bd178a",
    passHash: "3c9aa8962b53664710053311a8ec7aaed3bfc7c3e3c5b14cb49665d3dbfae97e",
  },

  // 起動時のスプラッシュ画面
  splash: {
    enabled: true, // false にするとスプラッシュを出さずにタイトルから始まる
    text: "株式会社がんばりピース", // 表示する会社名
    displayTime: 1.5, // 文字が出そろってから表示しておく時間（秒）
  },

  // タイトル画面の背景で流れるデモ
  // sequence の順番どおりにキャラが落ちてきて積まれ、全部積んだら土台が傾いて崩れる → 最初から
  // 1体ずつ、止まったらその場で固定するので、毎回同じ形に安定して積み上がる
  titleDemo: {
    interval: 0.4, // 前のキャラが止まってから、次のキャラが落ちてくるまでの時間（秒）
    // 落ちてくるキャラの順番
    //   file  : characters.js に書いたファイル名
    //   x     : 土台の真ん中からのずれ（右がプラス）
    //   angle : 角度（度。90 なら右に90度回して横向き）
    // ※ 組み合わせを変えると、崩れたりはみ出したりすることがあります。
    //   変えたら必ずタイトル画面で確認してください
    sequence: [
      { file: "images/chara01.webp", x: 0, angle: 90 },
      { file: "images/chara08.webp", x: 0, angle: 90 },
      { file: "images/chara05.webp", x: -30, angle: 0 },
      { file: "images/chara03.webp", x: 0, angle: 90 },
      { file: "images/chara07.webp", x: 0, angle: -90 },
      { file: "images/chara06.webp", x: 0, angle: -90 },
      { file: "images/chara02.webp", x: 0, angle: 90 },
    ],
  },

  // 1人モードのスコア ＝ 積んだ数 × perPiece ＋ タワーの高さ(m) × perMeter
  score: {
    perPiece: 100, // 1体積むごとの点数
    perMeter: 100, // 高さ 1m ごとの点数（端数も計算。1.5m なら 150点）
  },

  // 1手の制限時間（秒）。設定画面で「制限時間」をONにしたときだけ使われる
  turnTimeLimit: 10,

  // 背景と土台（プロフィール画面で選ぶ）
  //   id     : 名前（半角英数字。一度公開したら変えない）
  //   unlock : 解放条件。data/achievements.json の実績の id を書く（その実績を達成すると使える）。
  //            null なら最初から使える
  //   そのほかは色（"#" から始まる色の番号）
  themes: {
    backgrounds: [
      { id: "sky", name: "青空", unlock: null, top: "#7ec8f0", bottom: "#d8f0ff", cloud: "#f4faff", ground: "#7cc35a", groundDark: "#5fa845" },
      { id: "sunset", name: "夕焼け", unlock: "stack10", top: "#ff8a5c", bottom: "#ffd59a", cloud: "#ffe9dc", ground: "#6f9e4c", groundDark: "#557f3a" },
      { id: "sakura", name: "さくら", unlock: "dex_half", top: "#ffb8d2", bottom: "#fff0f6", cloud: "#ffffff", ground: "#9fd36b", groundDark: "#82b854" },
      // stars: true にすると、空に星を描く
      { id: "night", name: "星空", unlock: "height5", top: "#0b1633", bottom: "#33467e", cloud: "#4d5f8f", ground: "#2e5a3b", groundDark: "#1f422a", stars: true },
    ],
    platforms: [
      { id: "wood", name: "木の台", unlock: null, body: "#8a5a3b", top: "#6fbf4a", pillar: "#a39587" },
      { id: "stone", name: "石の台", unlock: "first_stack", body: "#7d808c", top: "#b3b7c2", pillar: "#6b6e78" },
      { id: "ice", name: "氷の台", unlock: "plays10", body: "#7ec4e8", top: "#e3f6ff", pillar: "#6aa9c9" },
      { id: "gold", name: "金の台", unlock: "dex_complete", body: "#d4a019", top: "#ffe27a", pillar: "#b3861a" },
    ],
  },

  // 高さで変わる背景（タワーが高くなるほど、空の様子が変わる）
  //   stages : 上から順に、高さの低いものから並べる。行を足すと背景が増える
  //     height : この高さ（m）に届いたら、この背景になる
  //     name   : 届いたときに「〇〇に到達！」と表示する名前
  //     icon   : 名前の前に出す絵文字
  //     top / bottom : 空の上・下の色、cloud : 雲の色（"#" から始まる6桁の色の番号）
  //     clouds : 雲の濃さ（0 で雲なし、1 でふつう。省略すると 1）
  //     stars  : true にすると星を出す
  //   1つ目（height: 0）は地上。色はプロフィールで選んだ背景（下の themes.backgrounds）を使うので、名前だけ書く
  //   blend : 何 m かけて、次の背景の色に変わっていくか（大きいほどゆっくり変わる）
  sky: {
    blend: 1,
    stages: [
      { height: 0, name: "草原", icon: "🌱" },
      { height: 2, name: "空", icon: "🕊️", top: "#2f86e0", bottom: "#9fd6f7", cloud: "#ffffff" },
      { height: 4, name: "雲の上", icon: "☁️", top: "#5b9be6", bottom: "#f2f8ff", cloud: "#ffffff", clouds: 0.6 },
      { height: 6, name: "夕焼け", icon: "🌇", top: "#4a3a8c", bottom: "#ff9a5c", cloud: "#ffc7a3" },
      { height: 9, name: "宇宙", icon: "🚀", top: "#03051a", bottom: "#1b2156", cloud: "#1b2156", clouds: 0, stars: true },
    ],
  },

  // キャラのレア度（characters.js の rarity に "N" / "R" / "SR" を書く）
  //   weight : 出やすさ。数が大きいほどよく出る（キャラごとに characters.js の weight で上書きできる）
  //   color  : 光る色・図鑑の色
  //   stars  : 図鑑に表示する★の数
  rarity: {
    N: { name: "ノーマル", weight: 10, color: "#b9c4d6", stars: 1 },
    R: { name: "レア", weight: 4, color: "#3d9bff", stars: 2 },
    SR: { name: "スーパーレア", weight: 1, color: "#ffc21a", stars: 3 },
  },

  // CPU対戦の強さ（ふたりで → CPUと）
  //   candidates : 試してみる置き方の数（多いほど良い置き方が見つかる。最大56）
  //   choice     : 選び方。"best"=一番良いもの / "top"=上位から選ぶ / "random"=落ちないものから適当に
  //   noise      : 置く位置のずれ（大きいほど、狙いが雑になる）
  //   thinkTime  : 考えている時間（秒）。計算が早く終わっても、この時間は「考え中…」を出す
  //   maxThink   : 考える時間の上限（秒）。これを過ぎたら、それまでに試した中から選ぶ
  cpu: {
    easy: { name: "よわい", candidates: 6, choice: "random", noise: 45, thinkTime: 1.2, maxThink: 1.5 },
    normal: { name: "ふつう", candidates: 24, choice: "top", noise: 10, thinkTime: 1.4, maxThink: 2.5 },
    hard: { name: "つよい", candidates: 56, choice: "best", noise: 0, thinkTime: 1.6, maxThink: 3.5 },
  },

  // オンライン対戦
  //   まず 2台を直接つなぐ（PeerJS / WebRTC）。directTimeout 秒でつながらなければ、
  //   公開のメッセージ中継サーバー（MQTT）経由に切りかえる
  online: {
    directTimeout: 6, // 直接つながるのを待つ時間（秒）
    // 中継サーバー（上から順に試す。ホストとゲストが同じサーバーを使う必要がある）
    relayBrokers: ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"],
  },

  // 特殊ルール（モード選択の「特殊ルール」から選ぶ。1人モードで遊ぶ）
  // ルールの動きは js/rules.js に書いてある。ここでは名前・説明・数値を調整できる
  rules: {
    wind: {
      name: "風",
      icon: "🌬️",
      description: "ときどき左右から風が吹き、落ちているキャラが流される",
      interval: 6, // 風が吹く間隔（秒）
      duration: 2.5, // 1回の風が吹いている時間（秒）
      strength: 0.02, // 風の強さ（大きいほど流される）
    },
    tilt: {
      name: "傾く土台",
      icon: "⚖️",
      description: "土台がゆっくり左右に傾く",
      maxAngle: 6, // 一番傾いたときの角度（度）
      period: 12, // 左→右→左と1往復する時間（秒）
    },
    slippery: {
      name: "つるつる",
      icon: "🧊",
      description: "摩擦が小さく、キャラも土台もすべりやすい",
      friction: 0.12, // すべりにくさ（ふつうは 1.2）
      frictionStatic: 0.2, // 止まっているときのすべりにくさ（ふつうは 1.8）
    },
    giant: {
      name: "ジャイアント",
      icon: "🦖",
      description: "キャラが大きくなる",
      scale: 1.35, // 大きさの倍率
    },
  },

  // 効果音・BGM のファイル
  // sounds/ フォルダに音声ファイルを置いたら、ここにその場所を書く（例 "sounds/place.mp3"）。
  // "" のままのものは、プログラムで作った仮の音が鳴る（ファイルは読みに行かない）
  sounds: {
    place: "", // キャラが何かに着地したとき
    fall: "", // キャラが土台から落ちたとき
    gameover: "", // ゲームオーバー
    record: "", // ハイスコア更新・対戦の勝利
    rare: "", // レアキャラが出たとき
    click: "", // メニューのボタンを押したとき
    bgm: "", // BGM（くり返し再生される）
  },
};
