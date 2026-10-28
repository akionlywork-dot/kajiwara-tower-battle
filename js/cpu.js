// =============================================
// cpu.js
// CPU対戦：CPU が置く位置と回転を考える（強さの数値は config.js の cpu）
//
// 考え方：
//   1. 置き方の候補を作る（塔のてっぺん付近の7か所 × 角度8通り＝最大56通り）
//   2. 候補を1つずつ、裏の「試し用の世界」で実際に落としてみる（Game.evaluatePlacement）
//   3. 落ちない置き方のうち、着地後にずれない・回らない・塔をぐらつかせない・重心が低いものほど高い点数
//   4. 強さに合わせて選ぶ（つよい＝一番良いもの / ふつう＝上位から / よわい＝落ちないものから適当に）
// =============================================

const CPU = (() => {
  const ANGLE_STEPS = 8; // 45度ずつ、8通り

  // 置き方の点数（大きいほど良い）
  function scoreOf(r) {
    if (!r || r.fell) return -Infinity;
    return -r.turn * 200 - r.drift * 1.5 - r.towerMove * 2 - r.centerGap * 0.4 + r.restY * 0.3;
  }

  // 次の描画まで待つ（計算を少しずつ区切って、画面が固まらないようにする）
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

  // 置き方を考える。{ x, steps（何回 45度回すか）, flip（反転するか） } を返す
  // isCancelled: ゲームが終わったなどで、考えるのをやめるときに true を返す関数
  async function think(level, isCancelled) {
    const p = window.GAME_CONFIG.cpu[level];
    const startedAt = performance.now();

    // 1. 候補を作って、ばらばらに並べかえ、強さに合わせた数だけ使う
    const candidates = [];
    // 反転（左右を入れかえる）した置き方も候補に入れる
    for (const x of Game.candidateXs()) {
      for (let steps = 0; steps < ANGLE_STEPS; steps++) {
        for (const flip of [false, true]) candidates.push({ x, steps, flip });
      }
    }
    shuffle(candidates);
    const tries = candidates.slice(0, p.candidates);

    // 2. 1つずつ試す。maxThink 秒を過ぎたら、それまでに試した中から選ぶ
    //（スマホは計算が遅いので、待たせすぎないように）
    const results = [];
    for (const c of tries) {
      if (isCancelled()) return null;
      if (results.length && performance.now() - startedAt > p.maxThink * 1000) break;
      const r = Game.evaluatePlacement(c.x, (c.steps * Math.PI) / 4, c.flip);
      results.push({ x: r ? r.x : c.x, steps: c.steps, flip: c.flip, score: scoreOf(r) });
      await nextFrame();
    }

    // 3. 強さに合わせて選ぶ
    const ok = results.filter((r) => r.score > -Infinity).sort((a, b) => b.score - a.score);
    let pick;
    if (!ok.length) pick = results[Math.floor(Math.random() * results.length)]; // どれも落ちるなら、あきらめて適当に
    else if (p.choice === "best") pick = ok[0];
    else if (p.choice === "top") pick = ok[Math.floor(Math.random() * Math.min(3, ok.length))];
    else pick = ok[Math.floor(Math.random() * ok.length)];

    // 狙いのずれ（よわいほど大きい）
    const x = pick.x + (Math.random() * 2 - 1) * p.noise;

    // 4. 計算が早く終わっても、決まった時間は「考え中」にする
    const rest = p.thinkTime * 1000 - (performance.now() - startedAt);
    if (rest > 0) await new Promise((resolve) => setTimeout(resolve, rest));
    return { x, steps: pick.steps, flip: pick.flip };
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  return { think };
})();
