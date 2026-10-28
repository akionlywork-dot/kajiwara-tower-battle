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
  //
  // 通信がつまって返事が来ないときも、TIMEOUT ミリ秒で打ち切って null を返す（いつまでも待たないように）
  const TIMEOUT = 8000;
  async function load(path) {
    const done = LoadStatus.begin(path);
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) throw new Error(res.status);
      const json = await res.json();
      done(true);
      return json;
    } catch (e) {
      console.warn("読み込めませんでした:", path, e.message);
      done(false, e.name === "AbortError" ? "時間切れ" : e.message);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { load };
})();
