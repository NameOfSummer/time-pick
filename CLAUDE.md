# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

TimePick は、ホストの Google カレンダーの空き時間に、ゲストが Google アカウントなしで予約できる Google Apps Script（GAS）の Web アプリ。1つの GAS デプロイが 1つの予約ページになる。導入手順・運用は [README.md](README.md) にある。

## コマンド

```bash
npm run dev          # Vite の開発サーバー（http://127.0.0.1:3456、?page=admin で管理画面）。GAS 呼び出しはモック
npm run build:gas    # GAS 用ビルド。ルートの WebApp.html を作る
npm run preview      # build:gas 後の WebApp.html をローカルで配信して確認
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .（JSDoc の欠けもエラーになる）
node tools/time-test.mjs                # タイムゾーン変換の確認
node --test tools/deploy-gas.test.mjs   # 自動デプロイの設定読み取りのテスト（node:test）
clasp push           # GAS へアップロード（画面を変えたら先に build:gas）
```

CI（[.github/workflows/ci.yml](.github/workflows/ci.yml)）は PR で `npm ci` → typecheck → lint → build:gas → 上の2つのテスト を回す。`main` への push で [deploy.yml](.github/workflows/deploy.yml) が同じチェックのあと `tools/deploy-gas.mjs` を実行し、Secret `DEPLOY_TARGETS` の全プロジェクトへ同じ URL のまま載せる。

テストフレームワークは入っていない。`time-test.mjs` は `Time.js` を読み込まず、`zonedTimeToUtc_` と同じ処理を写したもの。`Time.js` の変換を変えたら、こちらも合わせる。

## 構成

2つの世界が1つのリポジトリにある。

- **サーバー（GAS）**: ルートの `*.js`。GAS ではファイルが全部同じグローバルスコープに読み込まれるので、`import` はなく、他ファイルの関数を名前で直接呼ぶ。
  - `Code.js` … 入口 `doGet` と、画面から呼ぶ公開関数（`getPublicConfig`、`getSlots`、`createBooking`、`getBooking`、`cancelBooking`、`adminGetState`、`adminSaveSettings`）、初回セットアップ `setupTimePick`
  - `Settings.js` … 設定・管理キー・シート ID をスクリプトプロパティに保存（設定は `SLOTL_SETTINGS` キーに JSON）。管理キー検証と入力検証
  - `Availability.js` … FreeBusy で空き枠を計算（キャッシュあり）。`Booking.js` … 予約作成・キャンセル・メール・ICS。`CalendarIO.js` … 予定の作成と削除（Calendar API、失敗時は CalendarApp）。`Store.js` … 予約データのスプレッドシート。`Time.js` … タイムゾーンと時刻の計算
- **画面（React）**: `src/`。`App.tsx` が state をまとめて持ち、`?page=` で book / done / cancel / admin を切り替える。

### 画面とサーバーのつながり

- `npm run build:gas` で、`vite.config.ts` の `gasHtmlPlugin` が JS と CSS を `WebApp.html` 1枚に埋め込む。GAS は `document.write` で HTML を出すため、`type="module"`、外部 script、`import.meta`、`<?` が残るとビルドを失敗させている。フォントは CDN から読む（`src/fonts-gas.css` に差し替え）。
- `doGet` は `WebApp.html` の `__SLOTL_PAGE_TITLE__` と `__SLOTL_BOOTSTRAP__` を文字列置換して、画面・トークン・管理キー・URL を渡す（GAS の `<?` テンプレートは使わない）。画面側は `src/lib/bootstrap.ts` で読む。
- 画面からの呼び出しは `src/lib/gas-api.ts` が `google.script.run` を Promise にする。サーバーの公開関数を足すときは、`Code.js`、`gas-api.ts` の `GasRun` 型と `actions` 配列、`src/lib/preview-api.ts` のモックをそろえる。
- `google.script.run` は null を含むオブジェクトをうまく渡せないため、`adminSaveSettings` は JSON 文字列で送り、サーバー側 `parseClientPatch_` で戻す。
- `google.script.run` がないとき（`npm run dev` と `npm run preview`）は、`preview-api.ts` が sessionStorage を使ったモックを差し込む。
- 時間の上限・刻み（15〜240分、15分刻み、最大365日先）は `Time.js` と `src/lib/booking.ts` の両方にある。

## 規約

README の「コーディング規約」に従う。とくに次は lint や GAS の動作に関わる。

- `function` 宣言とファイル直下の `const` / `type`（GAS では `var`）には日本語の JSDoc が必須。引数ごとの `@param`、`@returns` も必須で、戻り値がない関数は `@returns {void}` と書く（独自ルール `slotly/void-returns`）。分割代入の引数は `@param props`
- GAS 側は ES5 風に `var` と `function`、シングルクォート。画面から呼ぶ関数はアンダースコアなし、内部用は末尾 `_`
- `src/` のファイル名はケバブケース、参照は `@/`、型は `import type`（`verbatimModuleSyntax`）。部品は名前付き `export function`。`cn` は `"cn"` パッケージから取る。見た目は shadcn/ui と Tailwind
- `WebApp.html`、`gas-dist/`、`.clasp.json` は Git に入れない。`WebApp.html` は手で編集しない
- 内部の識別子に旧名 `slotl` / `slotly`（`SLOTL_SETTINGS`、`__SLOTL_BOOTSTRAP__`、`initializeSlotly_`）が残っている。既存のデプロイが保存済みの設定を読めなくなるため、勝手に名前を変えない
- `.npmrc` で `ignore-scripts=true` と `min-release-age=7` を設定している
