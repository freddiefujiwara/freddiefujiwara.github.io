// ヒーローの数字（SNS延べフォロワー数と、Instagram の再生回数・
// フォロワー以外％・投稿数）を最新値に差し替えるための小さな
// スクリプト。数値は静的生成のタイミングで ga-gas の公開集計から
// 作られる /sns-count.json を読むだけ（ページ表示のたびに GAS を
// 叩かないので、表示は遅くならない）。ファイルが無い・壊れている・
// 取得に失敗した場合は、HTML に書かれた静的な初期値のままにする。
// 項目ごとに独立して差し替えるので、JSON に無い項目や数値でない
// 項目は、その数字だけ静的な初期値のまま残る。
// この JSON はアクセス解析ではないため、ステージングでも読み込む。
(function () {
  var totalEls = document.querySelectorAll(".sns-follower-total");
  var viewsEls = document.querySelectorAll(".sns-views-30d");
  var viewsUnitEls = document.querySelectorAll(".sns-views-30d-unit");
  var pctEls = document.querySelectorAll(".sns-non-follower-pct");
  var mediaEls = document.querySelectorAll(".sns-media-count");
  if (
    !totalEls.length &&
    !viewsEls.length &&
    !pctEls.length &&
    !mediaEls.length
  ) {
    return;
  }
  if (typeof window.fetch !== "function") return;

  var isNumber = function (value) {
    return typeof value === "number" && isFinite(value);
  };

  window
    .fetch("/sns-count.json")
    .then(function (res) {
      return res && res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data) return;

      if (isNumber(data.total)) {
        var totalText = data.total.toLocaleString("ja-JP");
        totalEls.forEach(function (el) {
          el.textContent = totalText;
        });
      }

      // 再生回数は万単位に丸めて「約N万回」にする。1万未満なら
      // 実数＋「回」に切り替える（単位側の要素も一緒に差し替える）。
      if (isNumber(data.views_30d)) {
        var viewsText;
        var viewsUnit;
        if (data.views_30d >= 10000) {
          viewsText = "約" + Math.round(data.views_30d / 10000);
          viewsUnit = "万回";
        } else {
          viewsText = Math.round(data.views_30d).toLocaleString("ja-JP");
          viewsUnit = "回";
        }
        viewsEls.forEach(function (el) {
          el.textContent = viewsText;
        });
        viewsUnitEls.forEach(function (el) {
          el.textContent = viewsUnit;
        });
      }

      if (isNumber(data.non_follower_pct)) {
        var pctText = data.non_follower_pct.toFixed(1);
        pctEls.forEach(function (el) {
          el.textContent = pctText;
        });
      }

      if (isNumber(data.media_count)) {
        var mediaText = data.media_count.toLocaleString("ja-JP");
        mediaEls.forEach(function (el) {
          el.textContent = mediaText;
        });
      }
    })
    .catch(function () {
      // 静的な初期値のままになるだけなので、何もしない。
    });
})();
