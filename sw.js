// =============================================
// sw.js（Service Worker）
// ゲームのファイルをスマホに保存しておき、アプリとして起動できるように・
// 通信のない場所でもひとりで遊べるようにする
//
// ★更新するときは、この VERSION を config.js の version・index.html の ?v= と同じ番号に上げる
//   （番号が変わると、新しいファイルを保存しなおし、古いものは消す）
// =============================================

const VERSION = "3.3.0";
// 同じバージョンのまま、ファイルを直したとき（例：v3.3.0 のあとで config.js のシーズン2の名前を直した）は、REVISION を1つ上げる。
// 画面に出るバージョンはそのままで、みんなの端末のファイルが保存しなおされる。バージョンを上げたときは 1 に戻す
const REVISION = 2;
const CACHE = `kajiwara-tb-${VERSION}-r${REVISION}`;

// バージョン番号（?v=）を付けて読み込んでいるファイル（index.html と同じもの）
const VERSIONED = [
  "css/style.css",
  "lib/decomp.min.js", "lib/matter.min.js", "lib/peerjs.min.js", "lib/mqtt.min.js",
  "config.js", "characters.js", "js/load-status.js", "js/chars.js",
  "js/settings.js", "js/save.js", "js/seasons.js", "js/audio.js", "js/shape.js", "js/aura.js", "js/platform-art.js", "js/game.js", "js/rules.js",
  "js/cpu.js", "js/challenge.js", "js/card.js", "js/stamps.js", "js/halloween-home.js", "js/halloween.js", "js/title-fx.js", "js/online.js", "js/ui.js", "js/themes.js", "js/frames.js", "js/vs-intro.js", "js/profile.js", "js/custom.js", "js/codes.js", "js/data-file.js",
  "js/news.js", "js/events.js", "js/ranking.js", "js/records.js", "js/dex.js", "js/achievements.js",
  "js/backup.js", "js/controls.js", "js/admin.js", "js/sandbox.js", "js/pwa.js", "js/updates.js", "js/main.js",
].map((p) => `${p}?v=${VERSION}`);

// そのほかに保存しておくファイル
const OTHERS = [
  "./", "index.html", "manifest.webmanifest", "favicon.svg", "apple-touch-icon.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  ...Array.from({ length: 12 }, (_, i) => `images/chara${String(i + 1).padStart(2, "0")}.webp`),
  "images/chara13.webp", "images/chara14.webp", "images/chara15.webp",
  ...Array.from({ length: 11 }, (_, i) => `images/chara${i + 16}.webp`), // v3.1.0 で追加（chara16〜26）
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
  // 公開されている版の確認（updates.js の config.js?latest=）も、保存しない
  if (url.searchParams.has("latest")) return;

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
