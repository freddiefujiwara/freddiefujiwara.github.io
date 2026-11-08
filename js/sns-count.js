// ヒーローの「SNS延べフォロワー数」を最新値に差し替えるための
// 小さなスクリプト。数値は静的生成のタイミングで ga-gas の公開
// 集計から作られる /sns-count.json を読むだけ（ページ表示のたび
// に GAS を叩かないので、表示は遅くならない）。ファイルが無い・
// 壊れている・取得に失敗した場合は、HTML に書かれた静的な初期値
// のままにする。
// この JSON はアクセス解析ではないため、ステージングでも読み込む。
(function () {
  var els = document.querySelectorAll(".sns-follower-total");
  if (!els.length || typeof window.fetch !== "function") return;

  window
    .fetch("/sns-count.json")
    .then(function (res) {
      return res && res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data || typeof data.total !== "number" || !isFinite(data.total)) {
        return;
      }
      var text = data.total.toLocaleString("ja-JP");
      els.forEach(function (el) {
        el.textContent = text;
      });
    })
    .catch(function () {
      // 静的な初期値のままになるだけなので、何もしない。
    });
})();
