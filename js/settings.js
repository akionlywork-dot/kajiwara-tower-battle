// =============================================
// settings.js
// 設定を localStorage に保存・読み込みする
// （ハイスコアやプロフィールなどのプレイデータは save.js）
// =============================================

const Settings = (() => {
  const KEY = "stack.settings";

  // 設定の初期値（初めて遊ぶ人はこの状態から始まる）
  const DEFAULTS = {
    bgm: true, // BGM
    se: true, // 効果音
    timer: false, // 1手ごとの制限時間
    release: false, // 指を離したら落とす
    debug: false, // 当たり判定を表示（確認用）
  };

  // localStorage は、プライベートモードなどで使えないことがあるので try で囲む
  function read(key) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  // 保存されていた設定に、初期値を足し合わせる（新しく増えた設定項目にも対応できる）
  const values = Object.assign({}, DEFAULTS, read(KEY));

  function get(name) {
    return values[name];
  }

  function set(name, value) {
    values[name] = value;
    write(KEY, values);
  }

  return { get, set };
})();
