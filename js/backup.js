// =============================================
// backup.js
// プレイヤー情報のバックアップ（設定画面の「データを書き出す」「データを読み込む」）
//
// 書き出し：プレイデータと設定を1つの JSON ファイルにしてダウンロードする
// 読み込み：ファイルの中身を確認 → 内容を見せて確認ダイアログ → 上書き → 画面を読み込み直す
// =============================================

const Backup = (() => {
  const $ = (id) => document.getElementById(id);

  function init() {
    $("btn-export").addEventListener("click", exportFile);
    $("import-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = ""; // 同じファイルをもう一度選んでも反応するように
      if (file) importFile(file);
    });
  }

  // ---------- 書き出し ----------
  function exportFile() {
    const json = JSON.stringify(Save.exportData(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    // ファイル名に日付を入れる（例：kajiwara-tower-battle-backup-20261026.json）
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    // <a download> をプログラムから押して、ダウンロードさせる
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kajiwara-tower-battle-backup-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    UI.toast("データを書き出しました");
  }

  // ---------- 読み込み ----------
  async function importFile(file) {
    let json;
    try {
      json = JSON.parse(await file.text());
    } catch (e) {
      await UI.alert("ファイルを読み込めませんでした。\nバックアップの JSON ファイルを選んでください。");
      return;
    }
    const checked = Save.checkImport(json);
    if (!checked.ok) {
      await UI.alert(checked.error);
      return;
    }

    // 中身を見せて、上書きしてよいか確認する
    const s = checked.save;
    const date = checked.exportedAt ? new Date(checked.exportedAt) : null;
    const summary =
      "このデータで上書きしますか？\n" +
      `名前：${s.profile.name || "プレイヤー"}\n` +
      `ハイスコア：${s.stats.best ? s.stats.best.score + "点" : "なし"}\n` +
      `図鑑：${Object.keys(s.dex).length}体・実績：${Object.keys(s.achievements).length}個\n` +
      (date && !isNaN(date) ? `書き出した日：${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}\n` : "") +
      "（今のデータは消えます）";
    if (!(await UI.confirm(summary, "上書きする"))) return;

    if (!Save.importData(checked)) {
      await UI.alert("保存できませんでした（端末の保存容量が足りません）。");
      return;
    }
    await UI.alert("読み込みました。画面を読み込み直します。");
    location.reload(); // 読み込んだデータで、すべての画面を作り直す
  }

  return { init, exportFile };
})();
