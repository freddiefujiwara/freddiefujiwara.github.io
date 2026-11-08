// 「川口の歌」の累計再生回数をヘッダーのナビに出すための小さなスクリプト。
// 数値は静的生成のタイミングで ga-gas の公開集計から作られる
// /music-count.json を読むだけ（ページ表示のたびに GAS や GA を
// 叩かないので、表示は遅くならない）。ファイルが無い・壊れている・
// 取得に失敗した場合は、回数の部分を出さないままにする。
// この JSON はアクセス解析ではないため、ステージングでも読み込む。
(function () {
  var spans = document.querySelectorAll(".music-play-count");
  if (!spans.length || typeof window.fetch !== "function") return;

  window
    .fetch("/music-count.json")
    .then(function (res) {
      return res && res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data || typeof data.count !== "number" || !isFinite(data.count)) {
        return;
      }
      var text = data.count.toLocaleString("ja-JP") + "回再生";
      spans.forEach(function (el) {
        el.textContent = text;
      });
    })
    .catch(function () {
      // 回数が出ないだけなので、何もしない。
    });
})();
