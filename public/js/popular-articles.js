// トップページの「よく読まれている記事」のカードを流し込むための
// 小さなスクリプト。数値と並びは静的生成のタイミングで ga-gas の
// 公開集計から作られる /popular-articles.json を読むだけ（ページ
// 表示のたびに GAS や GA を叩かないので、表示は遅くならない）。
// ファイルが無い・壊れている・取得に失敗した場合は、index.html に
// 書かれたままのカードを表示する。
// この JSON はアクセス解析ではないため、ステージングでも読み込む
// （ステージングでは本番の /popular-articles.json を読む）。
// 記事タイトルは動的コンテンツなので翻訳しないが、注記の型
// （直近N日で…）は UI 文言として i18n.js の言語に従う。
(function () {
  var cards = document.querySelectorAll("#articles .act-list .act");
  if (!cards.length || typeof window.fetch !== "function") return;

  var i18n = window.SiteI18n || null;
  var lastData = null;

  function render() {
    if (!lastData || !Array.isArray(lastData.articles)) return;
    var days = typeof lastData.days === "number" ? lastData.days : 28;
    var locale = i18n ? i18n.locale() : "ja-JP";
    lastData.articles.slice(0, cards.length).forEach(function (article, i) {
      if (
        !article ||
        typeof article.title !== "string" ||
        typeof article.href !== "string" ||
        typeof article.views !== "number" ||
        !isFinite(article.views)
      ) {
        return;
      }
      var card = cards[i];
      card.href = article.href;
      var title = card.querySelector("h3");
      if (title) {
        title.textContent = article.title;
      }
      var note = card.querySelector("p");
      if (note) {
        var views = article.views.toLocaleString(locale);
        note.textContent = i18n
          ? i18n.t("popular.note", { d: days, v: views })
          : "直近" + days + "日で" + views + "回読まれています";
      }
    });
  }

  window
    .fetch("/popular-articles.json")
    .then(function (res) {
      return res && res.ok ? res.json() : null;
    })
    .then(function (data) {
      if (!data) return;
      lastData = data;
      render();
    })
    .catch(function () {
      // カードは静的なままなので、何もしない。
    });
})();
