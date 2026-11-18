# QUERY RUSH

**絞り込み前後のテーブルを見て、どの `WHERE` でそうなったかを4択で当てるSQL認識ゲーム。**

クエリを書くのではなく、データの変化を読んで選ぶ。1問5秒、60秒で何問正解できるかを競います。

[![CI](https://github.com/tonbiattack/query-rush/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/tonbiattack/query-rush/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.16%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://tonbiattack.github.io/query-rush/)

**[▶ 遊ぶ](https://tonbiattack.github.io/query-rush/)** — インストール不要、ブラウザで開くだけ。

---

## これは何か

SQLの学習というと「正しいクエリを書く」形式になりがちですが、それでは試験や仕事の作業になります。QUERY RUSH は逆の発想で、**すでに実行された結果を見て、原因となった条件を当てる**ゲームです。

```
絞り込み前                    絞り込み後
┌──────┬───────┬───────┐      ┌──────┬───────┬───────┐
│ item │ qty   │ total │  →   │ item │ qty   │ total │
├──────┼───────┼───────┤      ├──────┼───────┼───────┤
│ まぐろ│   2   │   960 │      │ うに │   1   │ 1,200 │
│ サーモン│  1  │   380 │      │ 中とろ│   2   │ 2,000 │
│ えび │   3   │   960 │      │ 大とろ│   1   │ 1,600 │
│ ...  │       │       │      │ 穴子 │   4   │ 2,240 │
└──────┴───────┴───────┘      └──────┴───────┴───────┘

どの WHERE でこうなった？
[1] total > 2000   [2] total < 1000
[3] total > 1000   [4] total >= 960
```

判断材料はデータの見た目だけ。列名を読み比べるのではなく、**どの行が消えてどの行が残ったか**で答えます。

## 特徴

- **書かない、選ぶだけ** — キーボード入力はゼロ。4択をタップするか数字キー `1`〜`4` を押すだけ
- **6つのモード** — `WHERE` の基本から、`CASE`、集計、CTEまで段階的に学べる
- **320問を自動検証** — 全問が「4択のうち正解でだけその結果になる」ことをSQLite実行で機械的に確認済み
- **間違いに寛容** — 正誤表示中はタイマーが止まり、1行解説を読んでから次へ進める。ミスしてもゲームは止まらない
- **スコアが生きている** — 「いま正解したら何点か」が残り時間とともに減る。速く押すか、確かめてから押すかの判断が生まれる
- **データ側の罠で難しくする** — 選択肢や行数を増やさず、似た列名・NULL・重複行で判断を難しくする
- **オフラインで動く** — サーバー不要。GitHub Pages の静的サイトとして配信

## モード

| モード | 内容 | 制限時間 | 問題数 |
| --- | --- | ---: | ---: |
| **Filter Rush** | `WHERE` で行がどう絞られるか | 5秒 | 65 |
| **Advanced** | `AND` / `OR` / `IN` / `BETWEEN` / `LIKE` / NULL の三値論理 | 8秒 | 18 |
| **Logic Rush** | `CASE` / `COALESCE` / `NULLIF` / `EXISTS` の評価結果 | 8秒 | 17 |
| **Aggregate Rush** | `GROUP BY` / `HAVING` / 集計関数の結果 | 8秒 | 30 |
| **Pipeline Rush** | CTE（`WITH`）を段階的に追う | 15秒 | 30 |
| **Master Rush** | 全カテゴリ混合 | 8秒 | 160 |

制限時間は開始画面で 3／5／8／15 秒から選べます。スコアはモードと制限時間の組み合わせごとに分けて記録します。

## 遊び方

1. 上段に「絞り込み前」と「絞り込み後」のテーブルが出る（最大8行。消える行は打ち消し線、残る行はハイライト）
2. 下段の固定4択から、その変化を起こした条件を選ぶ
3. 正誤表示中はタイマーが止まり、1行だけ解説が出る。正解でも不正解でも「次へ」で進む
4. 60秒タイムアタックで、スコア・正解数・最大ストリークを競う

### 操作

| 操作 | マウス／タッチ | キーボード |
| --- | --- | --- |
| 回答する | チップを押す | `1`〜`4` |
| 次へ進む | 「次へ」を押す | `Enter` |

### スコア

1問あたり最大300点。

| 内訳 | 点数 | 条件 |
| --- | ---: | --- |
| 基本点 | 100 | 正解なら常に |
| 速度ボーナス | 0〜100 | 残り時間の割合に比例 |
| ストリークボーナス | 0〜100 | 連続正解1つにつき +20 |

不正解・時間切れは0点でストリークがリセットされます。ただしゲームは止まりません。

自己ベストと直近20件の履歴を `localStorage` に保存します（匿名・端末内のみ）。開始画面の「記録を消す」で削除できます。

## はじめかた

### 遊ぶだけ

**[https://tonbiattack.github.io/query-rush/](https://tonbiattack.github.io/query-rush/)** を開く。以上です。

### ローカルで動かす

Node.js 22.16 以上が必要です（`node:sqlite` の `statement.columns()` を使うため）。**依存パッケージはゼロ**です。

```bash
git clone https://github.com/tonbiattack/query-rush.git
cd query-rush
npm start
# → http://127.0.0.1:4173
```

起動時に固定データから一時SQLiteデータベースを生成し、読み取り専用で開きます。問題の生成と一意性検証をサーバー側で行います。

### スタティックモード（GitHub Pages と同じ構成）

```bash
npm run build    # dist/ に静的サイトを出力
npm run preview  # → http://127.0.0.1:4174
```

ビルド時にSQLiteで問題を生成・検証し、`dist/questions.json` へ書き出します。ブラウザ内でゲームが完結するので、サーバーは不要です。

## 開発

### スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm start` | サーバーモードで起動（ポート4173） |
| `npm test` | ユニットテスト（104件） |
| `npm run check:questions` | 問題データの検証（320問） |
| `npm run build` | 静的サイトを `dist/` へ出力 |
| `npm run preview` | 静的ビルドをプレビュー（ポート4174） |

### 問題データの検証

`npm run check:questions` は全データセットの候補を実際にSQLiteで実行し、各問題が次を満たすことを機械的に確かめます。

1. **一意性** — 4択のうち、正解でだけ目標の結果になる
2. **惜しさ** — 不正解は同じ列・似た列名・同じ種類の式から選ばれている（ランダムなダミーなし）
3. **行数** — 表示は最大8行に収まる
4. **変化** — 行が実際に減っている
5. **コスト** — 100ms / 100行を超えない

問題データを追加・変更したら必ず通してください。CIでも同じ検証を実行しています。

### 構成

```
src/
  config.js     調整用パラメーター（【】付きの名前でSPECから参照）
  data.js       テーブルと候補（罠を仕込んだ素材）
  sql.js        安全なSQL式パーサー（字句解析→構文解析→AST検証→再生成）
  engine.js     SQLite読み取り専用の実行基盤（WHERE/集計/パイプライン）
  modes.js      モード定義
  questions.js  問題生成と一意性検証
  game.js       コアループ（4択／スコア減衰／ストリーク／60秒／タイマー停止）
  server.js     静的配信とJSON API
public/
  index.html    4択UI
  styles.css
  app.js        クライアント（サーバー／スタティック両対応）
  engine.js     ブラウザ側のゲームエンジン（スタティックモード用）
  format.js     選択肢ラベルの整形（長いSQLを句の区切りで改行）
  records.js    自己ベスト・履歴（localStorage）
scripts/
  check-questions.js  問題データの検証
  build-static.js     静的ビルド
  preview-static.js   静的ビルドのプレビュー
test/           ユニットテスト
docs/SPEC.md    仕様書
```

### 設計上の絶対条件

`docs/SPEC.md` の3点を守っています。実装で崩さないでください。

1. **問題は常時1問だけ** — 同時処理の忙しさを入れない
2. **4択スロットの位置は固定** — 探す時間ではなく選ぶ時間で勝負させる
3. **テーブルは最大8行・選択肢は4つ** — 難化は行数や選択肢ではなくデータ側の罠で行う

### セキュリティ

候補の条件式は文字列のままSQLへ流しません。`src/sql.js` で字句解析 → 構文解析 → AST検証 → ASTからの再生成を行い、許可したノード・関数・列だけを実行します。セミコロン・コメント・許可外の関数は実行前に拒否します。

### デプロイ

`main` へマージすると GitHub Actions が次を実行します。

1. `npm test` と `npm run check:questions` で検証
2. `npm run build` で静的サイトを生成
3. GitHub Pages へデプロイ

初回のみ、リポジトリ設定の Pages で Source を **GitHub Actions** にする必要があります。

## コントリビュート

Issue・Pull Request を歓迎します。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

- バグ報告・機能提案は [Issues](https://github.com/tonbiattack/query-rush/issues) へ
- 問題データの追加は `src/data.js` に素材を足すだけで、生成と検証は自動です
- セキュリティ上の問題は公開Issueではなく、リポジトリの Security タブから非公開で報告してください

## ライセンス

[MIT](LICENSE) © 2026 tonbiattack

## 謝辞

UI Rush / Type Rush の設計（見て選ぶ・間違いに寛容・解説は答えた後・スコアが残り時間と一緒に減る）を土台にしています。

- [UI Rush](https://tonbiattack.github.io/ui-rush/) — UIコンポーネント名を4択で答えるクイズ
- [Type Rush](https://tonbiattack.github.io/type-rush/) — ひらがな短文のタイピングゲーム
