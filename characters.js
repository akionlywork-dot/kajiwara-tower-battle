// =============================================
// キャラクター一覧（ここに1行足すとキャラが増えます）
// =============================================
// file : 画像ファイルの場所（images/ フォルダに背景透過の画像を置く。PNG でも WebP でもよい）
// name : キャラの名前（画面に表示されます）
// description : （省略可）図鑑に表示する説明文
// rarity : （省略可）レア度。"N"（ノーマル）/ "R"（レア）/ "SR"（めっちゃレア）/ "UR"（激レア）/ "MR"（まぼろし）/ "SEC"（シークレット）。省略すると "N"
//          レア度ごとの出現率は config.js の rarity の rate（%）。同じレア度のキャラで分け合う
// competitive : （省略可）true にすると、レア度に関係なく競技モードにも出る（ふだんは config.js の competitive.rarities のレア度だけ）
// weight : （省略可）同じレア度の中での出やすさの割合。省略すると 1（等分）。2 にすると、ほかの2倍出る。0 にすると出ない
// size : （省略可）画面上での大きさ。画像の長い方の辺の長さ。省略すると 130
// tolerance : （省略可）当たり判定の細かさ。小さいほど画像の形に忠実。省略すると 0.8
//             hitbox.html を開くと、全キャラの当たり判定を確認できます
// smooth : （省略可）指先やつま先など細い出っぱりを削る強さ。グラつくキャラに。省略すると 0
// hull   : （省略可）true にすると、輪郭を包む凸多角形1つにする（一番シンプルで安定）
// feet   : （省略可）足の裏を平らにする範囲の高さ（キャラの高さに対する割合）。省略すると 0.05、0 で平らにしない
//
// ★4（激レア）：今あるキャラの画像に、オーラをまとわせた別のキャラ（新しい画像はいらない）
// id     : キャラの ID（半角英数字と _ 。ほかのキャラと重ならないように。一度公開したら変えない）
//          書いていないキャラは、画像のファイル名から作られる（images/chara03.webp → chara03）
// base   : 使う画像の場所（元のキャラと同じ画像。base を書いたときは file は書かない）
// aura   : オーラの種類。"light"（光）/ "dark"（闇）。js/aura.js の TYPES に足すと増やせる
// 例） { id: "chara03_light", base: "images/chara03.webp", name: "光の体育座り", rarity: "UR", aura: "light", description: "説明文" },
//
// 例） { file: "images/chara13.png", name: "新しいポーズ", description: "説明文", rarity: "R" },
// 例） { file: "images/chara14.png", name: "激レアポーズ", rarity: "SR", weight: 0.5 },
// ★3（めっちゃレア）のサイズ違い：今あるキャラの画像を、大きく・小さくした別のキャラ（新しい画像はいらない）
// variant : "big"（大きい）/ "small"（小さい）。倍率は config.js の sizeVariants。当たり判定も同じ倍率になる
// 例） { id: "chara05_big", base: "images/chara05.webp", name: "ビッグ台湾案内人", rarity: "SR", variant: "big", description: "説明文" },
//
// ※ 新しいキャラは、一番下に足す（図鑑の番号がずれないように）
window.CHARACTERS = [
  { file: "images/chara01.webp", name: "直立", rarity: "N", description: "黒いTシャツで、まっすぐ立つ。細長いので、積むときは横に寝かせるのがコツ。" },
  { file: "images/chara02.webp", name: "悪の帝王", rarity: "R", description: "サングラスに赤い剣。キメたポーズで登場。" },
  { file: "images/chara03.webp", name: "体育座り", rarity: "N", description: "ジャージ姿で手を組み、どっしり構える。" },
  { file: "images/chara04.webp", name: "ヤンチャ坊主", rarity: "SR", description: "がに股で水鉄砲を構える。横に広いので土台向き？" },
  { file: "images/chara05.webp", name: "台湾案内人", rarity: "N", description: "旗を持って首をかしげる。" },
  { file: "images/chara06.webp", name: "エイリアン", rarity: "N", description: "メガネで、手に持ったものをのぞきこむ。" },
  { file: "images/chara07.webp", name: "篠笛教師", rarity: "N", description: "白シャツで棒をかかげる、先生風のポーズ。" },
  { file: "images/chara08.webp", name: "篠笛マスター", rarity: "R", description: "サングラスで前かがみ。何かを吹いている？" },
  { file: "images/chara09.webp", name: "片足バランス", rarity: "N", description: "片足で前のめりにバランスをとる。積むと一番グラグラするかも。" },
  // 床アレルギー（標準の大きさ。v2.1.0 で ★1 に戻した）。この画像の当たり判定の設定（tolerance・smooth）は、この行のものを使う（ミニ床アレルギーも同じ）
  { file: "images/chara10.webp", name: "床アレルギー", rarity: "N", description: "前かがみで手を床につく。", tolerance: 2, smooth: 4 },
  { file: "images/chara11.webp", name: "虫嫌い", rarity: "SR", description: "剣を振りかぶる、白Tシャツの剣士。" },
  { file: "images/chara12.webp", name: "横ガニ90度", rarity: "R", description: "片足を上げて手を広げる、おどけたポーズ。" },
  // ★4（激レア）：オーラをまとったキャラ（名前・説明文は仮）
  { id: "chara01_light", base: "images/chara01.webp", name: "光の直立", rarity: "UR", aura: "light", description: "まばゆい光をまとって、まっすぐ立つ。" },
  { id: "chara03_dark", base: "images/chara03.webp", name: "闇の体育座り", rarity: "UR", aura: "dark", description: "闇のもやの中で、じっと座りこむ。" },
  { id: "chara07_light", base: "images/chara07.webp", name: "光の篠笛教師", rarity: "UR", aura: "light", description: "光の粒を集めて、棒をかかげる。" },
  { id: "chara09_dark", base: "images/chara09.webp", name: "闇の片足バランス", rarity: "UR", aura: "dark", description: "稲妻を走らせながら、片足で立つ。" },
  // ★3（めっちゃレア）：サイズ違い（画像は元のキャラのもの。倍率は config.js の sizeVariants）
  // ミニ床アレルギー：v2.0.0 までの古い保存データにある "chara10"（★1 床アレルギー）は、save.js が "chara10_small" に直している
  { id: "chara10_small", base: "images/chara10.webp", name: "ミニ床アレルギー", rarity: "SR", variant: "small", description: "小さくなった床アレルギー。前かがみで手を床につく。" },
  { id: "chara06_big", base: "images/chara06.webp", name: "ビッグエイリアン", rarity: "SR", variant: "big", description: "見上げるほど大きくなったブンリキエイリアン。立てると、ぐらぐら。" },
  { id: "chara05_big", base: "images/chara05.webp", name: "ビッグ案内人", rarity: "SR", variant: "big", description: "大きな旗をかかげる、見上げるほどの台湾案内人。細長いので、寝かせるのがコツ。" },
  // ★5（まぼろし）：とても出にくい（config.js の rarity の MR の rate を3体で分け合う）。名前・説明文は仮
  { file: "images/chara13.webp", name: "スマホ自慢", rarity: "MR", description: "しゃがんで、スマホを見せびらかす。" },
  { file: "images/chara14.webp", name: "白シャツの伊達男", rarity: "MR", description: "腰に手を当てて、さっそうと歩く。" },
  { file: "images/chara15.webp", name: "キャプテン", rarity: "MR", description: "ドクロの帽子にサングラス。海の男。" },
  // v3.1.0 で追加（_source/images/新俺のゲーム〇.png。名前・説明文は仮）
  // ★6（シークレット）：いちばん出にくい（config.js の rarity の SEC）
  { file: "images/chara16.webp", name: "マイケル", rarity: "SEC", description: "上着をひるがえし、帽子に手をそえる。正体はだれも知らない。" },
  { file: "images/chara17.webp", name: "卍", rarity: "R", description: "学ランで両手を広げ、木の棒を2本かかげる。" },
  { file: "images/chara18.webp", name: "公安", rarity: "UR", competitive: true, description: "腰を落として、両手で水鉄砲をかまえる。" },
  { file: "images/chara19.webp", name: "別班", rarity: "UR", competitive: true, description: "片手をポケットに、もう片手で水鉄砲をまっすぐ向ける。" },
  { file: "images/chara20.webp", name: "ハンガーファイター", rarity: "SR", description: "ドクロの帽子で、両手にハンガー。キャプテンの子分？" },
  { file: "images/chara21.webp", name: "友達", rarity: "SR", description: "手をつないだ2人組。横に広いので、土台にぴったり。" },
  { file: "images/chara22.webp", name: "読書家", rarity: "R", description: "本を読みながら、片手で本を高く積み上げる。とても細長い。" },
  { file: "images/chara23.webp", name: "若相撲", rarity: "N", description: "両手を広げて、見えないイスに座る。" },
  { file: "images/chara24.webp", name: "て", rarity: "N", size: 60, description: "ピンと立った人差し指。てっぺんに積むのはむずかしい。" },
  { file: "images/chara25.webp", name: "ヨガ", rarity: "N", description: "四つんばいで、片足と片手をのばす。" },
  { file: "images/chara26.webp", name: "土下座", rarity: "N", description: "深々と頭を下げる。平らな背中は、積むのにちょうどいい。" },
];
