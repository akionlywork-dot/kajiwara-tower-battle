// =============================================
// rank-titles.js
// ランキングの称号（ランキングの上位の人だけが持てる、特別な称号）
//
// ・シーズンの称号：「シーズン2 フリー 1位」… 終わったシーズンの1〜3位（1位・2位・3位で別の称号）。ずっと持てる
// ・歴代の称号　　：「歴代 競技 2位」… 今の歴代ランキング（全シーズンを通した記録）の1〜3位。順位が下がったら外れる
// ・持てるかどうかは、サーバー（server/ranking.gs の ?awards=1 の ranks）で決まる。ranking.js の checkAwards が、
//   起動するたびに Save.data.rankTitles をサーバーの結果で上書きする（保存データを書きかえても、次に開いたときに戻る）。
//   ランキングに送った称号も、ranking.gs が順位を確かめて、ちがえば空にする（ほかの人のランキングの画面には出ない）
// ・称号の id：シーズンは "rank_s2_free_1"、歴代は "rank_all_free"（歴代は順位が変わっても同じ id で、文字だけ変わる）
// ・見た目：frames.js の champ-1（1位：★6 のような黒×金）・champ-2（2・3位：★5 のような夜空色に虹）。星は付けない。
//   style.css の「ランキングの称号」、リザルトカードの画像は card.js の CHAMP_COLORS
// ・オンライン対戦の相手の画面では、ふつうの札になる（相手の端末では、サーバーで確かめられないため。frames.js の clean が champ を受け付けない）
// ・管理者モードの「ランキングの称号」で、見た目の確認用に付けたり外したりできる
//   （Save.data.rankTitlesTest。管理者モードのあいだだけ持てる。管理者モードの記録は、ランキングに送らない）
// =============================================

const RankTitles = (() => {
  const MODE_LABELS = { free: "フリー", comp: "競技" }; // server/ranking.gs の MODE_LABELS と同じにする
  const PLACES = 3; // 称号がもらえる順位（シーズン・歴代とも1〜3位。ranking.gs の AWARD_PLACES・RANK_TITLE_ALL_PLACES）

  // 届いた称号 { kind, season, mode, place } を正しい形にする（おかしければ null）
  function clean(t) {
    if (!t || typeof t !== "object" || !MODE_LABELS[t.mode]) return null;
    const place = Number(t.place);
    if (!Number.isInteger(place) || place < 1 || place > PLACES) return null;
    if (t.kind === "all") return { kind: "all", mode: t.mode, place };
    const season = Number(t.season);
    if (t.kind === "season" && Number.isInteger(season) && season >= 1 && season <= 999) return { kind: "season", season, mode: t.mode, place };
    return null;
  }

  const idOf = (t) => (t.kind === "all" ? `rank_all_${t.mode}` : `rank_s${t.season}_${t.mode}_${t.place}`);
  const isId = (id) => /^rank_(all|s\d+)_/.test(String(id || ""));

  // 称号の文字（server/ranking.gs の parseRankTitle_ が読める形と同じにする）
  function textOf(t) {
    return t.kind === "all" ? `歴代 ${MODE_LABELS[t.mode]} ${t.place}位` : `シーズン${t.season} ${MODE_LABELS[t.mode]} ${t.place}位`;
  }

  // 枠（frames.js）：1位は champ-1、2・3位は champ-2
  function frameOf(t) {
    return t ? { rank: t.place === 1 ? "champ-1" : "champ-2", event: null, decoration: "star" } : null;
  }

  // 称号の説明（称号を選ぶ画面・管理者モード）
  function descriptionOf(t) {
    return t.kind === "all"
      ? `今の歴代ランキング（${MODE_LABELS[t.mode]}）で${t.place}位（順位が下がると外れます）`
      : `シーズン${t.season}のランキング（${MODE_LABELS[t.mode]}）で${t.place}位`;
  }

  // 持っている称号（サーバーで分かったもの。管理者モードのあいだは、確認用に付けたものも）。
  // 並びは、歴代 → 新しいシーズン → フリー → 競技 → 順位
  function owned() {
    const test = typeof Admin !== "undefined" && Admin.unlocked ? Save.data.rankTitlesTest || [] : [];
    const seen = new Set();
    const out = [];
    for (const t of (Save.data.rankTitles || []).concat(test).map(clean)) {
      if (!t || seen.has(idOf(t))) continue;
      seen.add(idOf(t));
      out.push(t);
    }
    const order = (t) => [t.kind === "all" ? 0 : 1, -(t.season || 0), t.mode === "free" ? 0 : 1, t.place];
    return out.sort((a, b) => {
      const x = order(a), y = order(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    });
  }

  const find = (id) => (isId(id) ? owned().find((t) => idOf(t) === id) || null : null);

  // 称号を選ぶ画面に並べる形（profile.js）
  function list() {
    return owned().map((t) => ({ id: idOf(t), title: textOf(t), rank: "champ", got: true, description: descriptionOf(t) }));
  }

  // 称号の id → 文字・枠（持っていなければ "" / null）
  const text = (id) => {
    const t = find(id);
    return t ? textOf(t) : "";
  };
  const frame = (id) => frameOf(find(id));

  // ランキングの行に付いてきた rankTitle（ranking.gs が確かめたもの）の枠。無い・おかしければ null
  const frameOfServer = (rt) => frameOf(clean(rt));

  // サーバーの結果（?awards=1 の ranks）で、持っている称号を上書きする。変わったら true
  function setFromServer(ranks) {
    const next = (Array.isArray(ranks) ? ranks : []).map(clean).filter(Boolean);
    if (JSON.stringify(next) === JSON.stringify(Save.data.rankTitles || [])) return false;
    Save.data.rankTitles = next;
    Save.write();
    return true;
  }

  // 前のバージョンの、シーズンの順位の実績（「シーズン王者」など。achievements.json の season_free_1 など）からの引っこし。1回だけ：
  //   ・覚えていた順位（Save.data.seasonAwards）を、シーズンの称号にする（サーバーで確かめられるまでのあいだも、称号が消えないように）
  //   ・その実績を称号につけていたら、いちばん新しいシーズンの、同じ順位の称号につけかえる
  function migrate() {
    const meta = Save.data.meta;
    if (meta.rankTitlesMigrated) return;
    meta.rankTitlesMigrated = true;
    const old = (Save.data.seasonAwards || []).map((a) => clean(Object.assign({ kind: "season" }, a))).filter(Boolean);
    if (!(Save.data.rankTitles || []).length) Save.data.rankTitles = old;
    const p = Save.data.profile;
    const m = /^season_(free|comp)_([123])$/.exec(String(p.titleId || ""));
    if (m) {
      const t = owned().filter((x) => x.kind === "season" && x.mode === m[1] && x.place === Number(m[2]))[0]; // 新しいシーズンが先
      p.titleId = t ? idOf(t) : null;
    }
    Save.write();
  }

  return { MODE_LABELS, clean, idOf, isId, textOf, frameOf, descriptionOf, owned, find, list, text, frame, frameOfServer, setFromServer, migrate };
})();
