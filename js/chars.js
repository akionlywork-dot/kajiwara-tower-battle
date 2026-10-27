// =============================================
// chars.js
// キャラ一覧（characters.js）を、ゲームで使いやすい形にそろえる
//
// ・キャラは「ID」で見分ける（図鑑・スタンプ・オンライン対戦・管理者モード）。
//   id を書いていないキャラは、画像のファイル名から作る（"images/chara03.webp" → "chara03"）
// ・同じ画像を使う別のキャラ（★4のオーラ版など）は、base に元の画像を書き、id を必ず書く
//     { id: "chara01_light", base: "images/chara01.webp", name: "光の直立", rarity: "UR", aura: "light" }
// characters.js のすぐ後に読み込む（save.js が、古いセーブデータを直すときに使うため）
// =============================================

const Chars = (() => {
  // 画像のファイル名から ID を作る（"images/chara03.webp" → "chara03"）
  const idOf = (file) => String(file || "").replace(/^.*\//, "").replace(/\.[^.]+$/, "");

  // 全キャラに id と file（画像の場所）をそろえる。
  // shared：別のキャラの画像を使っているか（base に画像の場所を書いたキャラ。★4のオーラ版など）
  //   ※ 「base: 数」は、足の裏を平らにする当たり判定の設定（前の書き方）なので、画像の場所ではない
  const list = window.CHARACTERS;
  for (const c of list) {
    c.shared = typeof c.base === "string";
    if (!c.file && c.shared) c.file = c.base;
    if (!c.id) c.id = idOf(c.file);
  }
  // 同じ ID が2つあると見分けられないので、知らせる（2つ目以降は使われない）
  const seen = new Set();
  for (const c of list) {
    if (seen.has(c.id)) console.warn("キャラの id が重なっています（characters.js を確認してください）:", c.id);
    seen.add(c.id);
  }

  // ID のキャラ（無ければ null）
  function byId(id) {
    return list.find((c) => c.id === id) || null;
  }

  // 古いセーブデータ用：画像のファイル名 → その画像の元のキャラの ID
  // （★4のように base で同じ画像を使うキャラではなく、file で書いた元のキャラ）
  function idFromFile(file) {
    const c = list.find((x) => x.file === file && !x.shared);
    return c ? c.id : idOf(file);
  }

  return { list, byId, idOf, idFromFile };
})();
