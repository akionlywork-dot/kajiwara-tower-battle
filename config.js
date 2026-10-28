// =============================================
// ゲームの設定ファイル（数値を変えるとゲームのルールが変わります）
// =============================================
window.GAME_CONFIG = {
  // 実績の世代番号。実績を大きく作り直したときに1つ上げると、開いた人から順に、
  // 1回だけ「実績と戦績」がリセットされる（図鑑・名前・写真・設定・スタンプは残る）。README の「実績のリセット」を参照
  achievementsEpoch: 2,

  // バージョン番号（タイトル画面の右下に表示される）
  version: "v1.14.1",

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
    interval: 0.9, // 次のキャラを落とし始めるまでの間隔（前のキャラを落とし始めてから。秒）。短くすると、何体も同時に落ちてくる
    holdTime: 3, // 積み終わってから、そのまま見せる時間（秒）
    fadeTime: 0.8, // 塔がふわっと消えていく時間（秒）。消えたら、順番を入れかえて最初から
    // 落ちてくるキャラ（1回目はこの順番。2回目からは順番を入れかえる）
    //   file : characters.js に書いたファイル名
    // 置く位置と向きは、ゲームが自動で決める（落ちずに、低く・まっすぐ・真ん中に収まる置き方を、試してから選ぶ）
    sequence: [
      { file: "images/chara01.webp" },
      { file: "images/chara08.webp" },
      { file: "images/chara05.webp" },
      { file: "images/chara03.webp" },
      { file: "images/chara07.webp" },
      { file: "images/chara06.webp" },
      { file: "images/chara02.webp" },
    ],
  },

  // タイトル画面の演出（数値を変えると、動きの速さ・間隔が変わる。時間はすべて秒）
  // 端末の「視差効果を減らす」が ON のときは、ここの設定に関係なく、動きを控えめにする
  titleFx: {
    // 登場：ロゴが1文字ずつ弾んで出る → タグライン → スタートボタン・メニューが下から出る
    logoStart: 0.15, // 最初の文字が出るまで
    logoStep: 0.07, // 1文字ごとの間隔
    taglineAfter: 0.15, // ロゴが出そろってから、タグラインが出るまで
    buttonAfter: 0.3, // タグラインが出てから、スタートボタンが出るまで
    // ロゴ
    floatTime: 3.2, // ふわふわ上下に動く、1往復の時間
    shineEvery: [4, 8], // キラッと光る間隔（この2つの間でランダム）
    // スタートボタンが脈打つ、1回の時間
    pulseTime: 1.6,
    // 雲（タイトル以外の画面の空にも使う）。奥と手前で速さを変えて、奥行きを出す
    //   count: 数、speed: 1秒に画面の何割進むか、scale: 大きさ、alpha: 濃さ（0〜1）
    clouds: {
      far: { count: 4, speed: 0.004, scale: 0.6, alpha: 0.6 },
      near: { count: 3, speed: 0.014, scale: 1.15, alpha: 1 },
    },
    // 鳥：ときどき、数羽の群れが横切る
    birds: {
      firstAfter: [2, 4], // タイトルを開いてから、最初の鳥が来るまで
      every: [6, 12], // 次の群れが来るまでの間隔
      count: [1, 4], // 1回の羽数
      speed: 70, // 飛ぶ速さ（ゲーム内の単位。画面の横幅が 450）
    },
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
      // むずかしい実績で解放：宇宙到達（高さ9m）→ 銀河
      { id: "galaxy", name: "銀河", unlock: "height9", top: "#07041c", bottom: "#3b1f72", cloud: "#5c4a9c", ground: "#2b2350", groundDark: "#1a1538", stars: true },
      // ハロウィンイベントのごほうび（1勝目）。moon: 大きな満月、bats: こうもりが飛び回る
      // unlock に { event, wins } を書くと、そのイベントの勝利数で解放される（イベントが終わっても使える）
      { id: "halloween_night", name: "ハロウィンの夜", unlock: { event: "halloween2026", wins: 1 }, top: "#1c0b33", bottom: "#5b2a86", cloud: "#4a2d6b", ground: "#2e1f3a", groundDark: "#1d1426", stars: true, moon: true, bats: true },
    ],
    // 土台：body（正面）・top（上の面）・pillar（柱）の色と、style（描き方。js/platform-art.js）
    //   style："wood"（木）/ "stone"（石積み）/ "ice"（氷・つらら）/ "gold"（金・彫り模様・光が走る）/ "crystal"（宝石）/ "pumpkin"（かぼちゃ）
    //   style を書かないと、色だけの四角になる。当たり判定は、どの style でも同じ四角
    platforms: [
      { id: "wood", name: "木の台", unlock: null, style: "wood", body: "#8a5a3b", top: "#6fbf4a", pillar: "#9a6b45" },
      { id: "stone", name: "石の台", unlock: "first_stack", style: "stone", body: "#7d808c", top: "#b3b7c2", pillar: "#6b6e78" },
      { id: "ice", name: "氷の台", unlock: "plays10", style: "ice", body: "#7ec4e8", top: "#e3f6ff", pillar: "#6aa9c9" },
      { id: "gold", name: "金の台", unlock: "dex_complete", style: "gold", body: "#d4a019", top: "#ffe27a", pillar: "#b3861a" },
      // むずかしい実績で解放：無敗の王（CPU「つよい」に3連勝）→ ダイヤの台
      { id: "diamond", name: "ダイヤの台", unlock: "cpu_hard_streak3", style: "crystal", body: "#7fd6f2", top: "#f2fdff", pillar: "#6ab3cf" },
      // ハロウィンイベントのごほうび（2勝目）
      { id: "pumpkin", name: "かぼちゃの台", unlock: { event: "halloween2026", wins: 2 }, body: "#f07b14", top: "#4f8a2b", style: "pumpkin", pillar: "#7a5a3a" },
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
    SR: { name: "めっちゃレア", weight: 1, color: "#ffc21a", stars: 3 },
    // ★4：オーラをまとったキャラ（characters.js の aura）。出ると「激レア！！！」
    UR: { name: "激レア", weight: 0.5, color: "#ff5ec8", stars: 4 },
    // ★5：まぼろし。まだ登場しない（weight が 0 なので出ない）。図鑑には「？？？」として並ぶ。
    //   登場させるときは weight を 0 より大きくする（キャラごとに characters.js の weight で決めてもよい）
    MR: { name: "まぼろし", weight: 0, color: "#7ef0ff", stars: 5 },
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
    // ハロウィンイベント「おばけ屋敷」の CPU（初めは「つよい」と同じ。勝ちやすさはここで調整する）。
    // event を書いた強さは、ふつうの CPU 対戦のボタン・戦績には出ない
    halloween: { name: "つよい", candidates: 56, choice: "best", noise: 0, thinkTime: 1.6, maxThink: 3.5, event: "halloween2026" },
  },

  // オンライン対戦
  //   まず 2台を直接つなぐ（PeerJS / WebRTC）。directTimeout 秒でつながらなければ、
  //   公開のメッセージ中継サーバー（MQTT）経由に切りかえる
  online: {
    directTimeout: 6, // 直接つながるのを待つ時間（秒）
    // 中継サーバー（上から順に試す。ホストとゲストが同じサーバーを使う必要がある）
    relayBrokers: ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"],
    // 試合の前の対戦カードの演出（秒）。1戦目 ＝ introSlide ＋ introTime ＋ introExit（約3秒）
    introSlide: 0.5, // カードがすべり込む時間（止まったところで「VS」が出る）
    introTime: 2, // そのまま見せる時間
    introExit: 0.45, // カードが抜けて消える時間
    rematchIntroTime: 1, // 2戦目からの短い版（「第2戦」と、この部屋での勝敗）
    // 「始める」を送ってから演出を始めるまでのゆとり。2台で同じ時刻に始めるため、
    // 届くまでの時間（つないだときに測る）を差し引いて、相手に「〇秒後に始めて」と伝える
    introLead: 0.7,
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
    // ハロウィンイベントのステージ「おばけ屋敷」（stage: true なので、特殊ルールの一覧には出ない。動きは rules.js）
    haunted: {
      name: "おばけ屋敷",
      icon: "🎃",
      description: "まっくらなお屋敷で、CPU「つよい」と対戦。ときどき稲妻が光り、おばけが落ちているキャラを押してくる",
      event: "halloween2026",
      stage: true,
      darkness: 0.86, // 暗さ（0〜1。1でまっくら）
      lightRadius: 120, // 持っているキャラ・落ちているキャラのまわりの、明るい丸の大きさ（ゲーム内の単位）
      lightningEvery: [4, 7], // 稲妻が光る間隔（秒。この間でランダム）
      flashTime: 0.45, // 稲妻で明るくなっている時間（秒）
      ghostEvery: [3, 6], // おばけが出てくる間隔（秒。この間でランダム）
      ghostSpeed: 130, // おばけが横切る速さ（ゲーム内の単位/秒。画面の横幅が 450）
      ghostRadius: 70, // おばけが押す範囲（おばけの真ん中からの距離）
      ghostPush: 0.05, // 押す強さ（大きいほど、落ちているキャラが横に流される。0.05 で、おばけの中を通ると30くらい横にずれる）
    },
  },

  // イベントのステージとごほうび（イベントの期間は data/events.json）
  //   rule    : ステージの動き（上の rules の名前）
  //   cpu     : 対戦する CPU の強さ（上の cpu の名前）
  //   rewards : 勝つたびに1つずつもらえるごほうび。wins 勝目にもらえる
  //             type: "background"（背景）/ "platform"（土台）/ "achievement"（実績）、id: themes・実績の id
  //             背景・土台は、themes の unlock に { event, wins } を書いておくと、その勝利数で使えるようになる
  events: {
    halloween2026: {
      rule: "haunted",
      cpu: "halloween",
      rewards: [
        { wins: 1, type: "background", id: "halloween_night", name: "背景「ハロウィンの夜」" },
        { wins: 2, type: "platform", id: "pumpkin", name: "土台「かぼちゃの台」" },
        { wins: 3, type: "achievement", id: "pumpkin_king", name: "実績「かぼちゃの王」（称号「パンプキング」）" },
      ],
      // 期間中のホーム（タイトル）画面の後ろの絵（js/halloween-home.js）。
      // プロフィールで何を選んでいても、まだ解放していなくても、ホームではこの背景・土台で描く（ゲーム中は選んだもの）
      home: {
        background: "halloween_night", // 背景（themes.backgrounds の id）
        platform: "pumpkin", // 土台（themes.platforms の id）
        pumpkins: 4, // 丘の上のジャック・オ・ランタンの数（0〜6）
        flicker: 1, // かぼちゃの光の揺れの速さ（1 がふつう）
        windowBlink: 1, // おばけ屋敷の窓がまたたく速さ（0 なら消えない）
        fog: { speed: 8, alpha: 0.8 }, // 霧の流れる速さ（1秒に動く量）と濃さ（0〜1）
        ghosts: { every: [3, 7], firstAfter: [1.5, 3], time: 3, max: 2 }, // おばけが出る間隔（秒）・最初に出るまで・出ている時間・同時に出る数（0 なら出さない）
        bats: 3, // キャンバスのこうもりの数（ホームでは CSS のこうもり3匹もいるので、ふだんの5匹から減らす）
      },
    },
  },

  // スタンプ（オンライン対戦のリザルト画面で、相手に送る）
  //   defaults : 何も選んでいない枠に入る、最初から使える初期スタンプ（キャラの ID ＝ 画像のファイル名から拡張子を除いたもの）。
  //              初期スタンプは、図鑑に登録していなくても使える
  stamps: {
    defaults: ["chara01", "chara03", "chara05", "chara09"],
  },

  // ランキング（オンライン）
  //   url : Google Apps Script のウェブアプリの URL（README の「ランキング（オンライン）」の手順で作る）。
  //         "" のあいだは、data/ranking.json を手で書いたランキングを表示する（スコアはどこにも送らない）
  ranking: {
    url: "https://script.google.com/macros/s/AKfycbyQQ9_9KCd2MXGjTB6p7DLZlHnFQ7nS0Jda7kuPaJjnV_zFF4PBL8XB6hyn9N2o-fPb/exec",
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
    stamp: "", // スタンプを送った・届いたとき
    ultimate: "", // ★4（激レア）が出たとき
    vs: "", // オンライン対戦の、試合の前の「VS」
    bgm: "", // BGM（くり返し再生される）
  },
};
