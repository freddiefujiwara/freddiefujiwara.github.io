# GASエンドポイント・スモーク日次記録

毎朝の Production smoke 結果と、GAS 12エンドポイントの匿名応答（JSON=○、Access Denied等の HTML=×）を記録する。列順：blog本番/ステージング、list本番/ステージング、tweet本番/ステージング、alarm本番/ステージング、health本番/ステージング、asset本番/ステージング。Production smoke ワークフローが毎朝自動で追記する（2026-11-14 に cron の日次チェックから移行。それ以前の記録は台帳ドキュメントと作業用 trend.md にある）。

| 日付 | smoke | blog P/S | list P/S | tweet P/S | alarm P/S | health P/S | asset P/S | 備考 |
|---|---|---|---|---|---|---|---|---|
| 2026-11-14 | failure | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.46s / bucket 1.23s / stuff 3.17s / music 1.26s。ラン: https://github.com/freddiefujiwara/freddiefujiwara.github.io/actions/runs/43534583857 |
| 2026-11-14 | failure | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | ○/○ | 特殊記事 map 1.66s / bucket 1.30s / stuff 3.06s / music 1.24s。ラン: https://github.com/freddiefujiwara/freddiefujiwara.github.io/actions/runs/43540167936 |
