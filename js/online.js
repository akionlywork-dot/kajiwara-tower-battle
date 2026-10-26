// =============================================
// online.js
// オンライン対戦の通信
//
// つなぎ方は2種類。どちらでつながっても、ゲーム側（main.js）からの使い方は同じ。
//   1. 直接（direct）：PeerJS / WebRTC で2台のスマホを直接つなぐ。速い。
//      ただし Wi-Fi のルーターの設定などによっては、直接つながらないことがある
//   2. 中継（relay）：公開のメッセージ中継サーバー（MQTT）を通してやりとりする。
//      少し遅いが、ふつうにインターネットが使える場所なら、ほぼつながる
//
// 流れ：
//   ・部屋を作る側（ホスト）：6桁のルームコードを作り、直接・中継の両方で参加を待つ
//   ・参加する側（ゲスト）　：まず直接つなぐ。数秒でつながらなければ中継で参加する
//   ・先につながった方を使い、もう一方は閉じる
//   ・1秒ごとに「生きてるよ」（ping）を送り、6秒届かなければ切断とみなす
//
// このファイルは「つなぐ・送る・受け取る・切れたら知らせる」だけを担当する。
// ゲームのルール（何を送るか、受け取ったらどうするか）は main.js
// =============================================

const Online = (() => {
  const CONF = () => window.GAME_CONFIG.online || {};
  const PREFIX = "kajiwara-tb-"; // 直接：仲介サーバーに登録する名前の頭
  const TOPIC = "kajiwara-tb/v1/"; // 中継：メッセージの宛先（topic）の頭
  const HEARTBEAT_MS = 1000; // 「生きてるよ」を送る間隔
  const TIMEOUT_MS = 6000; // これだけ相手から何も届かなければ、切断とみなす
  const CONNECT_TIMEOUT_MS = 25000; // 参加するとき、これだけ待ってもつながらなければあきらめる

  let handlers = {}; // { onCode, onConnected, onMessage, onError, onClose }
  let active = false; // つながっている（またはつなごうとしている）か
  let link = null; // 使っている通り道 { kind: "direct"|"relay", send(msg), close() }
  let peer = null; // 直接：自分（PeerJS）
  let relay = null; // 中継：MQTT のつながり
  let mySid = ""; // 中継：自分の番号（ほかの人のメッセージと区別するため）
  let lastSeen = 0;
  let heartbeat = null;
  let timers = [];
  let tried = { direct: false, relay: false }; // ゲスト：どちらを試したか
  let failed = { direct: false, relay: false }; // どちらが失敗したか

  // ---------- 部屋を作る（ホスト） ----------
  function host(h) {
    reset();
    handlers = h;
    active = true;
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6桁
    let codeShown = false;
    const showCode = () => {
      if (!codeShown && handlers.onCode) handlers.onCode(code);
      codeShown = true;
    };

    // 直接：コードを名前にして仲介サーバーに登録し、つないでくるのを待つ
    if (CONF().useDirect !== false) {
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on("open", showCode);
      peer.on("connection", (c) => {
        c.on("open", () => attach(directLink(c), c));
      });
      peer.on("error", (err) => {
        if (err.type === "unavailable-id") return host(h); // コードがほかの部屋とかぶったら、作り直す
        if (!link) bothFailed("direct", errorMessage(err));
      });
    } else failed.direct = true;

    // 中継：コードの宛先で、参加の申しこみを待つ
    connectRelay(
      (client) => {
        showCode();
        client.subscribe(TOPIC + code + "/g2h");
        client.on("message", (topic, payload) => {
          const env = parse(payload);
          if (!env) return;
          if (env.m && env.m.t === "join") {
            // 参加の申しこみ。まだ相手がいなければ受け付ける（いれば満員と返す）
            const ok = !link;
            client.publish(TOPIC + code + "/h2g", JSON.stringify({ sid: env.sid, m: { t: ok ? "accept" : "full" } }));
            if (ok) attach(relayLink(client, TOPIC + code + "/h2g", env.sid), null);
            return;
          }
          if (link && link.kind === "relay" && env.sid === link.peerSid) deliver(env.m);
        });
      },
      () => bothFailed("relay", "サーバーに接続できません。\n通信できる場所で、もう一度試してください。")
    );
  }

  // ---------- 部屋に入る（ゲスト） ----------
  function join(code, h) {
    reset();
    handlers = h;
    active = true;
    // まず直接つなぐ。directTimeout 秒でつながらなければ、中継も試す
    if (CONF().useDirect !== false) {
      tried.direct = true;
      peer = new Peer({ debug: 0 });
      peer.on("open", () => {
        const c = peer.connect(PREFIX + code, { reliable: true });
        c.on("open", () => attach(directLink(c), c));
      });
      // 部屋が見つからない・仲介サーバーにつながらない → すぐ中継を試す
      peer.on("error", (err) => {
        if (link) return;
        failed.direct = true;
        failed.directMessage = errorMessage(err);
        joinRelay(code);
      });
      timers.push(setTimeout(() => joinRelay(code), (CONF().directTimeout || 6) * 1000));
    } else {
      failed.direct = true;
      joinRelay(code);
    }
    // どちらでもつながらないまま時間切れ
    timers.push(
      setTimeout(() => fail("つながりませんでした。\n通信できる場所で、もう一度試してください。"), CONNECT_TIMEOUT_MS)
    );
  }

  // ゲスト：中継で参加する（参加の申しこみを、返事が来るまで送り続ける）
  function joinRelay(code) {
    if (link || tried.relay || !active) return;
    tried.relay = true;
    if (handlers.onStatus) handlers.onStatus("中継サーバー経由でつないでいます…");
    connectRelay(
      (client) => {
        client.subscribe(TOPIC + code + "/h2g");
        const ask = () => client.publish(TOPIC + code + "/g2h", JSON.stringify({ sid: mySid, m: { t: "join" } }));
        ask();
        const askTimer = setInterval(() => (link ? clearInterval(askTimer) : ask()), 1500);
        timers.push(askTimer);
        // 中継で8秒たっても返事がない ＝ その部屋は無い
        timers.push(
          setTimeout(() => {
            if (!link) fail(failed.directMessage && !/部屋/.test(failed.directMessage) ? failed.directMessage : "部屋が見つかりません。\nルームコードを確認してください。");
          }, 8000)
        );
        client.on("message", (topic, payload) => {
          const env = parse(payload);
          if (!env || env.sid !== mySid) return; // 自分あてのメッセージだけ
          if (env.m.t === "accept") {
            if (!link) attach(relayLink(client, TOPIC + code + "/g2h", mySid), null);
          } else if (env.m.t === "full") {
            fail("その部屋はもう対戦中です。");
          } else if (link && link.kind === "relay") {
            deliver(env.m);
          }
        });
      },
      () => {
        failed.relay = true;
        if (failed.direct) fail(failed.directMessage || "サーバーに接続できません。\n通信できる場所で、もう一度試してください。");
      }
    );
  }

  // ---------- 通り道 ----------
  // 直接（PeerJS のつながり）
  function directLink(c) {
    return {
      kind: "direct",
      send: (msg) => c.open && c.send(msg),
      close: () => {
        try { c.close(); } catch (e) {}
      },
    };
  }

  // 中継（MQTT）：自分の番号をつけて、相手の宛先に送る
  function relayLink(client, sendTopic, peerSid) {
    return {
      kind: "relay",
      peerSid, // ホストから見た、ゲストの番号
      // 番号はいつも「ゲストの番号」。ホストはゲストあてに、ゲストは自分の番号をつけて送る
      send: (msg) => client.connected && client.publish(sendTopic, JSON.stringify({ sid: peerSid, m: msg })),
      close: () => {},
    };
  }

  // 中継サーバーにつなぐ（config.js の relayBrokers を上から順に試す）
  function connectRelay(onReady, onFail) {
    if (typeof mqtt === "undefined") return onFail();
    const brokers = CONF().relayBrokers || [];
    let i = 0;
    const tryNext = () => {
      if (!active) return;
      if (i >= brokers.length) return onFail();
      const client = mqtt.connect(brokers[i++], { connectTimeout: 6000, reconnectPeriod: 0, clean: true });
      let ok = false;
      let gaveUp = false;
      client.on("connect", () => {
        if (!active) return closeRelay(client);
        ok = true;
        relay = client;
        onReady(client);
      });
      const bad = () => {
        if (client.closedByMe || gaveUp) return; // 自分で閉じた・もうあきらめた
        if (ok) return lost(); // つながったあとで切れた
        gaveUp = true; // エラーと切断の知らせが両方来ても、次を試すのは1回だけ
        closeRelay(client);
        tryNext(); // つながらなかった → 次のサーバー
      };
      client.on("error", bad);
      client.on("close", bad);
    };
    tryNext();
  }

  // 中継サーバーとのつながりを、自分から閉じる（切断の知らせとして扱わないように印をつける）
  function closeRelay(client) {
    client.closedByMe = true;
    try { client.end(true); } catch (e) {}
  }

  // ---------- つながった ----------
  // 先につながった通り道を使い、もう一方は閉じる
  function attach(newLink, peerConn) {
    if (!active) return newLink.close();
    if (link) {
      if (newLink.kind !== link.kind) newLink.close(); // 2つ目の通り道はいらない
      return;
    }
    link = newLink;
    timers.forEach((t) => clearTimeout(t) || clearInterval(t));
    timers = [];
    if (link.kind === "direct") {
      // 直接つながったので、中継は閉じる
      if (relay) {
        closeRelay(relay);
        relay = null;
      }
      peerConn.on("data", deliver);
      peerConn.on("close", lost);
      peerConn.on("error", lost);
    } else if (peer) {
      // 中継でつながったので、直接は閉じる
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
    lastSeen = Date.now();
    // 「生きてるよ」を送りつつ、相手からの合図が途切れていないか確かめる
    heartbeat = setInterval(() => {
      send({ t: "ping" });
      if (Date.now() - lastSeen > TIMEOUT_MS) lost();
    }, HEARTBEAT_MS);
    if (handlers.onConnected) handlers.onConnected(link.kind);
  }

  // 相手から届いたメッセージ
  function deliver(msg) {
    lastSeen = Date.now();
    if (!msg || msg.t === "ping") return;
    if (msg.t === "bye") return lost(); // 相手がやめた
    if (handlers.onMessage) handlers.onMessage(msg);
  }

  function send(msg) {
    if (link) link.send(msg);
  }

  function parse(payload) {
    try {
      const env = JSON.parse(String(payload));
      return env && typeof env === "object" && env.m ? env : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- うまくいかなかった・終わった ----------
  // ホスト：直接と中継の両方とも準備できなかった
  function bothFailed(kind, message) {
    failed[kind] = true;
    if (failed.direct && failed.relay) fail(message);
  }

  // つながったあとで切れた
  function lost() {
    if (!active) return;
    const h = handlers;
    reset();
    if (h.onClose) h.onClose();
  }

  // つなぐ途中で失敗した
  function fail(message) {
    if (!active || link) return;
    const h = handlers;
    reset();
    if (h.onError) h.onError(message);
  }

  // 自分からやめる（相手には「bye」を送ってから切る）
  function leave() {
    if (!active) return;
    send({ t: "bye" });
    active = false;
    setTimeout(reset, 200); // bye が届くよう、少し待ってから切る
  }

  // すべて片付ける
  function reset() {
    active = false;
    clearInterval(heartbeat);
    timers.forEach((t) => clearTimeout(t) || clearInterval(t));
    heartbeat = null;
    timers = [];
    if (link) link.close();
    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }
    if (relay) {
      closeRelay(relay);
    }
    link = peer = relay = null;
    mySid = Math.random().toString(36).slice(2, 10);
    tried = { direct: false, relay: false };
    failed = { direct: false, relay: false };
    handlers = {};
  }

  // PeerJS のエラーを、分かりやすい日本語にする
  function errorMessage(err) {
    switch (err.type) {
      case "peer-unavailable":
        return "部屋が見つかりません。\nルームコードを確認してください。";
      case "browser-incompatible":
        return "このブラウザはオンライン対戦に対応していません。";
      case "network":
      case "server-error":
      case "socket-error":
      case "socket-closed":
        return "サーバーに接続できません。\n通信できる場所で、もう一度試してください。";
      default:
        return "接続できませんでした。\nもう一度試してください。";
    }
  }

  reset(); // mySid を作っておく

  return {
    host, join, send, leave,
    get active() { return active; },
    get kind() { return link ? link.kind : null; }, // "direct" / "relay" / null
  };
})();
