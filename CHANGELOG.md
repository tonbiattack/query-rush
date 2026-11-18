# Changelog

このプロジェクトの主な変更点を記録します。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に準拠します。

## [Unreleased]

## [0.3.0] - 2026-11-18

### Added

- 選択肢のSQLを句の区切りで改行する整形処理（`public/format.js`）。`CASE` は `WHEN` / `ELSE` を字下げし、`THEN` の後で改行する
- 6つのモード（Filter / Advanced / Logic / Aggregate / Pipeline / Master）
- 安全なSQL式パーサー（`src/sql.js`）。字句解析 → 構文解析 → AST検証 → AST再生成
- 自己ベストと直近20件の履歴を `localStorage` に保存
- 静的ビルドとGitHub Pagesデプロイ
- 出題の偏り防止（同じデータセットの連続抑制、直前セッションの問題を後回し）
- OSS向けドキュメント（README / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / Issue・PRテンプレート）

### Fixed

- 正誤表示中に60秒タイマーが止まらない不具合

### Changed

- 問題数を53問から202問へ拡充
- データセットを4から8へ拡充

## [0.2.0] - 2026-11-17

### Added

- 4択で選ぶ認識ゲームとして再設計（v2）。絞り込み前後のテーブルを見て条件を当てる形式
- スコア減衰（基本100＋速度0〜100＋ストリーク0〜100）
- 正誤表示中のタイマー停止と1行解説

### Removed

- チップを並べてクエリを組み立てる形式（v1）

## [0.1.0] - 2026-11-16

### Added

- 初版。チップを並べてSQLを組み立てる形式（v1）
- SQLite読み取り専用の実行基盤
