# RGB Life — rgb-lifegame

Next.js 16.3.8 / React 19.3.0 / Rust 1.99.0 (2024 edition) / WebAssembly.

画像から独立したR・G・Bの3つのライフゲームを作る、ブラウザ内完結の実験ページです。

## 起動

Node.js 20.9以降、Rustupをインストールしてから:

```sh
npm ci
npm run dev
```

初回は先に `npm run build:wasm` を実行してください。Rustupは `rust-toolchain.toml` に従ってRust 1.99.0とwasm32-unknown-unknownを取得します。ビルド済みWASMもpublic/wasmに同梱しています。

```sh
npm run build
```

`out/` に静的サイトを出力します。Next.jsサーバーやRustサーバーは不要です。GitHub Pagesのプロジェクトページなら `NEXT_PUBLIC_BASE_PATH=/リポジトリ名 npm run build` で生成できます。サブパスを設定した場合は、そのサブパスから配信してください。

## 使い方

1. 同梱サンプル、または画像選択・ドロップで画像を読み込む。
2. 画像を縦横比を保って盤面に収め、余白を黒で埋める。
3. RGBそれぞれの値をしきい値で生死へ変換。ディザON時は4×4 Bayer行列のオフセットを加える。
4. 再生、1世代進める、初期状態へ戻す。設定変更時は停止して第0世代に戻る。
5. 合成に表示するレイヤーを選び、PNGとして保存する。

各レイヤーは周囲8セルの同じ色だけを数え、B3/S23で同じ世代から次を計算します。端を接続する場合はトーラス、OFFなら盤面外は死です。残像は使用せず、合成画面は黒を含む8色です。画像はアップロードされません。

## 構成

- `app/page.tsx`: UI、画像デコードと縮小、WASM呼び出し、Canvas描画
- `engine/src/lib.rs`: 画像の初期状態変換、RGBの世代計算、RGBA合成
- `scripts/build-wasm.mjs`: Rust→WASMビルド、公開ディレクトリへのコピー
- `scripts/check-wasm.mjs`: 実際のWASMバイナリの結合テスト

外部Rustクレートなし。生のWASM ABIでメモリを受け渡すのでwasm-bindgenは不要です。TypeScriptによる計算へのフォールバックはありません。

## 検証

```sh
cargo test --manifest-path engine/Cargo.toml
npm run build
node scripts/check-wasm.mjs
```

Rustのテストは同期更新・独立RGB・端の接続を確認します。WASM結合テストは画像入力→世代更新→合成色・表示マスク、サイズ上限、384×256盤面を確認します。

## このリポジトリをGitHub Pagesで公開

対象: https://github.com/loser4dim/rgb-lifegame

1. ZIP内の `rgb-life` フォルダーの**中身**をリポジトリのルートへ置く。`.github`・`.gitignore`・`.env.production` も含める。
2. GitHubの **Settings → Pages → Build and deployment → Source → GitHub Actions** を選択する。
3. `main` にpushする。`.github/workflows/pages.yml` がRustのテスト、WASMビルド、Next.js静的出力、WASM結合テスト、Pages公開を順に実行する。
4. 公開URLはActionsのデプロイ結果またはSettings → Pagesで確認する。ユーザーサイトのカスタムドメインが継承される場合は `https://loser4dim.jp/rgb-lifegame/`、標準ドメインなら `https://loser4dim.github.io/rgb-lifegame/`。

Actionsでは `configure-pages` の `base_path` をNext.js・画像・WASMのURLに使用します。ローカル本番ビルドは `.env.production` の `/rgb-lifegame` を使用。`npm run dev` は `/` で起動します。独自ドメインでルート公開する場合は `.env.production` の値を空にしてください。

```sh
git init -b main
git add .
git commit -m "Add RGB Life simulator and GitHub Pages workflow"
git remote add origin https://github.com/loser4dim/rgb-lifegame.git
git push -u origin main
```

上記は空のリポジトリに初回pushする場合の例です。clone済みなら `git init` と `git remote add` は不要です。

## Full-HD版の変更

- 初期盤面は1920×1080セル。640×360、1280×720にも切り替え可能。
- 表示と保存は16:9。PNGは盤面と同じサイズで保存。
- Rust/WASMの計算と縮小レイヤープレビュー生成はTypeScript Web Workerで実行。未完了の世代計算を積み上げないため、速度設定は目標値です。
- `actions/configure-pages@v6`、`actions/deploy-pages@v5`（Node.js 24）に更新し、実行環境は `ubuntu-24.04` に固定。

### Pagesの404で止まった場合

先に https://github.com/loser4dim/rgb-lifegame/settings/pages を開き、**Build and deployment → Source → GitHub Actions** に設定してください。これはリポジトリの設定であり、ソースファイルの変更だけでは有効になりません。設定後、修正版をpushするかActionsからワークフローを再実行してください。

`configure-pages` の `enablement: true` だけを付けても標準のGITHUB_TOKENではPages自体を有効にできないため、この版では個人アクセストークンを要求せず、GitHubの設定画面を使います。

WASMの読み込みURLはコンパイル結果のSHA-256で変わるため、Full-HD版へ更新後に以前の512セル上限のWASMが再利用される問題を防ぎます。Workerの配信URLもNext.jsのビルドで変わります。
