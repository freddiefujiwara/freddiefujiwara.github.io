// Core Web Vitals -> GA4。ブログ・持ち物リストと同一方式で、各指標を
// 専用イベント（wv_lcp など）として、標準の value パラメータに計測値を
// 入れて送る。CLS は1000倍してから丸め、小数3桁の精度を保つ。
// gtag はステージングでは読み込まれない（GAタグ自体が外される）ため、
// 無い環境では何もしない。ライブラリ（web-vitals.iife.js）が無い場合も同様。
(function () {
  if (!window.webVitals || typeof window.gtag !== "function") return;

  var EVENT_NAMES = {
    CLS: "wv_cls",
    FCP: "wv_fcp",
    INP: "wv_inp",
    LCP: "wv_lcp",
    TTFB: "wv_ttfb"
  };

  function sendWebVital(metric) {
    var value = metric.name === "CLS" ? metric.value * 1000 : metric.value;
    window.gtag("event", EVENT_NAMES[metric.name], {
      value: Math.round(value),
      non_interaction: true
    });
  }

  window.webVitals.onCLS(sendWebVital);
  window.webVitals.onFCP(sendWebVital);
  window.webVitals.onINP(sendWebVital);
  window.webVitals.onLCP(sendWebVital);
  window.webVitals.onTTFB(sendWebVital);
})();
