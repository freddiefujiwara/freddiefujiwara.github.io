// ヒーローの数字（SNS延べフォロワー数と、Instagram の再生回数・
// 届いた人数・保存数）を最新値に差し替えるための小さな
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
// 見出し・注記・単位は UI 文言として i18n.js の言語に従う（数値
// 自体は動的コンテンツなので翻訳しない）。
(function () {
  var totalEls = document.querySelectorAll(".sns-follower-total");
  var viewsEls = document.querySelectorAll(".sns-views-30d");
  var viewsUnitEls = document.querySelectorAll(".sns-views-30d-unit");
  var reachEls = document.querySelectorAll(".sns-reach-30d");
  var reachUnitEls = document.querySelectorAll(".sns-reach-30d-unit");
  var savesEls = document.querySelectorAll(".sns-saves-30d");
  var totalLabelEls = document.querySelectorAll(".sns-total-label");
  var dateEls = document.querySelectorAll(".sns-stats-date");
  if (
    !totalEls.length &&
    !viewsEls.length &&
    !reachEls.length &&
    !savesEls.length &&
    !totalLabelEls.length &&
    !dateEls.length
  ) {
    return;
  }
  if (typeof window.fetch !== "function") return;

  var i18n = window.SiteI18n || null;
  var lastData = null;

  var isNumber = function (value) {
    return typeof value === "number" && isFinite(value);
  };

  var lang = function () {
    return i18n ? i18n.getLang() : "ja";
  };
  var locale = function () {
    return i18n ? i18n.locale() : "ja-JP";
  };

  // updated_at（ISO文字列）を日本時間の日付に整える。表示言語の
  // 書式（日本語なら「2026年11月9日」）にし、読めない値なら
  // null を返して注記は静的なままにする。
  var formatJstDate = function (value) {
    if (typeof value !== "string") return null;
    var date = new Date(value);
    if (isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(locale(), {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
    } catch (e) {
      return null;
    }
  };

  // 英語の大きな再生回数を 800K / 1.2M の形に丸める。
  var compactEn = function (value) {
    if (value >= 1000000) {
      var m = Math.round((value / 1000000) * 10) / 10;
      return (m % 1 === 0 ? String(Math.round(m)) : String(m)) + "M";
    }
    return Math.round(value / 1000) + "K";
  };

  function render() {
    var data = lastData;
    if (!data) return;

    if (isNumber(data.total)) {
      var totalText = data.total.toLocaleString(locale());
      totalEls.forEach(function (el) {
        el.textContent = totalText;
      });
    }

    // 再生回数は言語ごとに丸め方が違う。日本語・中国語は万単位に
    // 丸めて「約N万回／约N万次」、1万未満なら実数＋「回／次」。
    // 英語は「≈800K views」の形にする（単位側の要素も一緒に差し替える）。
    if (isNumber(data.views_30d)) {
      var viewsText;
      var viewsUnit;
      var l = lang();
      if (l === "en") {
        viewsUnit = "views";
        viewsText =
          data.views_30d >= 10000
            ? "≈" + compactEn(data.views_30d)
            : Math.round(data.views_30d).toLocaleString(locale());
      } else if (data.views_30d >= 10000) {
        viewsText = (l === "zh" ? "约" : "約") + Math.round(data.views_30d / 10000);
        viewsUnit = l === "zh" ? "万次" : "万回";
      } else {
        viewsText = Math.round(data.views_30d).toLocaleString(locale());
        viewsUnit = l === "zh" ? "次" : "回";
      }
      viewsEls.forEach(function (el) {
        el.textContent = viewsText;
      });
      viewsUnitEls.forEach(function (el) {
        el.textContent = viewsUnit;
      });
    }

    // 届いた人数も再生回数と同じ丸め方にする。日本語・中国語は
    // 万単位に丸めて「約N万人」、1万未満なら実数＋「人」。
    // 英語は「≈132K people」の形にする（単位側の要素も一緒に差し替える）。
    if (isNumber(data.reach_30d)) {
      var reachText;
      var reachUnit;
      var rl = lang();
      if (rl === "en") {
        reachUnit = "people";
        reachText =
          data.reach_30d >= 10000
            ? "≈" + compactEn(data.reach_30d)
            : Math.round(data.reach_30d).toLocaleString(locale());
      } else if (data.reach_30d >= 10000) {
        reachText = (rl === "zh" ? "约" : "約") + Math.round(data.reach_30d / 10000);
        reachUnit = "万人";
      } else {
        reachText = Math.round(data.reach_30d).toLocaleString(locale());
        reachUnit = "人";
      }
      reachEls.forEach(function (el) {
        el.textContent = reachText;
      });
      reachUnitEls.forEach(function (el) {
        el.textContent = reachUnit;
      });
    }

    if (isNumber(data.saves_30d)) {
      var savesText = data.saves_30d.toLocaleString(locale());
      savesEls.forEach(function (el) {
        el.textContent = savesText;
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
        var joined = names.join(lang() === "en" ? ", " : "、");
        var labelText = i18n
          ? i18n.t("sns.totalLabel", { names: joined })
          : "SNS（" + joined + "）延べフォロワー数";
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
        var noteText = i18n
          ? i18n.t("sns.asOf", { date: dateText })
          : "数字は" + dateText + "時点";
        dateEls.forEach(function (el) {
          el.textContent = noteText;
        });
      }
    }
  }

  window
    .fetch("/sns-count.json")
    .then(function (res) {
      return res && res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data) return;
      lastData = data;
      render();
    })
    .catch(function () {
      // 静的な初期値のままになるだけなので、何もしない。
    });
})();
