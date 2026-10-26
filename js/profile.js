// =============================================
// profile.js
// プロフィール画面（名前・称号・アイコン）と、アイコン写真の切り抜き
//
// アイコンの流れ：
//   写真を選ぶ → 調整画面で位置と大きさを決める → 256px の丸いアイコンに縮小
//   → 文字列（JPEG）にして localStorage に保存（サーバーには送らない）
// =============================================

const Profile = (() => {
  const $ = (id) => document.getElementById(id);
  const ICON_SIZE = 256; // 保存するアイコンの大きさ（px）
  const CROP_VIEW = 260; // 調整画面の枠の大きさ（画面上の px。CSS の .crop-frame と同じ）
  const MAX_ZOOM = 4; // どこまで拡大できるか（枠いっぱいの大きさの何倍まで）

  // 調整中の写真 { img, scale, minScale, x, y }
  //   scale: 写真の拡大率、minScale: 枠をちょうど埋める拡大率
  //   x, y : 写真の中心が、枠の中心からどれだけずれているか
  let crop = null;

  // ---------- 初期化 ----------
  function init() {
    // 名前：入力するたびに保存
    $("input-name").addEventListener("input", (e) => {
      Save.data.profile.name = e.target.value.trim().slice(0, 10);
      Save.write();
      refresh();
    });
    // 称号
    $("select-title").addEventListener("change", (e) => {
      Save.data.profile.titleId = e.target.value || null;
      Save.write();
      refresh();
    });
    // 写真を選んだ
    $("icon-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = ""; // 同じ写真をもう一度選んでも反応するように
      if (file) openCrop(file);
    });
    $("btn-icon-remove").addEventListener("click", () => {
      Save.data.profile.icon = null;
      Save.write();
      refresh();
    });
    $("btn-crop-ok").addEventListener("click", saveCrop);
    $("crop-zoom").addEventListener("input", (e) => {
      if (!crop) return;
      crop.scale = crop.minScale * Number(e.target.value);
      clampCrop();
      drawCrop();
    });
    setupCropGestures();
    UI.onShow("profile", render);
    refresh();
  }

  // プロフィール画面の中身を、保存データに合わせる
  function render() {
    const p = Save.data.profile;
    $("input-name").value = p.name;
    // 称号の選択肢（達成した実績の称号だけ）
    const select = $("select-title");
    select.innerHTML = `<option value="">なし</option>`;
    for (const a of unlockedTitles()) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.title;
      select.appendChild(opt);
    }
    select.value = p.titleId || "";
    refresh();
  }

  // 達成した実績の一覧（実績の機能がまだ読み込まれていなければ空）
  function unlockedTitles() {
    return typeof Achievements !== "undefined" ? Achievements.unlockedList() : [];
  }

  // 称号の id → 称号の文字（無ければ ""）
  function titleText(id) {
    if (!id) return "";
    const a = unlockedTitles().find((x) => x.id === id);
    return a ? a.title : "";
  }

  // 名前・アイコンを表示しているところを、全部最新にする
  function refresh() {
    const p = Save.data.profile;
    applyAvatar($("profile-avatar"), p.icon, Save.playerName(1));
    applyAvatar($("chip-avatar"), p.icon, Save.playerName(1));
    $("chip-name").textContent = Save.playerName(1);
    $("chip-title").textContent = titleText(p.titleId);
  }

  // アイコンを表示する。写真が無ければ、名前の1文字目を丸の中に出す
  function applyAvatar(el, icon, name) {
    if (icon) {
      el.style.backgroundImage = `url(${icon})`;
      el.textContent = "";
      el.classList.remove("avatar-empty");
    } else {
      el.style.backgroundImage = "";
      el.textContent = [...name][0] || "?";
      el.classList.add("avatar-empty");
    }
  }

  // リザルト画面などに入れる「アイコン＋名前＋称号」の HTML
  function badgeHTML() {
    const p = Save.data.profile;
    const name = UI.escape(Save.playerName(1));
    const title = UI.escape(titleText(p.titleId));
    const avatar = p.icon
      ? `<span class="avatar" style="background-image:url(${p.icon})"></span>`
      : `<span class="avatar avatar-empty">${UI.escape([...Save.playerName(1)][0])}</span>`;
    return `<div class="player-badge">${avatar}<span><b>${name}</b>${title ? `<small>${title}</small>` : ""}</span></div>`;
  }

  // ---------- アイコンの切り抜き ----------
  // 選んだ写真を読み込んで、調整画面を開く
  function openCrop(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // スマホの写真はとても大きいので、先に長い辺 1024px まで縮小しておく（動作を軽くするため）
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const small = document.createElement("canvas");
      small.width = Math.round(img.width * k);
      small.height = Math.round(img.height * k);
      small.getContext("2d").drawImage(img, 0, 0, small.width, small.height);

      // 写真の短い辺が、ちょうど枠を埋める大きさから始める
      const minScale = CROP_VIEW / Math.min(small.width, small.height);
      crop = { img: small, scale: minScale, minScale, x: 0, y: 0 };
      $("crop-zoom").value = 1;
      UI.show("crop");
      drawCrop();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      UI.toast("写真を読み込めませんでした");
    };
    img.src = url;
  }

  // 写真が枠からはみ出して、すき間ができないようにする
  function clampCrop() {
    const maxX = (crop.img.width * crop.scale - CROP_VIEW) / 2;
    const maxY = (crop.img.height * crop.scale - CROP_VIEW) / 2;
    crop.x = Math.max(-maxX, Math.min(maxX, crop.x));
    crop.y = Math.max(-maxY, Math.min(maxY, crop.y));
  }

  // 写真を描く（size は描く先の大きさ。調整画面と、保存用の両方で使う）
  function drawPhoto(ctx, size) {
    const k = size / CROP_VIEW; // 調整画面 → 描く先 の倍率
    const w = crop.img.width * crop.scale * k;
    const h = crop.img.height * crop.scale * k;
    ctx.drawImage(crop.img, size / 2 + crop.x * k - w / 2, size / 2 + crop.y * k - h / 2, w, h);
  }

  // 調整画面を描く：写真の上に、丸の外側を暗くする覆いをかける
  function drawCrop() {
    const canvas = $("crop-canvas");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.height = Math.round(CROP_VIEW * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1e2a40";
    ctx.fillRect(0, 0, CROP_VIEW, CROP_VIEW);
    drawPhoto(ctx, CROP_VIEW);
    // 四角から丸をくり抜いた形で塗る（evenodd：重なったところは塗らない）
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, CROP_VIEW, CROP_VIEW);
    ctx.arc(CROP_VIEW / 2, CROP_VIEW / 2, CROP_VIEW / 2 - 4, 0, Math.PI * 2);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CROP_VIEW / 2, CROP_VIEW / 2, CROP_VIEW / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 指の操作：1本指でドラッグ → 位置、2本指でつまむ → 大きさ
  function setupCropGestures() {
    const canvas = $("crop-canvas");
    const pointers = new Map(); // 画面にふれている指（id → 位置）
    let pinchDist = 0;

    const dist = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinchDist = dist();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!crop || !pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const now = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        crop.x += now.x - prev.x;
        crop.y += now.y - prev.y;
      } else if (pointers.size === 2) {
        const d = dist();
        const zoom = Math.max(1, Math.min(MAX_ZOOM, (crop.scale / crop.minScale) * (d / pinchDist)));
        crop.scale = crop.minScale * zoom;
        $("crop-zoom").value = zoom;
        pinchDist = d;
      }
      clampCrop();
      drawCrop();
    });
    const up = (e) => pointers.delete(e.pointerId);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  // 決定：256px に縮小して保存する
  function saveCrop() {
    if (!crop) return;
    const out = document.createElement("canvas");
    out.width = out.height = ICON_SIZE;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    drawPhoto(ctx, ICON_SIZE);
    // 丸く見せるのは CSS（border-radius）で行う。JPEG にすると容量が小さくなる
    const before = Save.data.profile.icon;
    Save.data.profile.icon = out.toDataURL("image/jpeg", 0.85);
    if (!Save.write()) {
      Save.data.profile.icon = before;
      UI.toast("保存できませんでした（端末の保存容量が足りません）");
    }
    crop = null;
    refresh();
    UI.show("profile");
  }

  return { init, refresh, applyAvatar, titleText, badgeHTML };
})();
