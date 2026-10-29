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

  // 出やすさ（%）。0 なら出ない。
  // config.js の rarity の rate（そのレア度全体の出現率）を、同じレア度のキャラで、characters.js の weight の割合で分け合う
  // （weight を書いていなければ 1 ＝ 等分。weight: 0 のキャラは出ない）。
  // ※ 前の書き方（レア度の weight ＝ 1体の出やすさ）も使える（rate が無いとき）
  const share = (c) => (typeof c.weight === "number" ? Math.max(0, c.weight) : 1);
  const rarityId = (c) => ((window.GAME_CONFIG.rarity || {})[c.rarity] ? c.rarity : "N");
  function chance(c) {
    const table = window.GAME_CONFIG.rarity || {};
    const r = table[rarityId(c)] || {};
    if (typeof r.rate !== "number") {
      if (typeof c.weight === "number") return c.weight;
      return typeof r.weight === "number" ? r.weight : 1;
    }
    const sum = list.filter((x) => rarityId(x) === rarityId(c)).reduce((n, x) => n + share(x), 0);
    return sum > 0 ? (r.rate * share(c)) / sum : 0;
  }

  // ゲームに出てくるキャラか（出やすさが 0 のキャラ＝まぼろしなど、まだ登場しないキャラは false）
  const appears = (c) => chance(c) > 0;

  // 競技モードに出てくるキャラか（config.js の competitive）。
  // characters.js のキャラにも、ゲームの形（main.js が作る shape。variant・event・rarity を持つ）にも使える。
  // 出てくるのは、competitive.rarities のレア度（または characters.js に competitive: true と書いたキャラ）で、
  // サイズ違い（variant）でも期間限定（event）でもないキャラ
  function inCompetitive(c) {
    const conf = window.GAME_CONFIG.competitive || {};
    const rarities = Array.isArray(conf.rarities) ? conf.rarities : ["N", "R", "SR"];
    return !!c && !c.variant && !c.event && (c.competitive === true || rarities.includes(rarityId(c)));
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

  return { list, byId, idOf, idFromFile, chance, appears, inCompetitive };
})();
