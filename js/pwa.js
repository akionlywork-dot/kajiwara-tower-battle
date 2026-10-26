// =============================================
// pwa.js
// アプリとしてインストールできるようにする（PWA）
//   ・Service Worker（sw.js）を登録する … ファイルを保存して、通信のない場所でも起動できるように
//   ・設定画面の「アプリとしてインストール」ボタン
//       Android の Chrome など：ボタンを押すと、インストールの確認が出る
//       iPhone の Safari     ：インストールのボタンが無いので、「ホーム画面に追加」の手順を案内する
//       すでにアプリとして起動しているとき：ボタンは出さない
// =============================================

const PWA = (() => {
  const $ = (id) => document.getElementById(id);
  let installPrompt = null; // Chrome が用意してくれる「インストールの確認」

  // アプリとして（ホーム画面のアイコンから）起動しているか
  const isApp = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  // iPhone・iPad の Safari か
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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
    // インストールが終わった
    window.addEventListener("appinstalled", () => {
      installPrompt = null;
      update();
      UI.toast("アプリをインストールしました。ホーム画面のアイコンから遊べます");
    });

    $("btn-install").addEventListener("click", install);
    update();
  }

  // ボタンを出すか・説明の文を決める
  function update() {
    const row = $("setting-install-row");
    if (isApp()) return row.classList.add("hidden"); // すでにアプリとして起動している
    if (installPrompt) {
      row.classList.remove("hidden");
      $("install-desc").textContent = "ホーム画面から、全画面で遊べます";
      $("btn-install").textContent = "インストール";
    } else if (isIOS()) {
      row.classList.remove("hidden");
      $("install-desc").textContent = "Safari の共有ボタン →「ホーム画面に追加」";
      $("btn-install").textContent = "やり方";
    } else {
      row.classList.add("hidden"); // インストールできないブラウザ・すでにインストールずみ
    }
  }

  async function install() {
    if (installPrompt) {
      installPrompt.prompt(); // Chrome の「インストールしますか？」を出す
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      if (choice.outcome !== "accepted") UI.toast("インストールをやめました");
      update();
    } else if (isIOS()) {
      UI.alert("iPhone・iPad では、次の手順でホーム画面に追加できます。\n\n1. Safari で このページを開く\n2. 画面下の共有ボタン（□に↑）を押す\n3.「ホーム画面に追加」を押す");
    }
  }

  return { init };
})();
