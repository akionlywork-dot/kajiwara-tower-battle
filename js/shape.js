// =============================================
// shape.js
// 画像の「透明でない部分」の輪郭から、当たり判定（物理ボディの形）を作る
//
// 流れ：
//   1. 画像を小さなキャンバスに描いて、各ピクセルの透明度を調べる
//   2. 不透明なピクセルのかたまり（一番大きいもの）の外周をなぞる（輪郭抽出）
//   3. 頂点が多すぎるので間引く（Ramer-Douglas-Peucker 法）
//   4. 凹んだ形は poly-decomp で凸多角形に分割し、Matter.js のボディにする
// =============================================

const Shape = (() => {
  // 当たり判定の作り方の設定（characters.js でキャラごとに上書きもできる）
  const DEFAULTS = {
    // 輪郭を調べるときの画像サイズ（長い辺のピクセル数）。大きいほど細い部分まで拾える
    analysisSize: 256,
    // この値より不透明なピクセルを「キャラの一部」とみなす（0〜255）
    alphaThreshold: 100,
    // 輪郭の許容誤差（ゲーム内の単位。キャラの長い辺が 130）。
    // 小さいほど画像の形に忠実になる。0.8 なら、本当の輪郭から最大 0.8 までのズレを許す
    tolerance: 0.8,
    // 頂点数の上限。これを超えるときは、許容誤差を少しずつ大きくして間引く
    maxVertices: 90,
    // なめらかさ。0 より大きくすると、指先やつま先のような細い出っぱりを削る
    // （値が大きいほど太い出っぱりまで削る。指先で立つポーズがグラつくときに使う）
    smooth: 0,
    // true にすると、輪郭をすっぽり包む凸多角形（凸包）1つにする。一番シンプルで安定するが、
    // 足の間などのすき間も埋まる
    hull: false,
  };

  // ---------- 1. 画像を読み込む ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像を読み込めませんでした: " + src));
      img.src = src;
    });
  }

  // 画像を縮小して描き、「不透明かどうか」の 0/1 マスクを作る
  function makeMask(img, cfg) {
    // 元画像より大きくしても意味がないので、元画像の大きさまでにする
    const scale = Math.min(1, cfg.analysisSize / Math.max(img.width, img.height));
    // 周りに 2px の余白をつける（輪郭追跡が画像の端からはみ出さないように）
    const pad = 2;
    const w = Math.round(img.width * scale) + pad * 2;
    const h = Math.round(img.height * scale) + pad * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, pad, pad, w - pad * 2, h - pad * 2);

    // ここで例外が出るのは、index.html をファイルとして直接開いたとき（セキュリティ制限）
    const data = ctx.getImageData(0, 0, w, h).data;
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      mask[i] = data[i * 4 + 3] > cfg.alphaThreshold ? 1 : 0;
    }
    // 小さなすき間を埋めて、輪郭をなめらかにする（膨張→収縮 ＝「クロージング」）
    mask = erode(dilate(mask, w, h), w, h);
    // smooth の回数だけ収縮→膨張（＝「オープニング」）。細い出っぱりは収縮で消えて、膨張しても戻らない
    for (let i = 0; i < cfg.smooth; i++) mask = erode(mask, w, h);
    for (let i = 0; i < cfg.smooth; i++) mask = dilate(mask, w, h);
    mask = keepLargestBlob(mask, w, h);
    return { mask, w, h, pad, scale };
  }

  // 膨張：となりに1つでも不透明があれば不透明にする
  function dilate(m, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        out[i] = m[i] | m[i - 1] | m[i + 1] | m[i - w] | m[i + w];
      }
    }
    return out;
  }

  // 収縮：となりに1つでも透明があれば透明にする
  function erode(m, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        out[i] = m[i] & m[i - 1] & m[i + 1] & m[i - w] & m[i + w];
      }
    }
    return out;
  }

  // つながっている不透明ピクセルのかたまりのうち、一番大きいものだけ残す
  // （ゴミのような小さな点を無視するため）
  function keepLargestBlob(m, w, h) {
    const label = new Int32Array(w * h);
    let best = 0, bestSize = 0, next = 1;
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (!m[i] || label[i]) continue;
      // 塗りつぶし（スタックを使った深さ優先探索）
      let size = 0;
      label[i] = next;
      stack.push(i);
      while (stack.length) {
        const p = stack.pop();
        size++;
        const x = p % w, y = (p - x) / w;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) {
          if (q >= 0 && m[q] && !label[q]) {
            label[q] = next;
            stack.push(q);
          }
        }
      }
      if (size > bestSize) { bestSize = size; best = next; }
      next++;
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0;
    return out;
  }

  // ---------- 2. 輪郭抽出（ムーア近傍追跡） ----------
  // 不透明ピクセルの外周を時計回りにぐるっとなぞって、点の列を返す
  function traceContour(mask, w, h) {
    // 8方向（西から時計回り）
    const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
    const DY = [0, -1, -1, -1, 0, 1, 1, 1];
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;

    // 左上から探して、最初に見つかった不透明ピクセルをスタート地点にする
    let sx = -1, sy = -1;
    for (let y = 0; y < h && sx < 0; y++) {
      for (let x = 0; x < w; x++) {
        if (at(x, y)) { sx = x; sy = y; break; }
      }
    }
    if (sx < 0) return [];

    const points = [{ x: sx, y: sy }];
    let cx = sx, cy = sy;
    let back = 0; // 直前にいた（透明な）方向。スタート地点の西は必ず透明
    const maxSteps = w * h * 4;
    for (let step = 0; step < maxSteps; step++) {
      let found = false;
      // 「戻る方向」の次から時計回りに、不透明なとなりを探す
      for (let i = 1; i <= 8; i++) {
        const d = (back + i) % 8;
        const nx = cx + DX[d], ny = cy + DY[d];
        if (at(nx, ny)) {
          // 1つ手前に調べた（透明な）マスを、次の「戻る方向」にする
          const pd = (back + i - 1) % 8;
          const px = cx + DX[pd], py = cy + DY[pd];
          for (let k = 0; k < 8; k++) {
            if (nx + DX[k] === px && ny + DY[k] === py) { back = k; break; }
          }
          cx = nx; cy = ny;
          found = true;
          break;
        }
      }
      if (!found) break; // 1ピクセルだけの場合
      if (cx === sx && cy === sy) break; // 一周した
      points.push({ x: cx, y: cy });
    }
    return points;
  }

  // ---------- 3. 頂点を間引く（Ramer-Douglas-Peucker 法） ----------
  // 線から eps 以内しか離れていない点を消して、形をシンプルにする
  function simplify(points, eps) {
    if (points.length < 3) return points.slice();
    // 閉じた形なので、いちばん離れた2点で2本の線に分けてから処理する
    let far = 0, farDist = -1;
    for (let i = 1; i < points.length; i++) {
      const d = dist2(points[0], points[i]);
      if (d > farDist) { farDist = d; far = i; }
    }
    const a = rdp(points.slice(0, far + 1), eps);
    const b = rdp(points.slice(far).concat([points[0]]), eps);
    return a.slice(0, -1).concat(b.slice(0, -1));
  }

  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const first = pts[0], last = pts[pts.length - 1];
    let idx = -1, maxD = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSegment(pts[i], first, last);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      const left = rdp(pts.slice(0, idx + 1), eps);
      const right = rdp(pts.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  function dist2(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  function distToSegment(p, a, b) {
    const l2 = dist2(a, b);
    if (l2 === 0) return Math.sqrt(dist2(p, a));
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(dist2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }));
  }

  // ---------- 4. 凸多角形に分割 ----------
  // 返り値：凸多角形（頂点配列）の配列。失敗したら null
  function decompose(points) {
    const poly = points.map((p) => [p.x, p.y]);
    decomp.makeCCW(poly);
    decomp.removeCollinearPoints(poly, 0.05);
    // 自分自身と交差している形は分割できない
    if (poly.length < 3 || !decomp.isSimple(poly)) return null;
    const pieces = decomp.quickDecomp(poly);
    if (!pieces || !pieces.length) return null;
    return pieces.map((piece) => piece.map(([x, y]) => ({ x, y })));
  }

  // ---------- まとめ：画像1枚から「形のデータ」を作る ----------
  // size: 画面上での長い辺の長さ（ゲーム内の単位）
  //
  // 返り値 shape:
  //   img    : 画像
  //   w, h   : 画面上での画像の幅・高さ
  //   com    : 重心の位置（画像の左上を (0,0) とした座標）
  //            → 描画するときは、ボディの位置から com だけずらして画像を描くとピッタリ重なる
  //   parts  : 凸多角形の配列（重心を (0,0) とした座標）
  //   rough  : true なら輪郭が取れず四角形で代用している
  //   info   : 確認用の情報（頂点数・かけらの数・実際に使った許容誤差・元の輪郭）
  // options: DEFAULTS の値をキャラごとに変えたいときに渡す（例 { tolerance: 0.5 }）
  async function create(src, size, options) {
    const cfg = Object.assign({}, DEFAULTS, options);
    const img = await loadImage(src);
    const drawScale = size / Math.max(img.width, img.height);
    const w = img.width * drawScale;
    const h = img.height * drawScale;

    let convexParts = null;
    let rough = false;
    const info = { vertices: 0, pieces: 0, tolerance: 0, contour: [] };
    try {
      const m = makeMask(img, cfg);
      // 解析用の座標 → 画面上の座標 に変換する係数
      const k = drawScale / m.scale;
      const toScreen = (p) => ({ x: (p.x - m.pad + 0.5) * k, y: (p.y - m.pad + 0.5) * k });
      // 輪郭は、最初から画面上の座標にしておく（許容誤差を画面上の長さで考えられるように）
      const contour = traceContour(m.mask, m.w, m.h).map(toScreen);
      info.contour = contour;

      if (cfg.hull) {
        const simple = simplify(contour, cfg.tolerance);
        convexParts = [Matter.Vertices.hull(simple)];
        info.vertices = convexParts[0].length;
        info.tolerance = cfg.tolerance;
      }
      // 頂点が maxVertices 以下で、かつ分割に成功するまで、少しずつ間引きを強くしていく
      for (let eps = cfg.tolerance; eps < cfg.tolerance * 12 && !convexParts; eps *= 1.15) {
        const simple = simplify(contour, eps);
        if (simple.length > cfg.maxVertices) continue;
        convexParts = decompose(simple);
        info.vertices = simple.length;
        info.tolerance = eps;
      }
      // それでもダメなら、輪郭をすっぽり包む凸多角形（凸包）で代用する
      if (!convexParts && contour.length >= 3) {
        console.warn("凹みのある形に分割できなかったので凸包で代用します:", src);
        convexParts = [Matter.Vertices.hull(simplify(contour, cfg.tolerance))];
      }
    } catch (e) {
      console.warn("輪郭を取得できなかったので四角形で代用します:", src, e.message);
    }
    if (!convexParts) {
      rough = true;
      convexParts = [[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]];
    }

    // 面積がほぼ 0 の、つぶれたかけらだけ捨てる（物理演算でエラーになるため）。
    // 普通の小さなかけらは捨てない（途中のかけらを捨てると当たり判定に穴があくので）
    let pieces = convexParts.filter((v) => Matter.Vertices.area(v) >= 0.5);
    if (!pieces.length) pieces = convexParts;
    info.pieces = pieces.length;

    // 一度ボディを組み立てて、Matter.js が計算する「重心」を取り出す
    const probe = buildBody(pieces, {});
    const com = { x: probe.position.x, y: probe.position.y };
    // 各かけらの頂点を「重心が (0,0)」になる座標に直しておく
    const parts = pieces.map((v) => v.map((p) => ({ x: p.x - com.x, y: p.y - com.y })));
    info.contour = info.contour.map((p) => ({ x: p.x - com.x, y: p.y - com.y }));

    return { img, w, h, com, parts, rough, info };
  }

  // かけら（凸多角形）の配列から Matter.js のボディを作る
  // Bodies.fromVertices と同じことを手作業で行い、かけら同士の位置関係を正確に保つ
  function buildBody(pieces, options) {
    // 重さ（密度）は各かけらに設定し、全体の重さはその合計にする
    const { density = 0.002, ...rest } = options;
    const bodyParts = pieces.map((verts) =>
      Matter.Body.create({
        position: Matter.Vertices.centre(verts),
        vertices: verts,
        density,
      })
    );
    if (bodyParts.length === 1) {
      Matter.Body.set(bodyParts[0], rest);
      return bodyParts[0];
    }
    return Matter.Body.create(Object.assign({ parts: bodyParts }, rest));
  }

  // 形のデータから、指定した位置・角度にボディを作る
  function spawnBody(shape, x, y, angle, options) {
    const pieces = shape.parts.map((v) => v.map((p) => ({ x: p.x + x, y: p.y + y })));
    const body = buildBody(pieces, options || {});
    Matter.Body.setAngle(body, angle);
    body.shape = shape; // 描画のときに使う
    return body;
  }

  // characters.js の1行から、当たり判定の設定（tolerance / smooth / hull）だけを取り出す
  // 書いていない項目は DEFAULTS の値が使われる
  function optionsFrom(c) {
    const options = {};
    for (const key of ["tolerance", "smooth", "hull"]) {
      if (c[key] !== undefined) options[key] = c[key];
    }
    return options;
  }

  return { create, spawnBody, optionsFrom };
})();
