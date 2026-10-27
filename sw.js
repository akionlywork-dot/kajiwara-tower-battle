// =============================================
// sw.js（Service Worker）
// ゲームのファイルをスマホに保存しておき、アプリとして起動できるように・
// 通信のない場所でもひとりで遊べるようにする
//
// ★更新するときは、この VERSION を config.js の version・index.html の ?v= と同じ番号に上げる
//   （番号が変わると、新しいファイルを保存しなおし、古いものは消す）
// =============================================

const VERSION = "1.5.0";
const CACHE = `kajiwara-tb-${VERSION}`;

// バージョン番号（?v=）を付けて読み込んでいるファイル（index.html と同じもの）
const VERSIONED = [
  "css/style.css",
  "lib/decomp.min.js", "lib/matter.min.js", "lib/peerjs.min.js", "lib/mqtt.min.js",
  "config.js", "characters.js",
  "js/settings.js", "js/save.js", "js/audio.js", "js/shape.js", "js/game.js", "js/rules.js",
  "js/cpu.js", "js/challenge.js", "js/card.js", "js/stamps.js", "js/online.js", "js/ui.js", "js/themes.js", "js/profile.js", "js/data-file.js",
  "js/news.js", "js/events.js", "js/ranking.js", "js/records.js", "js/dex.js", "js/achievements.js",
  "js/backup.js", "js/admin.js", "js/pwa.js", "js/main.js",
].map((p) => `${p}?v=${VERSION}`);

// そのほかに保存しておくファイル
const OTHERS = [
  "./", "index.html", "manifest.webmanifest", "favicon.svg", "apple-touch-icon.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  ...Array.from({ length: 12 }, (_, i) => `images/chara${String(i + 1).padStart(2, "0")}.webp`),
];

// インストールされたとき：ファイルをまとめて保存する
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...VERSIONED, ...OTHERS]))
      .then(() => self.skipWaiting()) // 新しい版をすぐ使い始める
  );
});

// 新しい版が動き始めたとき：古い版で保存したファイルを消す
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kajiwara-tb-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ファイルを読み込むとき
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // ほかのサイトへの通信（オンライン対戦のサーバーなど）や、読み込み以外は何もしない
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // お知らせ・ランキング・実績のデータは、いつも最新を取りにいく（保存しない）
  if (url.pathname.includes("/data/")) return;

  // ページ本体：通信できるときは最新を取り、保存しなおす。できないときは保存したものを使う
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // そのほか：保存したものがあればそれを使い、無ければ取りにいって保存する
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
