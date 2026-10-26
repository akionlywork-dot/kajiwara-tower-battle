// =============================================
// audio.js
// 効果音とBGM
//
// 使う音声ファイルは config.js の sounds に書きます。
// 書いていない音は、プログラムで作った仮の音（ピコピコ音）が鳴ります。
// =============================================

const SOUND_FILES = window.GAME_CONFIG.sounds || {};

const Sound = (() => {
  let ctx = null; // Web Audio の本体。最初のタップのあとで作る
  let seGain = null; // 効果音の音量
  let bgmGain = null; // BGM の音量
  const buffers = {}; // 読み込めた音声ファイル
  let seOn = true; // 効果音 ON/OFF
  let bgmOn = true; // BGM ON/OFF
  let bgmWanted = false; // ゲームとして BGM を鳴らしたい場面か
  let bgmSource = null; // ファイルの BGM を再生中のもの
  let synthTimer = null; // 仮BGM のタイマー

  const BGM_VOLUME = 0.35;

  // ---------- 最初のタップで音を使えるようにする ----------
  // スマホのブラウザは、ユーザーが画面をさわるまで音を出させてくれない。
  // そこで、最初のタップの中で AudioContext を作って「再開」する。
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      seGain = ctx.createGain();
      seGain.gain.value = seOn ? 1 : 0;
      seGain.connect(ctx.destination);
      bgmGain = ctx.createGain();
      bgmGain.gain.value = bgmOn ? BGM_VOLUME : 0;
      bgmGain.connect(ctx.destination);
      loadFiles();
    }
    if (ctx.state === "suspended") ctx.resume();
    // iOS 対策：無音を一瞬鳴らすと、その後の音が確実に鳴るようになる
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    updateBgm();
  }

  // config.js に書いた音声ファイルを読み込む（書いていない音は、仮の音を使う）
  async function loadFiles() {
    for (const [name, path] of Object.entries(SOUND_FILES)) {
      if (!path) continue; // "" のものは読みに行かない
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(res.status);
        const data = await res.arrayBuffer();
        buffers[name] = await ctx.decodeAudioData(data);
        // BGM ファイルが後から読み込めたら、仮BGM と入れかえる
        if (name === "bgm" && (bgmSource || synthTimer)) {
          stopPlayback();
          updateBgm();
        }
      } catch (e) {
        // 読めなかったときは仮の音を使う（書いた場所が間違っていないか確認できるように知らせる）
        console.warn("音声ファイルを読み込めませんでした:", path);
      }
    }
  }

  // ---------- 効果音 ----------
  function play(name) {
    if (!ctx || !seOn) return;
    if (buffers[name]) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.connect(seGain);
      src.start();
      return;
    }
    // ファイルが無いときの仮の音
    const t = ctx.currentTime;
    if (name === "place") {
      // ポコッ
      const f = 220 + Math.random() * 120;
      tone("sine", f * 1.6, f, t, 0.12, 0.5, seGain);
    } else if (name === "fall") {
      // ヒューッ（高い音から低い音へ）
      tone("triangle", 900, 120, t, 0.7, 0.35, seGain);
    } else if (name === "gameover") {
      // テッテッテー（下がっていく3音）
      [523, 392, 262].forEach((f, i) => tone("square", f, f, t + i * 0.2, i === 2 ? 0.5 : 0.18, 0.12, seGain));
    } else if (name === "click") {
      // ボタンを押したときのプッ
      tone("sine", 660, 520, t, 0.06, 0.25, seGain);
    } else if (name === "record") {
      // ハイスコア更新のファンファーレ
      [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, t + i * 0.12, i === 3 ? 0.6 : 0.14, 0.25, seGain));
    }
  }

  // 1つの音を鳴らす（波の形・始まりの高さ・終わりの高さ・開始時刻・長さ・音量・出力先）
  function tone(type, f1, f2, start, dur, vol, out) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, start);
    osc.frequency.exponentialRampToValueAtTime(f2, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur); // だんだん小さく
    osc.connect(g);
    g.connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  // ---------- BGM ----------
  // ゲーム側から「BGM を鳴らしたい／止めたい」を伝える
  function startBgm() {
    bgmWanted = true;
    updateBgm();
  }

  function stopBgm() {
    bgmWanted = false;
    updateBgm();
  }

  // 「鳴らしたい場面か」と「設定で ON か」の両方を見て、再生・停止を決める
  function updateBgm() {
    const shouldPlay = ctx && bgmWanted && bgmOn;
    const playing = bgmSource || synthTimer;
    if (shouldPlay && !playing) {
      if (buffers.bgm) {
        bgmSource = ctx.createBufferSource();
        bgmSource.buffer = buffers.bgm;
        bgmSource.loop = true;
        bgmSource.connect(bgmGain);
        bgmSource.start();
      } else {
        startSynthBgm();
      }
    } else if (!shouldPlay && playing) {
      stopPlayback();
    }
  }

  function stopPlayback() {
    if (bgmSource) {
      bgmSource.stop();
      bgmSource = null;
    }
    if (synthTimer) {
      clearInterval(synthTimer);
      synthTimer = null;
    }
  }

  // 仮BGM：のんびりしたメロディをくり返す
  function startSynthBgm() {
    const BEAT = 0.25; // 1音の長さ（秒）
    // 数字はドレミ（C4=262Hz を基準にした半音の数）。-1 は休み
    const melody = [0, 4, 7, 4, 9, 7, 4, 0, 2, 4, 7, 9, 7, 4, 2, -1,
                    0, 4, 7, 12, 9, 7, 4, 2, 4, 2, 0, -3, 0, -1, -1, -1];
    const bass = [-12, -12, -5, -5, -15, -15, -8, -8];
    let step = 0;
    let nextTime = ctx.currentTime + 0.1;
    // 少し先の分までまとめて予約しておく（タイマーのズレで音がもたつかないように）
    synthTimer = setInterval(() => {
      // 裏に回っていた間の分は、まとめて鳴らさずに飛ばす
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
      while (nextTime < ctx.currentTime + 0.3) {
        const n = melody[step % melody.length];
        if (n !== -1) tone("triangle", note(n), note(n), nextTime, BEAT * 0.9, 0.18, bgmGain);
        if (step % 4 === 0) {
          const b = bass[(step / 4) % bass.length];
          tone("sine", note(b), note(b), nextTime, BEAT * 3.5, 0.3, bgmGain);
        }
        nextTime += BEAT;
        step++;
      }
    }, 100);
  }

  // 半音の数 → 周波数
  function note(n) {
    return 261.63 * Math.pow(2, n / 12);
  }

  // ---------- ON/OFF（設定画面から呼ばれる） ----------
  function setSeEnabled(on) {
    seOn = on;
    if (seGain) seGain.gain.value = on ? 1 : 0;
  }

  function setBgmEnabled(on) {
    bgmOn = on;
    if (bgmGain) bgmGain.gain.value = on ? BGM_VOLUME : 0;
    updateBgm();
  }

  // アプリが裏に回ったら音を止める（戻ったら再開）
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  return { unlock, play, startBgm, stopBgm, setSeEnabled, setBgmEnabled };
})();
