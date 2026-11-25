// トップページの「よく読まれている記事」のカードと、その下の
// シリーズ一覧を流し込むための小さなスクリプト。数値と並びは
// 静的生成のタイミングで ga-gas の公開集計から作られる
// /popular-articles.json を読むだけ（ページ表示のたびに GAS や
// GA を叩かないので、表示は遅くならない）。
// ファイルが無い・壊れている・取得に失敗した場合は、index.html に
// 書かれたままのカードと一覧を表示する。
// この JSON はアクセス解析ではないため、ステージングでも読み込む
// （ステージングでは本番の /popular-articles.json を読む）。
// 記事タイトルは、JSON に翻訳（title_en / title_zh）があれば
// ページの言語で出し、無ければ日本語のままにする。注記の型
// （直近N日で…）は UI 文言として i18n.js の言語に従う。
(function () {
  var cards = document.querySelectorAll("#articles .act-list .act");
  var seriesList = document.querySelector("#articles .series-list");
  if (!cards.length || typeof window.fetch !== "function") return;

  var i18n = window.SiteI18n || null;
  var lastData = null;

  // 言語別ページ（/en/・/zh/）では、カードの飛び先もブログの言語別
  // URL（/blog/en/…）にそろえる。言語の正本は html lang（生成時に
  // 焼かれる）。日本語ページでは JSON の href をそのまま使う。
  function blogHrefForPage(href) {
    var lang = (document.documentElement.lang || "").toLowerCase();
    var prefix = "";
    if (lang.indexOf("en") === 0) prefix = "/en";
    if (lang.indexOf("zh") === 0) prefix = "/zh";
    if (!prefix) return href;
    var abs = "https://freddiefujiwara.com/blog/";
    if (href.indexOf(abs) === 0) {
      return "https://freddiefujiwara.com/blog" + prefix + "/" + href.slice(abs.length);
    }
    if (href.indexOf("/blog/") === 0) {
      return "/blog" + prefix + "/" + href.slice("/blog/".length);
    }
    return href;
  }

  // ページの言語に合ったタイトル。翻訳が JSON に無い記事は
  // 日本語タイトルにフォールバックする。
  function titleForPage(article) {
    var lang = (document.documentElement.lang || "").toLowerCase();
    var localized = null;
    if (lang.indexOf("en") === 0) localized = article.title_en;
    if (lang.indexOf("zh") === 0) localized = article.title_zh;
    return typeof localized === "string" && localized
      ? localized
      : article.title;
  }

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
      card.href = blogHrefForPage(article.href);
      var title = card.querySelector("h3");
      if (title) {
        title.textContent = titleForPage(article);
      }
      var note = card.querySelector("p");
      if (note) {
        var views = article.views.toLocaleString(locale);
        note.textContent = i18n
          ? i18n.t("popular.note", { d: days, v: views })
          : "直近" + days + "日で" + views + "回読まれています";
      }
    });
    renderSeries(locale);
  }

  // シリーズ一覧は JSON の series から組み直す（カードと違い
  // 行数が固定ではないので、静的な行は丸ごと差し替える）。
  // series が無い・空の JSON では静的な一覧のままにする。
  function renderSeries(locale) {
    if (!seriesList || !Array.isArray(lastData.series)) return;
    var items = [];
    lastData.series.forEach(function (article) {
      if (
        !article ||
        typeof article.title !== "string" ||
        typeof article.href !== "string"
      ) {
        return;
      }
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = blogHrefForPage(article.href);
      a.target = "_blank";
      a.rel = "noopener";
      var date = document.createElement("span");
      date.className = "series-date";
      date.textContent = formatSeriesDate(article.date, locale);
      var title = document.createElement("span");
      title.className = "series-title";
      title.textContent = titleForPage(article);
      a.appendChild(date);
      a.appendChild(title);
      li.appendChild(a);
      items.push(li);
    });
    if (!items.length) return;
    seriesList.innerHTML = "";
    items.forEach(function (li) {
      seriesList.appendChild(li);
    });
  }

  // "YYYY-MM-DD" を表示言語の日付書式にする。読めない値は
  // そのまま出す。
  function formatSeriesDate(iso, locale) {
    if (typeof iso !== "string") return "";
    var d = new Date(iso + "T00:00:00+09:00");
    if (isNaN(d.getTime())) return iso;
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(d);
    } catch (e) {
      return iso;
    }
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
