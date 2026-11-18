---
name: 問題データの追加・修正
about: 出題する問題（テーブルとWHERE候補）を追加・修正する
title: '[Data] '
labels: data
assignees: ''
---

## 目的

<!-- どんな判断を学ばせたいか（例: NULL の三値論理、似た列名の取り違え） -->

## 追加・修正するデータ

- データセット: <!-- menu / orders / staff / stock / scores / temps / sales / members -->
- モード: <!-- filter / advanced / logic / aggregate / pipeline -->

## 罠の内容

<!-- 似た列名 / NULL / 重複行 のどれを仕込むか -->

## 確認

- [ ] `npm run check:questions` が通る
- [ ] テーブルは最大8行に収まっている
- [ ] 不正解は「惜しいもの」になっている（ランダムなダミーを入れていない）
