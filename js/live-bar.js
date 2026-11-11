// ライブバー：ヒーロー直下に、気象庁の天気（埼玉県南部＝川口）と
// 川口市の新着情報を表示する小さなスクリプト。
// トップページは静的生成が原則なので、外部データは表示後に
// url-fetch-gas（汎用フェッチ）経由で読み込むだけにする。
// 取得できない・壊れている場合はバー自体を出さず、ページは
// 静的なままにする（天気・警報・新着は項目ごとに独立して判定し、
// 取れた項目だけを出す）。
// 出典と発表時刻は必ず併記する（数字には時点を添える運用に合わせる）。
(function () {
  var bar = document.getElementById("live-bar");
  if (!bar) return;
  if (typeof window.fetch !== "function") return;

  var PROXY =
    "https://script.google.com/macros/s/AKfycbx6iFGnB5EaSVedN5mk8F1L0iO9orwZZiOz_2m6wIRzHA1XsU555ib0Ex2LMCR1nLOvhw/exec";
  var FORECAST_URL =
    "https://www.jma.go.jp/bosai/forecast/data/forecast/110000.json";
  var WARNING_URL =
    "https://www.jma.go.jp/bosai/warning/data/warning/110000.json";
  var CITY_RSS_URL =
    "https://www.city.kawaguchi.lg.jp/cgi-bin/feed.php?type=rss_2.0&dirId=4370&includeShortcut=1&ignore=1";
  // 気象庁の地域区分：埼玉県南部（川口市を含む）。気温は さいたま の値。
  var AREA_NAME = "南部";
  var TEMP_POINT = "さいたま";
  var WARNING_AREA_CODE = "110010";

  var warningEl = bar.querySelector(".live-warning");
  var weatherEl = bar.querySelector(".live-weather");
  var newsEl = bar.querySelector(".live-news");
  var srcEl = bar.querySelector(".live-src");

  // url-fetch-gas 経由で対象URLの本文（文字列）を取る。
  // 失敗・エラー応答・本文なしは null。
  var fetchViaProxy = function (target) {
    return window
      .fetch(PROXY + "?u=" + encodeURIComponent(target))
      .then(function (res) {
        return res && res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || data.error || typeof data.content !== "string") {
          return null;
        }
        return data.content;
      })
      .catch(function () {
        return null;
      });
  };

  var parseJson = function (text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  // ISO日時（+09:00）を「11月11日17:00」に整える。読めなければ null。
  var formatJstDateTime = function (value) {
    if (typeof value !== "string") return null;
    var date = new Date(value);
    if (isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch (e) {
      return null;
    }
  };

  // 予報JSONから「今日・明日」の天気文と気温（あれば）を組み立てる。
  // 気温は発表回によって今日分・明日分のどちらかしか無いので、
  // 日付で引ける分だけ添える。
  var buildWeather = function (forecast) {
    var root = forecast && forecast[0];
    if (!root || !root.timeSeries) return null;
    var weatherSeries = null;
    var tempsByDate = {};
    root.timeSeries.forEach(function (series) {
      if (!series.areas) return;
      if (series.areas.some(function (a) { return a.weathers; })) {
        weatherSeries = series;
      }
      series.areas.forEach(function (a) {
        if (a.area && a.area.name === TEMP_POINT && a.temps) {
          a.temps.forEach(function (temp, i) {
            if (temp === "") return;
            var define = series.timeDefines[i] || "";
            var day = define.slice(0, 10);
            var hour = define.slice(11, 13);
            tempsByDate[day] = tempsByDate[day] || {};
            if (hour === "00") tempsByDate[day].min = temp;
            if (hour === "09") tempsByDate[day].max = temp;
          });
        }
      });
    });
    if (!weatherSeries) return null;
    var area = null;
    weatherSeries.areas.forEach(function (a) {
      if (a.area && a.area.name === AREA_NAME) area = a;
    });
    if (!area || !area.weathers) return null;

    var reportDay = (root.reportDatetime || "").slice(0, 10);
    var dayLabels = ["今日", "明日", "明後日"];
    var parts = [];
    area.weathers.slice(0, 2).forEach(function (weather, i) {
      var day = (weatherSeries.timeDefines[i] || "").slice(0, 10);
      var label = dayLabels[i] || "";
      if (day && reportDay) {
        var diff = (Date.parse(day) - Date.parse(reportDay)) / 86400000;
        if (dayLabels[diff]) label = dayLabels[diff];
      }
      var text = weather.replace(/　+/g, " ").trim();
      var temps = tempsByDate[day];
      if (temps && temps.max) text += " 最高" + temps.max + "℃";
      if (temps && temps.min) text += " 最低" + temps.min + "℃";
      parts.push(label + "：" + text);
    });
    if (!parts.length) return null;
    return {
      text: "川口の天気　" + parts.join(" ／ "),
      reportedAt: formatJstDateTime(root.reportDatetime),
    };
  };

  // 警報・注意報JSONから、埼玉県南部で発表中（発表・継続）の
  // 種別名を集める。無ければ空配列。
  var activeWarnings = function (warning) {
    var types = [];
    if (!warning || !warning.areaTypes) return types;
    warning.areaTypes.forEach(function (areaType) {
      (areaType.areas || []).forEach(function (a) {
        if (a.code !== WARNING_AREA_CODE) return;
        (a.warnings || []).forEach(function (w) {
          if ((w.status === "発表" || w.status === "継続") && w.type) {
            if (types.indexOf(w.type) === -1) types.push(w.type);
          }
        });
      });
    });
    return types;
  };

  // 川口市の新着RSS（RSS 1.0）から最新2件を取り出す。
  var parseNews = function (xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) return [];
    var items = [];
    doc.querySelectorAll("item").forEach(function (item) {
      if (items.length >= 2) return;
      var titleEl = item.querySelector("title");
      var linkEl = item.querySelector("link");
      if (!titleEl || !linkEl) return;
      var dateEl = item.getElementsByTagName("dc:date")[0];
      items.push({
        title: titleEl.textContent.trim(),
        link: linkEl.textContent.trim(),
        date: dateEl ? dateEl.textContent.trim() : "",
      });
    });
    return items;
  };

  // 「2026-11-11T...」を「11月11日」に整える。読めなければ空文字。
  var formatDay = function (value) {
    var text = formatJstDateTime(value);
    if (!text) return "";
    return text.split(" ")[0];
  };

  var weatherTask = fetchViaProxy(FORECAST_URL).then(function (content) {
    return buildWeather(parseJson(content));
  });
  var warningTask = fetchViaProxy(WARNING_URL).then(function (content) {
    return activeWarnings(parseJson(content));
  });
  var newsTask = fetchViaProxy(CITY_RSS_URL).then(function (content) {
    return content ? parseNews(content) : [];
  });

  Promise.all([weatherTask, warningTask, newsTask]).then(function (results) {
    var weather = results[0];
    var warningTypes = results[1];
    var newsItems = results[2];
    var srcParts = [];
    var hasContent = false;

    if (warningTypes.length) {
      warningEl.textContent =
        "埼玉県南部に" + warningTypes.join("・") + "が発表されています";
      hasContent = true;
    } else {
      warningEl.remove();
    }

    if (weather) {
      weatherEl.textContent = weather.text;
      srcParts.push(
        weather.reportedAt
          ? "気象庁 " + weather.reportedAt + "発表"
          : "気象庁発表",
      );
      hasContent = true;
    } else {
      weatherEl.remove();
    }

    if (newsItems.length) {
      newsItems.forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = item.link;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = item.title;
        li.appendChild(a);
        var day = formatDay(item.date);
        if (day) {
          var time = document.createElement("time");
          time.textContent = day;
          li.appendChild(time);
        }
        newsEl.appendChild(li);
      });
      srcParts.push("川口市ホームページ新着情報");
      hasContent = true;
    } else {
      newsEl.remove();
    }

    if (!hasContent) return;
    if (srcParts.length) {
      srcEl.textContent = srcParts.join(" ／ ");
    } else {
      srcEl.remove();
    }
    bar.hidden = false;
  });
})();
