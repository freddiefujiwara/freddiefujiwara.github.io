// トップページの UI 多言語化（日本語 / English / 中文）のための
// 小さな辞書モジュール。依存ライブラリは無く、このファイルだけで
// 完結する。翻訳対象はページ自身の UI 文言だけで、記事タイトル等の
// 動的コンテンツは対象外（記事本文の翻訳は別フェーズ）。
//
// 言語は URL が決める：日本語が /、英語が /en/、中国語が /zh/。
// /en/ と /zh/ はビルド時に scripts/generate-i18n-pages.mjs が
// 日本語ページとこの辞書から生成する（手で別々に保守はしない）。
// 実行時は html 要素の lang 属性から自分の言語を知り、動的
// スクリプトの注記テンプレート等をその言語で描く。静的文言は
// 生成時に焼き込まれているが、同じ apply() を読み込み時にも
// 通すので、生成結果と実行時表示がずれることはない。
//
// ブログと共有する localStorage キーへ言語を記録するのは、読者が
// 言語スイッチャーで明示的に選んだときだけ（recordLang）。記録は
// ブログ側が言語を引き継ぐためのもので、トップ自身の言語の決定
// には保存値を一切使わない。
//
// 使い方：
// - 静的文言は HTML 側に data-i18n="キー" を付けると textContent が、
//   data-i18n-html なら innerHTML が、data-i18n-alt / data-i18n-aria
//   なら alt / aria-label 属性が差し替わる。
// - 動的スクリプト（main.js など）は window.SiteI18n.t(key, vars)
//   でテンプレートを引く。SiteI18n が無い環境では各スクリプトが
//   日本語のまま動く（従来どおり）。
(function () {
  var LANGS = ["ja", "en", "zh"];
  var HTML_LANG = { ja: "ja", en: "en", zh: "zh-CN" };
  var LOCALES = { ja: "ja-JP", en: "en-US", zh: "zh-CN" };

  var STRINGS = {
    ja: {
      "title": "藤原史和｜川口を歩くQAエンジニア",
      "ogImageTitle": "川口を、歩く。",
      "description": "藤原史和（Fumikazu Fujiwara）の公式サイト。埼玉県川口市の街を歩き、地元のお店の魅力をInstagramのリールで発信しています。",
      "brandName": "藤原史和",
      "tagline": "川口を歩くQAエンジニア",
      "nav.top": "トップ",
      "nav.blog": "ブログ",
      "nav.list": "持ち物リスト",
      "nav.music": "川口の歌",
      "section.about": "プロフィール",
      "section.activity": "活動・発信",
      "section.contact": "情報交換",
      "hero.place": "— 埼玉県川口市",
      "hero.lead": "川口の街を歩き、地元のお店の魅力をInstagramのリールで発信しています。実際に足を運んだお店だけを紹介し、紹介したお店はGoogleマイマップにもまとめています。平日はQAエンジニアとして働きながら、休日は川口歩き。街の日常を記録するのが私のスタイルです。",
      "hero.ctaInstagram": "Instagramを見る",
      "hero.ctaAbout": "プロフィールへ",
      "hero.credit": "芝川の鯉のぼり（本人撮影）",
      "hero.imgAlt": "夜の芝川。川の上に色とりどりの鯉のぼりが架かり、両岸にマンションの灯りがともる",
      "stats.aria": "数字で見る活動",
      "stat.followers.unit": "人",
      "stat.followers.label": "SNS（Instagram、YouTube、Threads、X）延べフォロワー数",
      "stat.views.num": "約80",
      "stat.views.unit": "万回",
      "stat.views.label": "Instagramの再生回数<br>（過去30日）",
      "stat.reach.num": "約13",
      "stat.reach.unit": "万人",
      "stat.reach.label": "Instagramで届いた人数<br>（過去30日）",
      "stat.siteviews.unit": "回",
      "stat.siteviews.label": "サイト表示回数<br>（過去28日）",
      "stats.note": "数字は自動更新しています",
      "sns.totalLabel": "SNS（{names}）延べフォロワー数",
      "sns.asOf": "数字は{date}時点",
      "face.walk.tag": "街歩き",
      "face.walk.title": "川口の魅力を発信する、街の住人",
      "face.walk.p1": "暮らす街・<strong>川口市</strong>を歩いて回り、Instagram（@freddiefujiwara）で地元のお店を紹介するリールを投稿しています。飲食店を中心に、理容店やリラクゼーションまで、実際に足を運んだお店だけを紹介するのがこだわりです。",
      "face.walk.p2": "紹介したお店はGoogleマイマップ「川口を歩くQAエンジニアマップ」にまとめ、誰でも巡れるように公開しています。また楽天ROOMでは、実際に買ってよかったもの・使ってよかったものを置いています。",
      "face.work.tag": "仕事",
      "face.work.title": "QAエンジニアとして働いています",
      "face.work.p1": "平日は、ソフトウェアの品質保証（QA）に携わるエンジニアとして働いています。職歴・資格などの詳しいプロフィールは <a href=\"https://linkedin.com/in/freddiefujiwara\" target=\"_blank\" rel=\"noopener\">LinkedIn</a> にまとめています。",
      "about.photoAlt": "川口の住宅街の細い路地。草花が生い茂り、ブロック塀と古い家並みに挟まれた石段の小道",
      "about.caption": "川口の路地。歩いていると、こんな緑の小道に出会います。",
      "facts.name": "名前",
      "facts.nameValue": "藤原史和（ふじわら ふみかず）",
      "facts.base": "拠点",
      "facts.baseValue": "埼玉県川口市",
      "facts.from": "出身",
      "facts.fromValue": "山口県",
      "facts.interests": "関心",
      "facts.interestsValue": "サイクリング／街歩き／グルメ／音楽／中国語学習",
      "activity.lead": "このサイトを起点に、発信している場所をまとめました。SNSや地図、楽天ROOMまで、それぞれ短いURLでつながります。",
      "hub.instagram": "シェアサイクルと街歩きで川口をめぐるリールが中心。訪れたお店の空気感を、自然体でそのまま届けます。",
      "hub.x": "QAやテスト、AI活用についての発信が中心。技術の気づきを短く書いています。",
      "hub.youtube": "川口の景色にSunoのオリジナル曲を合わせた、リリックVlogのShortsを公開しています。",
      "hub.tiktok": "川口の歌の動画を、YouTubeとあわせて公開しています。",
      "hub.blog": "AIや自動化で、暮らしとサイト運営を軽くする実践記と、川口歩きの記録。中国語学習のメモも書いています。",
      "hub.music": "川口の歌、全7曲。そのまま聴けます",
      "hub.threads": "川口の暮らしのことを、気軽に書いています。",
      "hub.xiaohongshu": "川口のお店や暮らしのことを、中国語で短く書いています。",
      "hub.chinese": "中国語のレッスンや学習の記録を、ブログのタグでまとめました。",
      "hub.room": "楽天市場で購入したものを中心に、実際に買ってよかったもの、使ってよかったものだけを置いています。",
      "hub.list": "ミニマリストの持ち物リストです。",
      "hub.map": "リールで紹介した川口のお店を、ブログ記事に地図つきでまとめました。",
      "aria.blog": "ブログ",
      "aria.music": "音楽",
      "aria.chinese": "中国語",
      "aria.room": "楽天ROOM",
      "aria.list": "持ち物リスト",
      "aria.map": "川口マップ",
      "articles.heading": "よく読まれている記事",
      "articles.series": "シリーズ「サイト運営の裏側」",
      "contact.heading": "川口市の情報交換",
      "contact.text": "川口のお店の方や、川口に暮らす方と情報交換したいです。「こんなお店ができたよ」「この通りならここがおすすめ」といった川口の情報がありましたら、InstagramのDMからお気軽にご連絡ください。街歩きの仲間も歓迎です。",
      "contact.button": "InstagramのDMで連絡する",
      "contact.big": "川口",
      "foot.site": "このサイト",
      "foot.sns": "SNS",
      "foot.reviews": "口コミ",
      "foot.profile": "プロフィール・その他",
      "foot.tools": "自作ツール",
      "foot.list": "持ち物",
      "foot.bucket": "バケットリスト",
      "foot.googleReviews": "Googleマップの口コミ",
      "foot.rakutenReviews": "楽天トラベルの口コミ",
      "foot.tabelogReviews": "食べログの口コミ",
      "foot.rettyReviews": "Rettyの口コミ",
      "foot.xuexi": "学习（中国語の復習）",
      "foot.md2img": "md2img（Markdown to Image）",
      "foot.treemap": "portfolio-treemap（ポートフォリオ構成図）",
      "foot.dtgwt": "dtgwt（デシジョンテーブル→Given/When/Then）",
      "foot.qict": "node-qict（ペアワイズ法のテストケース生成）",
      "foot.smtc": "smtc（状態遷移のテストケース生成）",
      "foot.dtdt": "dtdt（デシジョンツリー→デシジョンテーブル）",
      "foot.fine": "写真：このページの写真はすべて本人の撮影です。",
      "stuff.count": "全{n}点を公開しています。",
      "popular.note": "直近{d}日で{v}回読まれています",
      "music.plays": "{n}回再生"
    },
    en: {
      "title": "Fumikazu Fujiwara | A QA Engineer Walking Kawaguchi",
      "ogImageTitle": "Walking Kawaguchi.",
      "description": "The official site of Fumikazu Fujiwara. I walk the streets of Kawaguchi, Saitama, and share the charm of local shops through Instagram Reels.",
      "brandName": "Fumikazu Fujiwara",
      "tagline": "A QA engineer walking Kawaguchi",
      "nav.top": "Home",
      "nav.blog": "Blog",
      "nav.list": "Everything I Own",
      "nav.music": "Songs of Kawaguchi",
      "section.about": "Profile",
      "section.activity": "Activities",
      "section.contact": "Contact",
      "hero.place": "— Saitama, Japan",
      "hero.lead": "I walk the streets of Kawaguchi and share the charm of local shops through Instagram Reels. I only feature places I have actually visited, and every shop I introduce is also pinned on my Google My Map. On weekdays I work as a QA engineer; on days off, I walk Kawaguchi. Recording the everyday life of this city is my style.",
      "hero.ctaInstagram": "See on Instagram",
      "hero.ctaAbout": "About me",
      "hero.credit": "Koinobori over the Shiba River (photo by the author)",
      "hero.imgAlt": "The Shiba River at night — colorful koinobori streamers span the water, with apartment lights along both banks",
      "stats.aria": "Activities in numbers",
      "stat.followers.unit": "people",
      "stat.followers.label": "Total followers across Instagram, YouTube, Threads and X",
      "stat.views.num": "≈800K",
      "stat.views.unit": "views",
      "stat.views.label": "Instagram views<br>(last 30 days)",
      "stat.reach.num": "≈132K",
      "stat.reach.unit": "people",
      "stat.reach.label": "People reached on Instagram<br>(last 30 days)",
      "stat.siteviews.unit": "views",
      "stat.siteviews.label": "Site views<br>(last 28 days)",
      "stats.note": "Figures update automatically",
      "sns.totalLabel": "Total followers ({names})",
      "sns.asOf": "Figures as of {date}",
      "face.walk.tag": "City Walks",
      "face.walk.title": "A local sharing what makes Kawaguchi special",
      "face.walk.p1": "I walk around <strong>Kawaguchi</strong>, the city I live in, and post Instagram Reels (@freddiefujiwara) introducing local shops. From restaurants to barbershops and relaxation salons, I only feature places I have actually visited — that is my rule.",
      "face.walk.p2": "Every shop I feature is collected on my Google My Map, “Kawaguchi walks by a QA engineer”, so anyone can follow the same route. On Rakuten ROOM, I keep the things I bought and was genuinely glad to own.",
      "face.work.tag": "Work",
      "face.work.title": "Working as a QA engineer",
      "face.work.p1": "On weekdays, I work as an engineer in software quality assurance (QA). My full career history and qualifications are on <a href=\"https://linkedin.com/in/freddiefujiwara\" target=\"_blank\" rel=\"noopener\">LinkedIn</a>.",
      "about.photoAlt": "A narrow alley in a Kawaguchi residential area — a stone-stepped path between block walls and old houses, overgrown with plants",
      "about.caption": "A Kawaguchi alley. Wander a little and you come across green paths like this.",
      "facts.name": "Name",
      "facts.nameValue": "Fumikazu Fujiwara",
      "facts.base": "Based in",
      "facts.baseValue": "Kawaguchi, Saitama",
      "facts.from": "From",
      "facts.fromValue": "Yamaguchi",
      "facts.interests": "Interests",
      "facts.interestsValue": "Cycling / city walks / food / music / learning Chinese",
      "activity.lead": "Here are the places I post, all starting from this site — social media, maps and Rakuten ROOM, each reachable through a short URL.",
      "hub.instagram": "Mostly Reels from cycling and walking around Kawaguchi, sharing the atmosphere of each shop just as I found it.",
      "hub.x": "Mostly about QA, testing and putting AI to work — short notes on what I learn.",
      "hub.youtube": "Shorts lyric Vlogs pairing Kawaguchi scenery with original songs made in Suno.",
      "hub.tiktok": "The Kawaguchi song videos, posted alongside YouTube.",
      "hub.blog": "Notes on lightening everyday life and running this site with AI and automation, plus records of my Kawaguchi walks and my Chinese study.",
      "hub.music": "The Kawaguchi songs — all 7 of them, ready to listen.",
      "hub.threads": "Casual posts about everyday life in Kawaguchi.",
      "hub.xiaohongshu": "Short notes in Chinese about Kawaguchi shops and everyday life.",
      "hub.chinese": "My Chinese lessons and study records, collected under one blog tag.",
      "hub.room": "Only things I bought — mostly on Rakuten Ichiba — and was genuinely glad to own and use.",
      "hub.list": "Everything I own.",
      "hub.map": "The Kawaguchi shops from my Reels, collected in a blog post with a map.",
      "aria.blog": "Blog",
      "aria.music": "Music",
      "aria.chinese": "Chinese",
      "aria.room": "Rakuten ROOM",
      "aria.list": "Everything I Own",
      "aria.map": "Kawaguchi Map",
      "articles.heading": "Popular Articles",
      "articles.series": "Series: Behind the Scenes of This Site",
      "contact.heading": "Let's swap Kawaguchi tips",
      "contact.text": "I would love to exchange tips with Kawaguchi shop owners and residents. If you know a new shop that opened or a street worth visiting, feel free to message me on Instagram. Walking companions are welcome too.",
      "contact.button": "Message me on Instagram",
      "contact.big": "KAWAGUCHI",
      "foot.site": "This Site",
      "foot.sns": "SNS",
      "foot.reviews": "Reviews",
      "foot.profile": "Profile & More",
      "foot.tools": "My Tools",
      "foot.list": "Everything I Own",
      "foot.bucket": "Bucket List",
      "foot.googleReviews": "Google Maps reviews",
      "foot.rakutenReviews": "Rakuten Travel reviews",
      "foot.tabelogReviews": "Tabelog reviews",
      "foot.rettyReviews": "Retty reviews",
      "foot.xuexi": "学习 (Chinese review)",
      "foot.md2img": "md2img (Markdown to Image)",
      "foot.treemap": "portfolio-treemap (portfolio breakdown)",
      "foot.dtgwt": "dtgwt (decision table → Given/When/Then)",
      "foot.qict": "node-qict (pairwise test-case generator)",
      "foot.smtc": "smtc (state-transition test-case generator)",
      "foot.dtdt": "dtdt (decision tree → decision table)",
      "foot.fine": "Photos: every photo on this page was taken by the author himself.",
      "stuff.count": "{n} items in total.",
      "popular.note": "Read {v} times in the last {d} days",
      "music.plays": "{n} plays"
    },
    zh: {
      "title": "藤原史和｜行走川口的QA工程师",
      "ogImageTitle": "行走川口。",
      "description": "藤原史和（Fumikazu Fujiwara）的官方网站。漫步埼玉县川口市的街头，通过 Instagram 短视频分享本地店铺的魅力。",
      "brandName": "藤原史和",
      "tagline": "行走川口的QA工程师",
      "nav.top": "首页",
      "nav.blog": "博客",
      "nav.list": "物品清单",
      "nav.music": "川口之歌",
      "section.about": "个人简介",
      "section.activity": "活动与分享",
      "section.contact": "信息交流",
      "hero.place": "— 埼玉县川口市",
      "hero.lead": "我漫步在川口的街头，通过 Instagram 短视频分享本地店铺的魅力。我只介绍自己亲自去过的店，介绍过的店铺也都整理在 Google 我的地图里。平日我是一名 QA 工程师，休息日则用来逛川口。记录这座城市的日常，就是我的风格。",
      "hero.ctaInstagram": "查看 Instagram",
      "hero.ctaAbout": "个人简介",
      "hero.credit": "芝川的鲤鱼旗（本人拍摄）",
      "hero.imgAlt": "夜晚的芝川。五彩缤纷的鲤鱼旗横跨河面，两岸公寓灯火点点",
      "stats.aria": "用数字看活动",
      "stat.followers.unit": "人",
      "stat.followers.label": "Instagram、YouTube、Threads、X 的粉丝总数",
      "stat.views.num": "约80",
      "stat.views.unit": "万次",
      "stat.views.label": "Instagram 播放量<br>（过去30天）",
      "stat.reach.num": "约13",
      "stat.reach.unit": "万人",
      "stat.reach.label": "Instagram 触达人数<br>（过去30天）",
      "stat.siteviews.unit": "次",
      "stat.siteviews.label": "网站浏览量<br>（过去28天）",
      "stats.note": "数据会自动更新",
      "sns.totalLabel": "粉丝总数（{names}）",
      "sns.asOf": "数据截至{date}",
      "face.walk.tag": "城市漫步",
      "face.walk.title": "住在川口，分享这座城市的魅力",
      "face.walk.p1": "我走遍自己生活的城市<strong>川口市</strong>，在 Instagram（@freddiefujiwara）上发布介绍本地店铺的短视频。从餐厅到理发店、放松按摩店，我只介绍亲自去过的店——这是我的坚持。",
      "face.walk.p2": "介绍过的店铺都整理在 Google 我的地图《行走川口的QA工程师地图》里，公开给任何人照着逛。在乐天 ROOM 上，我也放着自己买过、真正觉得好用的东西。",
      "face.work.tag": "工作",
      "face.work.title": "我是一名 QA 工程师",
      "face.work.p1": "平日，我从事软件质量保证（QA）方面的工作。详细的职业经历和资格证书整理在 <a href=\"https://linkedin.com/in/freddiefujiwara\" target=\"_blank\" rel=\"noopener\">LinkedIn</a> 上。",
      "about.photoAlt": "川口住宅区里的一条小巷：石阶小路夹在砖墙和老房子之间，草木茂盛",
      "about.caption": "川口的小巷。走着走着，就会遇见这样绿意盎然的小路。",
      "facts.name": "姓名",
      "facts.nameValue": "藤原史和",
      "facts.base": "常驻",
      "facts.baseValue": "埼玉县川口市",
      "facts.from": "出生地",
      "facts.fromValue": "山口县",
      "facts.interests": "兴趣",
      "facts.interestsValue": "骑行／漫步／美食／音乐／中文学习",
      "activity.lead": "这里汇总了以本站为起点的各个发布渠道——社交媒体、地图、乐天 ROOM，都能通过短链接到达。",
      "hub.instagram": "以骑共享单车和步行逛川口的短视频为主，把到访店铺的氛围自然真实地呈现出来。",
      "hub.x": "主要分享 QA、测试和 AI 应用方面的内容，简短记录技术上的心得。",
      "hub.youtube": "发布把川口风景与 Suno 原创歌曲结合的歌词 Vlog 短视频。",
      "hub.tiktok": "川口之歌的视频，与 YouTube 同步发布。",
      "hub.blog": "记录用 AI 和自动化让生活与网站运营更轻松的实践、川口漫步见闻，以及中文学习笔记。",
      "hub.music": "川口之歌，共 7 首，可以直接收听。",
      "hub.threads": "随手记录川口的日常生活。",
      "hub.xiaohongshu": "用中文简短记录川口的店铺和日常生活。",
      "hub.chinese": "中文课程和学习记录，按博客标签整理汇总。",
      "hub.room": "主要放乐天市场购买的东西，只收录真正买得满意、用得顺手的物品。",
      "hub.list": "极简主义者的物品清单。",
      "hub.map": "把短视频里介绍过的川口店铺，整理成带地图的博客文章。",
      "aria.blog": "博客",
      "aria.music": "音乐",
      "aria.chinese": "中文",
      "aria.room": "乐天 ROOM",
      "aria.list": "物品清单",
      "aria.map": "川口地图",
      "articles.heading": "热门文章",
      "articles.series": "系列：网站运营的幕后",
      "contact.heading": "川口信息交流",
      "contact.text": "很想和川口的店家以及住在川口的朋友们交换信息。如果您知道新开的店或值得一逛的街道，欢迎通过 Instagram 私信联系我。也欢迎一起散步的朋友。",
      "contact.button": "通过 Instagram 私信联系我",
      "contact.big": "川口",
      "foot.site": "本站",
      "foot.sns": "SNS",
      "foot.reviews": "评价",
      "foot.profile": "个人资料等",
      "foot.tools": "自制工具",
      "foot.list": "物品",
      "foot.bucket": "愿望清单",
      "foot.googleReviews": "Google 地图评价",
      "foot.rakutenReviews": "乐天旅游评价",
      "foot.tabelogReviews": "Tabelog 评价",
      "foot.rettyReviews": "Retty 评价",
      "foot.xuexi": "学习（中文复习）",
      "foot.md2img": "md2img（Markdown 转图片）",
      "foot.treemap": "portfolio-treemap（投资组合构成图）",
      "foot.dtgwt": "dtgwt（决策表→Given/When/Then）",
      "foot.qict": "node-qict（成对组合测试用例生成）",
      "foot.smtc": "smtc（状态迁移测试用例生成）",
      "foot.dtdt": "dtdt（决策树→决策表）",
      "foot.fine": "照片：本页所有照片均为本人拍摄。",
      "stuff.count": "共公开 {n} 件物品。",
      "popular.note": "最近 {d} 天已被阅读 {v} 次",
      "music.plays": "播放 {n} 次"
    }
  };
  function isLang(value) {
    return LANGS.indexOf(value) >= 0;
  }

  // html lang 属性（ja / en / zh-CN）から言語キーを決める。
  function langFromHtml() {
    var attr = (document.documentElement.lang || "ja").toLowerCase();
    if (attr.indexOf("zh") === 0) return "zh";
    if (attr.indexOf("en") === 0) return "en";
    return "ja";
  }

  var current = langFromHtml();

  // ブログと共有する localStorage キーへの言語の記録。記録するのは、
  // 読者が言語スイッチャーで明示的に言語を選んだときだけ（ブログ側
  // のルールと同一）。共有リンク等で言語ページを直接開いただけでは
  // 記録しない。スイッチャーは実ページへのリンクなので、クリック時
  // に sessionStorage へ行き先の言語を印として残し、遷移先のページ
  // が印と自分の言語の一致を確認して初めて記録する。印は1回で消す
  // （残ると、後に関係ない訪問で記録されてしまう）。本番とステージ
  // ングは同一オリジンで配信されるため、記録先のキーはステージン
  // グのパス（/staging/ を含む）では分ける。保存できない環境
  // （プライベートモード等）でもページが壊れないよう、失敗は
  // 握りつぶす。
  var PICK_KEY = "site:lang:pick:v1";

  function markLangPick() {
    document.querySelectorAll("[data-lang-link]").forEach(function (link) {
      link.addEventListener("click", function () {
        try {
          window.sessionStorage.setItem(
            PICK_KEY,
            link.getAttribute("data-lang-link")
          );
        } catch (e) {
          // 印が残せなくても遷移自体は通常どおり行われる。
        }
      });
    });
  }

  function recordLang() {
    var pick = null;
    try {
      pick = window.sessionStorage.getItem(PICK_KEY);
      window.sessionStorage.removeItem(PICK_KEY);
    } catch (e) {
      // 読めない環境では記録しない。
    }
    if (!isLang(pick) || pick !== current) return;
    try {
      var staging = window.location.pathname.indexOf("/staging/") >= 0;
      var key = staging ? "site:lang:v1:staging" : "site:lang:v1";
      window.localStorage.setItem(key, current);
    } catch (e) {
      // 記録できなくても表示には影響しない。
    }
  }

  function t(key, vars) {
    var table = STRINGS[current] || {};
    var text = key in table ? table[key] : STRINGS.ja[key];
    if (typeof text !== "string") return key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (m, name) {
        return name in vars ? String(vars[name]) : m;
      });
    }
    return text;
  }

  function setMeta(selector, attr, value) {
    var el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  }

  function apply() {
    document.documentElement.lang = HTML_LANG[current];
    document.title = t("title");
    setMeta('meta[name="description"]', "content", t("description"));
    setMeta('meta[property="og:title"]', "content", t("title"));
    setMeta('meta[property="og:description"]', "content", t("description"));
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      el.setAttribute("alt", t(el.getAttribute("data-i18n-alt")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
    });
    // 言語スイッチャーは実 URL へのリンク。現在の言語だけ印を付ける。
    document.querySelectorAll("[data-lang-link]").forEach(function (link) {
      var active = link.getAttribute("data-lang-link") === current;
      link.classList.toggle("current", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  // ビルド時生成（generate-i18n-pages.mjs）用：言語を固定して描く。
  function applyLang(lang) {
    if (!isLang(lang)) return;
    current = lang;
    apply();
  }

  window.SiteI18n = {
    langs: LANGS.slice(),
    getLang: function () {
      return current;
    },
    locale: function () {
      return LOCALES[current];
    },
    t: t,
    applyLang: applyLang
  };

  recordLang();
  apply();
  markLangPick();
})();
