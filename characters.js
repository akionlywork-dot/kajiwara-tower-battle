// =============================================
// キャラクター一覧（ここに1行足すとキャラが増えます）
// =============================================
// file : 画像ファイルの場所（images/ フォルダに背景透過の画像を置く。PNG でも WebP でもよい）
// name : キャラの名前（画面に表示されます）
// description : （省略可）図鑑に表示する説明文
// size : （省略可）画面上での大きさ。画像の長い方の辺の長さ。省略すると 130
// tolerance : （省略可）当たり判定の細かさ。小さいほど画像の形に忠実。省略すると 0.8
//             hitbox.html を開くと、全キャラの当たり判定を確認できます
// smooth : （省略可）指先やつま先など細い出っぱりを削る強さ。グラつくキャラに。省略すると 0
// hull   : （省略可）true にすると、輪郭を包む凸多角形1つにする（一番シンプルで安定）
//
// 例） { file: "images/chara13.png", name: "新しいポーズ", description: "説明文", size: 120 },
// 例） { file: "images/chara14.png", name: "細かいポーズ", tolerance: 0.5 },
window.CHARACTERS = [
  { file: "images/chara01.webp", name: "直立", description: "黒いTシャツで、まっすぐ立つ。細長いので、積むときは横に寝かせるのがコツ。" },
  { file: "images/chara02.webp", name: "ポーズ2", description: "サングラスに赤い剣。キメたポーズで登場。" },
  { file: "images/chara03.webp", name: "ポーズ3", description: "ジャージ姿で手を組み、どっしり構える。" },
  { file: "images/chara04.webp", name: "ポーズ4", description: "がに股で水鉄砲を構える。横に広いので土台向き？" },
  { file: "images/chara05.webp", name: "ポーズ5", description: "旗を持って首をかしげる。" },
  { file: "images/chara06.webp", name: "ポーズ6", description: "メガネで、手に持ったものをのぞきこむ。" },
  { file: "images/chara07.webp", name: "ポーズ7", description: "白シャツで棒をかかげる、先生風のポーズ。" },
  { file: "images/chara08.webp", name: "ポーズ8", description: "サングラスで前かがみ。何かを吹いている？" },
  { file: "images/chara09.webp", name: "片足バランス", description: "片足で前のめりにバランスをとる。積むと一番グラグラするかも。" },
  // 手の指先で立つポーズでグラつくので、指先などの細い出っぱりを削って簡略化
  { file: "images/chara10.webp", name: "ポーズ10", description: "前かがみで手を床につく。", tolerance: 2, smooth: 4 },
  { file: "images/chara11.webp", name: "ポーズ11", description: "剣を振りかぶる、白Tシャツの剣士。" },
  { file: "images/chara12.webp", name: "ポーズ12", description: "片足を上げて手を広げる、おどけたポーズ。" },
];
