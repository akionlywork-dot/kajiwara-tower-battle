// =============================================
// hitbox-check.js
// 当たり判定チェック用ページ（hitbox.html）の処理
// 全キャラの「本当の輪郭」と「当たり判定」を重ねて表示し、ズレを確認する
// =============================================

(() => {
  const DEFAULT_SIZE = 130; // main.js と同じ
  const ZOOM = 3; // 見やすいように拡大して描く倍率
  const $ = (id) => document.getElementById(id);

  // スライダーの初期値（ゲームの初期設定と同じ）
  $("tol").value = 0.8;
  $("maxv").value = 90;

  let timer = null;
  function scheduleRender() {
    $("tol-val").textContent = $("tol").value;
    clearTimeout(timer);
    timer = setTimeout(render, 200); // 動かしている間は描きなおさない
  }
  $("tol").addEventListener("input", scheduleRender);
  $("maxv").addEventListener("input", scheduleRender);
  $("show-img").addEventListener("change", scheduleRender);

  async function render() {
    const grid = $("grid");
    grid.innerHTML = "";
    for (const c of window.CHARACTERS) {
      // characters.js に設定が書いてあるキャラは、スライダーよりその値を優先
      const options = Object.assign(
        { tolerance: +$("tol").value, maxVertices: +$("maxv").value },
        Shape.optionsFrom(c)
      );
      let shape;
      try {
        shape = await Shape.create(c.file, c.size || DEFAULT_SIZE, options);
      } catch (e) {
        grid.insertAdjacentHTML("beforeend", `<div class="card"><p>${c.file}：読み込み失敗</p></div>`);
        continue;
      }
      grid.appendChild(drawCard(c, shape));
    }
  }

  function drawCard(c, shape) {
    const card = document.createElement("div");
    card.className = "card";
    const canvas = document.createElement("canvas");
    const margin = 10;
    canvas.width = (shape.w + margin * 2) * ZOOM;
    canvas.height = (shape.h + margin * 2) * ZOOM;
    const ctx = canvas.getContext("2d");
    ctx.scale(ZOOM, ZOOM);
    // 重心を原点にする（shape.parts と info.contour は重心が (0,0) の座標）
    ctx.translate(margin + shape.com.x, margin + shape.com.y);

    if ($("show-img").checked) {
      ctx.drawImage(shape.img, -shape.com.x, -shape.com.y, shape.w, shape.h);
    }

    // 当たり判定（かけらごとに塗る）
    ctx.lineWidth = 0.5;
    for (const part of shape.parts) {
      path(ctx, part);
      ctx.fillStyle = "rgba(0, 200, 83, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#00c853";
      ctx.stroke();
    }

    // 本当の輪郭
    if (shape.info.contour.length) {
      path(ctx, shape.info.contour);
      ctx.strokeStyle = "#e0245e";
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }

    // 重心
    ctx.fillStyle = "#e0245e";
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();

    const i = shape.info;
    card.appendChild(canvas);
    card.insertAdjacentHTML(
      "beforeend",
      `<p><b>${c.name}</b>（${c.file}）<br>` +
        (shape.rough
          ? "⚠ 輪郭を取れず四角形で代用中（ローカルサーバーで開いてください）"
          : `頂点 ${i.vertices}・かけら ${i.pieces}・使った許容誤差 ${i.tolerance.toFixed(2)}`) +
        `</p>`
    );
    return card;
  }

  function path(ctx, verts) {
    ctx.beginPath();
    verts.forEach((v, k) => (k ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
    ctx.closePath();
  }

  scheduleRender();
})();
