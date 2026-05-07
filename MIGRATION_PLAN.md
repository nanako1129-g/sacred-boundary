# Sacred Boundary 移行ガイド

## 1. Supabase 連携の最小構成

1. Supabase プロジェクトを作成し、`supabase_schema.sql` を SQL Editor で実行する。
2. Next.js の環境変数を設定する。

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

3. 初期段階では匿名閲覧を維持し、以下のみ認証必須にする。
   - 訪問記録の作成・編集・削除
   - 写真アップロード
   - 御朱印帳ページの本人データ参照

## 2. insights.json から PostgreSQL への移行戦略

1. 先に `lib/spots.ts` の内容を `spots` テーブルへ投入する。
2. `public/data/insights.json` を読み込み、`name -> spot_id` を解決する。
3. 照合に失敗したデータはログ出力して手動修正する。
4. 一時テーブル（例: `spot_insights`）に upsert する。
5. API の読み出し順を「DB優先、JSONフォールバック」に変更する。
6. 検証後に JSON フォールバックを停止する。

## 3. UI/UX 共存方針

- `PowerSpotDashboard` は分析ハブとして維持する。
- 聖地詳細から「訪問を記録する」を開く導線を追加する。
- 未ログイン時はモーダルを開けるが保存時にログイン導線を表示する。
- ログイン済みは `visits` と `photos` へ保存し、完了後に御朱印帳ページへ遷移できるようにする。

## 4. 実装の段階順

1. 認証 UI（ログイン・サインアップ）
2. visits 保存 API とモーダル保存処理の本実装
3. photos の Storage 連携
4. 御朱印帳ページ（一覧、並び替え、公開設定）
5. コミュニティ表示（公開 visit のみ）
