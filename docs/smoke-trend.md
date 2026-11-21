# GASエンドポイント・スモーク日次記録

毎朝の Production smoke 結果と、GAS 12エンドポイントの匿名応答（JSON=○、Access Denied等の HTML=×）を記録する。列順：blog本番/ステージング、list本番/ステージング、tweet本番/ステージング、alarm本番/ステージング、health本番/ステージング、asset本番/ステージング。Production smoke ワークフローが毎朝自動で追記する（2026-11-14 に cron の日次チェックから移行。それ以前の記録は台帳ドキュメントと作業用 trend.md にある）。

| 日付 | smoke | blog P/S | list P/S | tweet P/S | alarm P/S | health P/S | asset P/S | 備考 |
|---|---|---|---|---|---|---|---|---|
| 2026-11-14 | failure | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.46s / bucket 1.23s / stuff 3.17s / music 1.26s。ラン: https://github.com/freddiefujiwara/freddiefujiwara.github.io/actions/runs/43534583857 |
| 2026-11-14 | failure | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.66s / bucket 1.30s / stuff 3.06s / music 1.24s。ラン: https://github.com/freddiefujiwara/freddiefujiwara.github.io/actions/runs/43540167936 |
| 2026-11-15 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.43s / bucket 1.52s / stuff 3.09s / music 1.10s |
| 2026-11-16 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.66s / bucket 1.37s / stuff 3.43s / music 1.05s |
| 2026-11-17 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 2.30s / bucket 1.39s / stuff 2.42s / music 2.29s |
| 2026-11-18 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.93s / bucket 1.87s / stuff 3.16s / music 1.32s |
| 2026-11-19 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.45s / bucket 1.59s / stuff 2.79s / music 1.72s |
| 2026-11-20 | failure | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 3.38s / bucket 2.91s / stuff 3.98s / music 2.93s。ラン: https://github.com/freddiefujiwara/freddiefujiwara.github.io/actions/runs/44658841754 |
| 2026-11-21 | success | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 3.33s / bucket 2.67s / stuff 2.98s / music 3.78s |
