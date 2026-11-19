// ============================================================
//  cultlog の設定ファイル
//  ジャンルの追加・入力欄の追加・サイト名の変更は、ここだけで行えます。
//  書き方のルール(間違えると画面が初期設定に戻ります):
//    ・項目と項目の間は、カンマ ( , ) で区切る
//    ・文字は、'シングルクォート' で囲む
//    ・{ } と [ ] は、開いたら必ず閉じる
//  詳しくは「運用マニュアル」を見てください。
// ============================================================
window.CULTLOG_SETTINGS = {

  // ---- サイトの名前(画面左上、ブラウザのタブ、フッターに出ます)----
  siteName: 'cultlog',

  // ---- ジャンル(書いた順番が、画面に並ぶ順番です)----
  //  id    : 記録に保存される名前。半角英数字(a〜z, 0〜9, _ , -)。
  //          ★作ったあとで変えないこと。変えると、過去の記録とのつながりが切れます。
  //  label : 画面に出る名前。いつでも自由に変えられます。
  //  shape : 目印の形。次のどれか →
  //          circle(円) / tall(縦長) / leaf(葉) / bowl(半円) / star(星)
  //          square(四角) / triangle(三角) / diamond(ひし形) / heart(ハート)
  //  titlePh, subEn, subJa, subPh, memoPh : 入力欄の見出しとヒント文字
  categories: [
    { id: 'movie', label: '映画',   shape: 'circle', titlePh: '映画のタイトル',       subEn: 'Director', subJa: '監督',         subPh: '監督名',               memoPh: 'ひとこと感想' },
    { id: 'book',  label: '本',     shape: 'tall',   titlePh: '本のタイトル',         subEn: 'Author',   subJa: '著者',         subPh: '著者名',               memoPh: 'ひとこと感想' },
    { id: 'art',   label: '美術',   shape: 'leaf',   titlePh: '展覧会・作品名',       subEn: 'Artist',   subJa: 'アーティスト', subPh: 'アーティスト名・会場', memoPh: 'ひとこと感想' },
    { id: 'cafe',  label: '喫茶店', shape: 'bowl',   titlePh: '店名',                 subEn: 'Area',     subJa: 'エリア',       subPh: 'エリア・最寄り駅など', memoPh: '頼んだメニュー・雰囲気など' },
    { id: 'live',  label: 'ライブ', shape: 'star',   titlePh: '公演・アーティスト名', subEn: 'Venue',    subJa: '会場',         subPh: '会場・ステージ名',     memoPh: 'セットリスト・感想など' }
  ],

  // ---- 追加の入力欄(「メモ」の上に並びます。いまは何もありません)----
  //  先頭の // を消すと有効になります。例を2つ用意してあります。
  //  id   : 半角英数字。作ったあとで変えないこと。
  //  type : 'text'(1行の文字) か 'select'(選択式)
  extraFields: [
    // { id: 'rating', en: 'Rating', ja: '評価', type: 'select', options: ['★★★★★', '★★★★', '★★★', '★★', '★'] },
    // { id: 'with',   en: 'With',   ja: '一緒に', type: 'text', placeholder: '誰と行ったか' }
  ]
};
