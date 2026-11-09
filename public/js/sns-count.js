// ヒーローの数字（SNS延べフォロワー数と、Instagram の再生回数・
// フォロワー以外％・投稿数）を最新値に差し替えるための小さな
// スクリプト。あわせて、フォロワー数の見出しには集計に含まれて
// いるネットワーク名を、数字ブロックの下の注記には数字全体の
// 時点を差し替える。数値は静的生成のタイミングで ga-gas の
// 公開集計から作られる /sns-count.json を読むだけ（ページ表示の
// たびに GAS を叩かないので、表示は遅くならない）。ファイルが
// 無い・壊れている・取得に失敗した場合は、HTML に書かれた
// 静的な初期値のままにする。項目ごとに独立して差し替えるので、
// JSON に無い項目や数値でない項目は、その数字だけ静的な初期値
// のまま残る。
// この JSON はアクセス解析ではないため、ステージングでも読み込む。
(function () {
  var totalEls = document.querySelectorAll(".sns-follower-total");
  var viewsEls = document.querySelectorAll(".sns-views-30d");
  var viewsUnitEls = document.querySelectorAll(".sns-views-30d-unit");
  var pctEls = document.querySelectorAll(".sns-non-follower-pct");
  var mediaEls = document.querySelectorAll(".sns-media-count");
  var totalLabelEls = document.querySelectorAll(".sns-total-label");
  var dateEls = document.querySelectorAll(".sns-stats-date");
  if (
    !totalEls.length &&
    !viewsEls.length &&
    !pctEls.length &&
    !mediaEls.length &&
    !totalLabelEls.length &&
    !dateEls.length
  ) {
    return;
  }
  if (typeof window.fetch !== "function") return;

  var isNumber = function (value) {
    return typeof value === "number" && isFinite(value);
  };

  // updated_at（ISO文字列）を日本時間の日付「2026年11月9日」に
  // 整える。読めない値なら null を返し、注記は静的なままにする。
  var formatJstDate = function (value) {
    if (typeof value !== "string") return null;
    var date = new Date(value);
    if (isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
    } catch (e) {
      return null;
    }
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

      // フォロワー数の見出しは、合計に含まれている（＝内訳に
      // 数値が入っている）ネットワーク名を列挙した形にする。
      // 内訳が無い・全て数値でない JSON では見出しは静的なまま。
      var breakdown = data.followers_breakdown;
      if (totalLabelEls.length && breakdown && typeof breakdown === "object") {
        var networks = [
          ["instagram", "Instagram"],
          ["youtube", "YouTube"],
          ["threads", "Threads"],
          ["x", "X"],
        ];
        var names = [];
        networks.forEach(function (pair) {
          if (isNumber(breakdown[pair[0]])) {
            names.push(pair[1]);
          }
        });
        if (names.length) {
          var labelText = "SNS（" + names.join("、") + "）延べフォロワー数";
          totalLabelEls.forEach(function (el) {
            el.textContent = labelText;
          });
        }
      }

      // 数字全体の時点の注記。updated_at が読めれば日本時間の
      // 日付に差し替え、無ければ静的な初期値のまま。
      if (dateEls.length) {
        var dateText = formatJstDate(data.updated_at);
        if (dateText) {
          dateEls.forEach(function (el) {
            el.textContent = "数字は" + dateText + "時点";
          });
        }
      }
    })
    .catch(function () {
      // 静的な初期値のままになるだけなので、何もしない。
    });
})();
