このフォルダに効果音・BGM の音声ファイルを置きます。

置いたら、config.js の sounds にその場所を書いてください。

  sounds: {
    place: "sounds/place.mp3",     … キャラが着地したとき
    fall: "sounds/fall.mp3",       … キャラが土台から落ちたとき
    gameover: "sounds/gameover.mp3", … ゲームオーバー
    record: "sounds/record.mp3",   … ハイスコア更新・対戦の勝利
    click: "sounds/click.mp3",     … メニューのボタンを押したとき
    bgm: "sounds/bgm.mp3",         … BGM（くり返し再生されます）
  },

"" のままの音は、プログラムで作った仮の音が鳴ります。
ファイル名や形式（.mp3 / .wav / .ogg など）は自由です。
