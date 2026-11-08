// トップページの振る舞い（index.html の body 末尾で読み込む）。
(function () {
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // 持ち物リストの件数をAPIから取得して表示（取得できない場合は件数なしのまま）
  var stuffCount = document.getElementById("stuff-count");
  if (stuffCount && "fetch" in window) {
    fetch("https://script.google.com/macros/s/AKfycbwUMhAHJDzp_mtR12fbHJlzNTptpSH78LNJAr9i9SXBdn_BUAwWJTtb1g/exec")
      .then(function (r) { return r.json(); })
      .then(function (items) {
        if (Array.isArray(items) && items.length) {
          stuffCount.textContent = "全" + items.length + "点を公開しています。";
        }
      })
      .catch(function () {});
  }

  // ナビのクリック計測（GA）。どの項目が押されたかを nav_click イベントで送る。
  // gtag はステージングでは読み込まれないため、無い環境では何もしない
  // （ステージングの操作で本番の計測を汚さない）。
  function navItemOf(a) {
    var spy = a.getAttribute("data-spy");
    if (spy) return spy;
    var href = a.getAttribute("href") || "";
    if (href.indexOf("/blog/") >= 0) return "blog";
    if (href.indexOf("/list-of-stuff/") >= 0) return "list";
    if (href.indexOf("/music/") >= 0) return "music";
    return null;
  }
  document.querySelectorAll(".site-nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      var item = navItemOf(a);
      if (item && typeof window.gtag === "function") {
        window.gtag("event", "nav_click", { nav_item: item });
      }
    });
  });

  var links = document.querySelectorAll(".site-nav a[data-spy]");
  var BASE_TITLE = document.title;
  var SECTION_TITLES = { about: "プロフィール", activity: "活動・発信", contact: "情報交換" };
  function setCurrent(id) {
    links.forEach(function (l) {
      l.classList.toggle("active", l.getAttribute("data-spy") === id);
    });
    document.title = SECTION_TITLES[id] ? SECTION_TITLES[id] + " | " + BASE_TITLE : BASE_TITLE;
  }
  var sections = ["top", "about", "activity", "contact"].map(function (id) {
    return document.getElementById(id);
  }).filter(Boolean);
  var initialId = (location.hash || "").replace(/^#/, "");
  setCurrent(SECTION_TITLES[initialId] ? initialId : "top");
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setCurrent(e.target.id);
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }
})();
