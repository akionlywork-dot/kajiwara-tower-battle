// =============================================
// pwa.js
// アプリとしてインストールできるようにする（PWA）
//   ・Service Worker（sw.js）を登録する … ファイルを保存して、通信のない場所でも起動できるように
//   ・インストールの案内（ブラウザで開いている人だけ。アプリとして開いている人には、どこにも出さない）
//       設定画面の「アプリとしてインストール」 … いつも出す（インストールできるブラウザのとき）
//       タイトル画面の小さな帯               … 「あとで」を押したら7日間は出さない
//       リザルト画面のひとこと               … 初めてのゲームのあとに1度だけ（「あとで」の7日間は出さない）
//   ・押したときの動きは、ブラウザに合わせる（guideKind で見分ける。見分けられないときは、案内を出さない）
//       prompt     … Android の Chrome・パソコンの Chrome / Edge など：インストールの確認を出す（beforeinstallprompt）
//       ios-safari … iPhone・iPad の Safari：共有ボタン（□に↑）→「ホーム画面に追加」の手順
//       ios-other  … iPhone・iPad の Chrome・Edge：アドレスバーの共有ボタン →「ホーム画面に追加」の手順
//       mac-safari … パソコン（Mac）の Safari：「ファイル」→「Dockに追加」の手順
//       inapp      … LINE・Instagram・X などのアプリの中のブラウザ：インストールできないので、Safari（Android は Chrome）で開く案内と、URL のコピー
//       null       … インストールできない・見分けられないブラウザ（Firefox など）：案内を出さない
// =============================================

const PWA = (() => {
  const $ = (id) => document.getElementById(id);
  let installPrompt = null; // Chrome が用意してくれる「インストールの確認」
  const LATER_KEY = "stack.install.later"; // 「あとで」を押した日時（ミリ秒）
  const RESULT_KEY = "stack.install.result"; // リザルト画面のひとことを、もう出したか
  const LATER_DAYS = 7; // 「あとで」を押してから、タイトル画面・リザルト画面に出さない日数

  // アプリとして（ホーム画面のアイコンから）起動しているか
  const isApp = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  // ---------- ブラウザを見分ける（ここだけで決める） ----------
  function guideKind() {
    if (isApp()) return null; // すでにアプリとして開いている
    const ua = navigator.userAgent || "";
    // アプリの中のブラウザ（LINE・Instagram・Facebook・X・TikTok など）。インストールはできない
    if (/\bLine\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|TwitterAndroid|BytedanceWebview|musical_ly|MicroMessenger/i.test(ua)) return "inapp";
    if (installPrompt) return "prompt"; // Chrome・Edge など、確認を出せるブラウザ
    const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      if (/CriOS|EdgiOS/i.test(ua)) return "ios-other"; // iPhone の Chrome・Edge（共有ボタンはアドレスバーの右）
      if (/FxiOS|OPiOS|GSA\//i.test(ua)) return null; // Firefox・Opera・Google アプリなど：見分けて出さない
      if (/Safari/i.test(ua)) return "ios-safari";
      return null;
    }
    // パソコン（Mac）の Safari：Chrome・Edge・Firefox ではない Safari
    if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/i.test(ua)) return "mac-safari";
    return null; // Firefox など、インストールできない・見分けられないブラウザ
  }

  // 「あとで」を押してから、7日たっていないか
  function snoozed() {
    try {
      const t = Number(localStorage.getItem(LATER_KEY)) || 0;
      return Date.now() - t < LATER_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function later() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch (e) {}
    update();
  }

  function init() {
    // Service Worker を登録する（https か、パソコンの確認用の localhost でだけ動く）
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    // Chrome が「インストールできます」と知らせてきたら、確認を取っておいてボタンを出す
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); // Chrome が勝手に出す小さな案内は出さず、こちらのボタンから出す
      installPrompt = e;
      update();
    });
    // インストールが終わった：案内を全部消す
    window.addEventListener("appinstalled", () => {
      installPrompt = null;
      try {
        localStorage.setItem(RESULT_KEY, "1");
      } catch (e) {}
      update();
      $("result-install").classList.add("hidden");
      UI.toast("アプリをインストールしました。ホーム画面のアイコンから遊べます");
    });

    $("btn-install").addEventListener("click", install);
    $("btn-install-hint").addEventListener("click", install);
    $("btn-install-later").addEventListener("click", later);
    $("btn-result-install").addEventListener("click", install);
    $("btn-result-install-later").addEventListener("click", () => {
      $("result-install").classList.add("hidden");
      later();
    });
    $("install-guide-close").addEventListener("click", () => $("install-guide").classList.remove("active"));
    $("install-guide-copy").addEventListener("click", copyUrl);
    update();
  }

  // 設定画面のボタンと、タイトル画面の帯を、出すか・説明の文を決める
  function update() {
    const kind = guideKind();
    const texts = {
      prompt: ["ホーム画面から、全画面で遊べます", "インストール"],
      "ios-safari": ["Safari の共有ボタン →「ホーム画面に追加」", "やり方"],
      "ios-other": ["共有ボタン →「ホーム画面に追加」", "やり方"],
      "mac-safari": ["「ファイル」→「Dockに追加」", "やり方"],
      inapp: ["Safari・Chrome で開くとインストールできます", "やり方"],
    };
    const row = $("setting-install-row");
    row.classList.toggle("hidden", !kind);
    if (kind) {
      $("install-desc").textContent = texts[kind][0];
      $("btn-install").textContent = texts[kind][1];
    }
    // タイトル画面の帯：「あとで」から7日たっていないときは出さない
    $("install-hint").classList.toggle("hidden", !kind || snoozed());
  }

  // リザルト画面（main.js から呼ばれる）：初めてのゲームのあとに1度だけ、ひとこと出す。
  // オンライン対戦のリザルトでは出さない（online が true）
  function atResult(online) {
    const box = $("result-install");
    let shown = false;
    try {
      shown = localStorage.getItem(RESULT_KEY) === "1";
    } catch (e) {}
    const show = !online && !shown && !!guideKind() && !snoozed();
    box.classList.toggle("hidden", !show);
    if (show) {
      try {
        localStorage.setItem(RESULT_KEY, "1");
      } catch (e) {}
    }
  }

  // 共有ボタン（□に↑）の絵
  const SHARE_ICON = `<svg class="install-share-icon" viewBox="0 0 24 24" aria-label="共有ボタン"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  // 「ホーム画面に追加」の絵（□に＋）
  const ADD_ICON = `<svg class="install-share-icon" viewBox="0 0 24 24" aria-label="ホーム画面に追加"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  // ブラウザごとの手順（タイトルと、手順の HTML）
  function guideHTML(kind) {
    const isAndroid = /android/i.test(navigator.userAgent);
    switch (kind) {
      case "ios-safari":
        return ["iPhone・iPad でホーム画面に追加", [
          `画面の下（iPad は上）の <b>共有ボタン</b> ${SHARE_ICON} を押す`,
          `少し下にスクロールして、<b>「ホーム画面に追加」</b> ${ADD_ICON} を押す`,
          `右上の <b>「追加」</b> を押す`,
        ]];
      case "ios-other":
        return ["iPhone・iPad でホーム画面に追加", [
          `アドレスバーの右の <b>共有ボタン</b> ${SHARE_ICON} を押す（見つからないときは「…」の中）`,
          `<b>「ホーム画面に追加」</b> ${ADD_ICON} を押す`,
          `<b>「追加」</b> を押す`,
        ]];
      case "mac-safari":
        return ["Mac の Safari でアプリにする", [
          `メニューバーの <b>「ファイル」</b> を押す`,
          `<b>「Dockに追加」</b> を押す`,
          `<b>「追加」</b> を押すと、Dock と Launchpad にアイコンができます`,
        ]];
      case "inapp":
        return ["このアプリの中では、インストールできません", [
          `下の <b>「URL をコピー」</b> を押す`,
          isAndroid ? `<b>Chrome</b> を開いて、アドレスバーに貼り付けて開く` : `<b>Safari</b> を開いて、アドレスバーに貼り付けて開く`,
          `開いたページの「アプリとしてインストール」から、インストールできます`,
        ]];
      default:
        return null;
    }
  }

  async function install() {
    const kind = guideKind();
    if (kind === "prompt") {
      installPrompt.prompt(); // Chrome の「インストールしますか？」を出す
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome !== "accepted") UI.toast("インストールをやめました");
      update();
      return;
    }
    const g = guideHTML(kind);
    if (!g) return;
    $("install-guide-title").textContent = g[0];
    $("install-guide-steps").innerHTML = g[1].map((s) => `<li>${s}</li>`).join("");
    $("install-guide-copy").classList.toggle("hidden", kind !== "inapp");
    $("install-guide").classList.add("active");
  }

  // アプリの中のブラウザ：このページの URL をコピーする（クリップボードが使えなければ、選べる文字で出す）
  async function copyUrl() {
    const url = `${location.origin}${location.pathname}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch (e) {}
    if (ok) UI.toast("URL をコピーしました");
    else {
      $("install-guide").classList.remove("active");
      UI.alert(`この URL を長押ししてコピーしてください\n\n${url}`);
    }
  }

  return { init, atResult, guideKind };
})();
