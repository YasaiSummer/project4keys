# Backlog 4 Keys Metrics (JavaScript Implementation)

DevOps 4 Keys（DORA metrics）を計算するBacklog連携アプリのJavaScript実装版です。

## 概要

このアプリケーションは、Backlogプロジェクトのデータを使用して以下の4つのDevOpsメトリクスを計算します：

1. **Deployment Frequency（デプロイ頻度）** - デプロイメントが本番環境に送られる頻度
2. **Lead Time for Changes（変更のリードタイム）** - コミットから本番稼働までの所要時間
3. **Mean Time to Recovery（平均復旧時間）** - 障害からの回復時間
4. **Change Failure Rate（変更失敗率）** - 失敗につながる変更の割合

## 機能

- Backlog API連携
- プロジェクト選択
- メトリクス設定（チケットタイプ・ステータス・カテゴリの選択）
- 4 Keysメトリクス計算
- パフォーマンスレベル評価（Elite/High/Medium/Low）
- レスポンシブWebUI

## 技術スタック

**バックエンド:**
- Node.js
- Express.js
- Axios（HTTP クライアント）
- Moment.js（日付処理）

**フロントエンド:**
- バニラJavaScript
- CSS Grid/Flexbox
- Fetch API

## セットアップ

S3静的ウェブサイトホスティング向けの設定です。

### ローカル開発環境

1. 任意のHTTPサーバーで実行（例：）

```bash
# Python3を使用する場合
python3 -m http.server 8000

# Node.jsを使用する場合
npx serve .

# VSCodeのLive Server拡張を使用
```

2. ブラウザで http://localhost:8000 を開く

### S3デプロイ

以下のファイルをS3バケットにアップロード：
- `index.html`
- `index.js`
- `css/style.css`

**注意:** BacklogのAPIはCORSが設定されているため、HTTPSでホストする必要があります。

## 使用方法

### 1. Backlog接続
- Space KeyとAPI Keyを入力して接続

### 2. プロジェクト選択
- メトリクスを計算したいプロジェクトを選択

### 3. メトリクス設定
- **完了ステータス**: デプロイメント完了を表すステータス
- **変更チケットタイプ/カテゴリ**: 機能開発・変更を表すもの
- **バグチケットタイプ/カテゴリ**: バグ・障害を表すもの
- **期間**: メトリクス計算対象期間

### 4. 結果確認
- 4つのメトリクスとパフォーマンスレベルを確認

## API エンドポイント

- `POST /api/v1/backlog/connect` - Backlog接続
- `POST /api/v1/backlog/projects` - プロジェクト一覧取得
- `POST /api/v1/backlog/projects/:projectKey/issue-types` - 課題タイプ取得
- `POST /api/v1/backlog/projects/:projectKey/statuses` - ステータス取得
- `POST /api/v1/backlog/projects/:projectKey/categories` - カテゴリ取得
- `POST /api/v1/metrics/all` - 4 Keysメトリクス計算

## パフォーマンスレベル基準

### Deployment Frequency
- **Elite**: ≥1回/日
- **High**: ≥0.2回/日（週1回以上）
- **Medium**: ≥0.067回/日（月1回以上）
- **Low**: <0.067回/日

### Lead Time for Changes
- **Elite**: ≤1日
- **High**: ≤7日
- **Medium**: ≤30日
- **Low**: >30日

### Mean Time to Recovery
- **Elite**: ≤1時間
- **High**: ≤24時間
- **Medium**: ≤168時間（1週間）
- **Low**: >168時間

### Change Failure Rate
- **Elite**: ≤5%
- **High**: ≤10%
- **Medium**: ≤15%
- **Low**: >15%

## 注意事項

- Backlog API Keyが必要です
- API制限に注意してください
- 大量データの場合は処理時間がかかる場合があります

## ライセンス

ISC
