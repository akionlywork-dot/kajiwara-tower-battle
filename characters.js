// =============================================
// キャラクター一覧（ここに1行足すとキャラが増えます）
// =============================================
// file : 画像ファイルの場所（images/ フォルダに背景透過の画像を置く。PNG でも WebP でもよい）
// name : キャラの名前（画面に表示されます）
// description : （省略可）図鑑に表示する説明文
// rarity : （省略可）レア度。"N"（ノーマル）/ "R"（レア）/ "SR"（めっちゃレア）/ "UR"（激レア）/ "MR"（まぼろし）。省略すると "N"
// weight : （省略可）出やすさ。省略するとレア度ごとの値（config.js の rarity）。大きいほどよく出る
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
// ※ 新しいキャラは、一番下に足す（図鑑の番号がずれないように）
window.CHARACTERS = [
  { file: "images/chara01.webp", name: "直立", rarity: "N", description: "黒いTシャツで、まっすぐ立つ。細長いので、積むときは横に寝かせるのがコツ。" },
  { file: "images/chara02.webp", name: "悪の帝王", rarity: "R", description: "サングラスに赤い剣。キメたポーズで登場。" },
  { file: "images/chara03.webp", name: "体育座り", rarity: "N", description: "ジャージ姿で手を組み、どっしり構える。" },
  { file: "images/chara04.webp", name: "ヤンチャ坊主", rarity: "SR", description: "がに股で水鉄砲を構える。横に広いので土台向き？" },
  { file: "images/chara05.webp", name: "台湾案内人", rarity: "N", description: "旗を持って首をかしげる。" },
  { file: "images/chara06.webp", name: "ブンリキエイリアン", rarity: "N", description: "メガネで、手に持ったものをのぞきこむ。" },
  { file: "images/chara07.webp", name: "篠笛教師", rarity: "N", description: "白シャツで棒をかかげる、先生風のポーズ。" },
  { file: "images/chara08.webp", name: "篠笛マスター", rarity: "R", description: "サングラスで前かがみ。何かを吹いている？" },
  { file: "images/chara09.webp", name: "片足バランス", rarity: "N", description: "片足で前のめりにバランスをとる。積むと一番グラグラするかも。" },
  { file: "images/chara10.webp", name: "床アレルギー", rarity: "N", description: "前かがみで手を床につく。", tolerance: 2, smooth: 4 },
  { file: "images/chara11.webp", name: "しっぱい", rarity: "SR", description: "剣を振りかぶる、白Tシャツの剣士。" },
  { file: "images/chara12.webp", name: "横ガニ90度", rarity: "R", description: "片足を上げて手を広げる、おどけたポーズ。" },
  // ★4（激レア）：オーラをまとったキャラ（名前・説明文は仮）
  { id: "chara01_light", base: "images/chara01.webp", name: "光の直立", rarity: "UR", aura: "light", description: "（仮）まばゆい光をまとって、まっすぐ立つ。" },
  { id: "chara03_dark", base: "images/chara03.webp", name: "闇の体育座り", rarity: "UR", aura: "dark", description: "（仮）闇のもやの中で、じっと座りこむ。" },
  { id: "chara07_light", base: "images/chara07.webp", name: "光の篠笛教師", rarity: "UR", aura: "light", description: "（仮）光の粒を集めて、棒をかかげる。" },
  { id: "chara09_dark", base: "images/chara09.webp", name: "闇の片足バランス", rarity: "UR", aura: "dark", description: "（仮）稲妻を走らせながら、片足で立つ。" },
  // ★5（まぼろし）：まだ登場しない（出る確率 0%）。画像は仮の「？」。登場させるときに画像・名前を書きかえる
  { file: "images/maboroshi01.webp", name: "？？？", rarity: "MR", description: "（仮）まだだれも見たことがない、まぼろしのキャラ。" },
];
