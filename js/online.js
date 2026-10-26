// =============================================
// online.js
// オンライン対戦の通信（PeerJS / WebRTC）
//
// しくみ：
//   ・部屋を作る側（ホスト）は、6桁のルームコードを作り、それを名前にして
//     PeerJS の仲介サーバーに登録する
//   ・参加する側（ゲスト）は、そのコードを入力して、ホストにつなぐ
//   ・つながったあとのデータは、2台のスマホの間で直接やりとりされる（WebRTC）
//   ・1秒ごとに「生きてるよ」（ping）を送り、6秒届かなければ切断とみなす
//
// このファイルは「つなぐ・送る・受け取る・切れたら知らせる」だけを担当する。
// ゲームのルール（何を送るか、受け取ったらどうするか）は main.js
// =============================================

const Online = (() => {
  const PREFIX = "kajiwara-tb-"; // 仲介サーバーに登録する名前の頭（ほかのアプリとぶつからないように）
  const HEARTBEAT_MS = 1000; // 「生きてるよ」を送る間隔
  const TIMEOUT_MS = 6000; // これだけ相手から何も届かなければ、切断とみなす
  const CONNECT_TIMEOUT_MS = 12000; // 参加するとき、これだけ待ってもつながらなければあきらめる

  let peer = null; // 自分（PeerJS）
  let conn = null; // 相手とのつながり
  let handlers = {}; // { onCode, onConnected, onMessage, onError, onClose }
  let lastSeen = 0; // 最後に相手から何か届いた時刻
  let heartbeat = null;
  let connectTimer = null;
  let active = false; // つながっている（またはつなごうとしている）か

  // ---------- 部屋を作る（ホスト） ----------
  function host(h) {
    reset();
    handlers = h;
    active = true;
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6桁
    peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on("open", () => handlers.onCode && handlers.onCode(code));
    peer.on("connection", (c) => {
      if (conn) {
        c.on("open", () => c.close()); // すでに相手がいる部屋には入れない
        return;
      }
      setup(c);
    });
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") return host(h); // コードがほかの部屋とかぶったら、作り直す
      fail(errorMessage(err));
    });
  }

  // ---------- 部屋に入る（ゲスト） ----------
  function join(code, h) {
    reset();
    handlers = h;
    active = true;
    peer = new Peer({ debug: 0 });
    peer.on("open", () => {
      setup(peer.connect(PREFIX + code, { reliable: true }));
      // ずっとつながらないとき（通信の経路が見つからない環境など）
      connectTimer = setTimeout(() => {
        fail("つながりませんでした。\n同じ Wi-Fi につないで、もう一度試してください。");
      }, CONNECT_TIMEOUT_MS);
    });
    peer.on("error", (err) => fail(errorMessage(err)));
  }

  // 相手とのつながりを準備する（ホスト・ゲスト共通）
  function setup(c) {
    conn = c;
    c.on("open", () => {
      clearTimeout(connectTimer);
      lastSeen = Date.now();
      // 「生きてるよ」を送りつつ、相手からの合図が途切れていないか確かめる
      heartbeat = setInterval(() => {
        send({ t: "ping" });
        if (Date.now() - lastSeen > TIMEOUT_MS) lost();
      }, HEARTBEAT_MS);
      if (handlers.onConnected) handlers.onConnected();
    });
    c.on("data", (msg) => {
      lastSeen = Date.now();
      if (!msg || msg.t === "ping") return;
      if (msg.t === "bye") return lost(); // 相手がやめた
      if (handlers.onMessage) handlers.onMessage(msg);
    });
    c.on("close", lost);
    c.on("error", lost);
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
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
    if (!active) return;
    const h = handlers;
    reset();
    if (h.onError) h.onError(message);
  }

  // 自分からやめる（相手には「bye」を送ってから切る）
  function leave() {
    if (!active) return;
    send({ t: "bye" });
    setTimeout(reset, 100); // bye が届くよう、少し待ってから切る
    active = false;
  }

  // すべて片付ける
  function reset() {
    active = false;
    clearInterval(heartbeat);
    clearTimeout(connectTimer);
    heartbeat = connectTimer = null;
    if (conn) {
      try { conn.close(); } catch (e) {}
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
    }
    conn = peer = null;
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

  return {
    host, join, send, leave,
    get connected() { return !!(conn && conn.open); },
    get active() { return active; },
  };
})();
