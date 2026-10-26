// =============================================
// data-file.js
// data/ フォルダの JSON ファイル（お知らせ・ランキング・実績）を読み込む
// =============================================

const DataFile = (() => {
  // JSON ファイルを読み込む。読み込めなかったら（オフラインなど）null を返す。
  //
  // 古い内容がキャッシュ（ブラウザが前に読んだものを取っておく仕組み）から
  // 表示されないように、2つの工夫をしている：
  //   1. cache: "no-store" … ブラウザにキャッシュを使わないよう頼む
  //   2. URL の最後に ?t=今の時刻 を付ける … 毎回ちがう URL になるので、
  //      途中のサーバー（GitHub Pages など）のキャッシュも使われない
  async function load(path) {
    try {
      const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return await res.json();
    } catch (e) {
      console.warn("読み込めませんでした:", path, e.message);
      return null;
    }
  }

  return { load };
})();
