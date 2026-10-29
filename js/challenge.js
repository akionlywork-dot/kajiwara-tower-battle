// =============================================
// challenge.js
// 挑戦状：同じ順番のキャラで、スコアを競う URL
//
// URL の形：https://.../?seed=12345&mode=solo&rule=wind&score=1270&name=あき
//   seed  : キャラの出る順番を決める番号（同じ番号なら、同じ順番でキャラが出る）
//   mode  : モード（"solo"：フリー / "comp"：競技。省略すると solo。競技のときは rule を付けない）
//   rule  : 特殊ルールの名前（config.js の rules。ふつうのルールなら省略）
//   score : 送った人のスコア
//   name  : 送った人の名前
// 値がおかしいときは挑戦状として扱わず、ふつうに始める
// =============================================

const Challenge = (() => {
  const MAX_SEED = 4294967295; // シード値の最大（32ビット）
  const MAX_SCORE = 9999999;
  const NAME_MAX = 10; // 名前の最大文字数（プロフィールの名前と同じ）

  // 新しいシード値（1 〜 MAX_SEED）
  function newSeed() {
    return 1 + Math.floor(Math.random() * MAX_SEED);
  }

  // URL のパラメータから挑戦状を読み取る
  // 返り値：{ seed, mode, rule, score, name, comp（競技か） } / 挑戦状の URL でなければ null / 値がおかしければ "invalid"
  function parse(search) {
    const q = new URLSearchParams(search);
    if (!q.has("seed")) return null;
    const seed = toInt(q.get("seed"), 1, MAX_SEED);
    const score = toInt(q.get("score"), 0, MAX_SCORE);
    const mode = q.get("mode") || "solo";
    const rule = q.get("rule") || null;
    // 名前：制御文字を取りのぞき、前後の空白を消して、最大 NAME_MAX 文字
    const name = [...String(q.get("name") || "").replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, NAME_MAX).join("");
    if (seed === null || score === null || (mode !== "solo" && mode !== "comp")) return "invalid";
    if (rule && (mode === "comp" || !Rules.get(rule))) return "invalid";
    return { seed, mode, rule, score, name: name || "だれか", comp: mode === "comp" };
  }

  // 整数の文字列なら数に、そうでなければ null（範囲外も null）
  function toInt(text, min, max) {
    if (!/^\d{1,10}$/.test(text || "")) return null;
    const n = Number(text);
    return n >= min && n <= max ? n : null;
  }

  // 挑戦状の URL を作る（今開いているページの URL に、パラメータを付ける）
  function makeUrl({ seed, rule, score, name, comp }) {
    const q = new URLSearchParams({ seed: String(seed), mode: comp ? "comp" : "solo" });
    if (rule) q.set("rule", rule);
    q.set("score", String(score));
    q.set("name", name);
    return `${location.origin}${location.pathname}?${q}`;
  }

  // アドレスバーから挑戦状のパラメータを消す（再読み込みで、また挑戦状が出ないように）
  function clearUrl() {
    try {
      history.replaceState(null, "", location.pathname + location.hash);
    } catch (e) {}
  }

  return { newSeed, parse, makeUrl, clearUrl };
})();

// =============================================
// 共有（挑戦状・リザルトカード・フォトモードで使う）
// Web Share API が使えればスマホの共有メニューを出す。使えなければ代わりの方法
// =============================================
const Share = (() => {
  const $ = (id) => document.getElementById(id);

  // URL を共有する。共有メニューが使えなければ、URL とコピーボタンのダイアログを出す
  async function url(text, link) {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, text, url: link });
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // 自分で閉じた
      }
    }
    openCopyDialog(link);
  }

  // 画像を共有する。画像付きの共有ができなければ、画像を保存する
  async function image(blob, filename, text) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    download(blob, filename);
  }

  // 画像を保存する（ダウンロード）
  function download(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    UI.toast("画像を保存しました");
  }

  // ---------- URL をコピーするダイアログ ----------
  function openCopyDialog(link) {
    $("share-url").value = link;
    $("share-dialog").classList.add("active");
  }

  async function copy() {
    const input = $("share-url");
    let ok = false;
    try {
      await navigator.clipboard.writeText(input.value);
      ok = true;
    } catch (e) {
      // クリップボードが使えないブラウザ：選択してコピー
      input.select();
      try {
        ok = document.execCommand("copy");
      } catch (e2) {}
    }
    UI.toast(ok ? "URLをコピーしました" : "コピーできませんでした。URLを長押ししてコピーしてください");
  }

  function init() {
    $("share-copy").addEventListener("click", copy);
    $("share-close").addEventListener("click", () => $("share-dialog").classList.remove("active"));
    $("share-url").addEventListener("focus", (e) => e.target.select());
  }

  return { init, url, image, download };
})();
