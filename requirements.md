# peekpane 要件定義

最終更新: 2026-10-28

## 実装中の変更（会話での指示を反映）

- 軽さを優先し、タブやアドレスバーなどブラウザUIは不要とする。
- CSSによる見た目は維持する。terminal-browserアプリ経由ではなく、その基盤のPixelを直接使う専用ビューアに変更する。
- サーバーは設けずfile://で表示する。画面側のポーリングを廃止し、ローカルファイルの変更通知で更新する。
- 以下は当初の要件。実装と検証の最新状況はREADMEとdocs/validation.mdを参照する。

## 1. 概要

ターミナルのペインに、ファイルの「見た目どおりの」プレビューを表示する OSS ツールにする。Markdown、HTML、画像、PDF、動画などに対応する。

- ターミナルから単体の CLI として使える
- Neovim のプラグインとしても使える
- AI エージェント（Claude Code / Codex / kiro-cli）から呼び出せる

前身は dotfiles 内で試作した `mdpane.nvim`（Markdown 専用・Neovim 専用）。これを汎用化する。

## 2. 背景・目的

- ターミナル内では Markdown の表や見出しがきれいに表示できない。markview.nvim だと、長い行がある表は描画されなかった
- HTML、画像、PDF、動画、Excel を確認するたびに、ターミナルから GUI アプリへ切り替えている
- AI エージェントが作ったドキュメントや画像を、ユーザーにその場で見せる手段がない

**目的**: ターミナルから離れずに、あらゆるドキュメントを編集しながら確認できるようにする。

## 3. 用語

| 用語 | 意味 |
|---|---|
| プレビュー | ブラウザの描画エンジンで表示した、ファイルの見た目 |
| ペイン | tmux（または terminal-browser）で分割した画面の区画 |
| terminal-browser | ターミナルのペインの中で動くブラウザ（Electron 製、v0.7.6 以上）。peekpane の表示に使う |
| エディタ | ユーザーがファイルを編集しているペイン（Neovim など） |

## 4. 名前・公開形態

| 項目 | 内容 |
|---|---|
| 名前 | `peekpane` |
| リポジトリ | `github.com/yoshimi-I/peekpane`。**当面は private**。public にする時期は別途決める |
| 構成 | 1 つのリポジトリに CLI 本体と Neovim プラグイン（`lua/`、`plugin/`）を同梱する。lazy.nvim では `'yoshimi-I/peekpane'` で入れられる |
| ライセンス | MIT（**未決**: Q1） |
| 配布 | private の間は `npm link` か dotfiles からの symlink。npm への公開は public にするとき（**未決**: Q3） |

## 5. 機能要件

### 5.1 対応するファイルの種類

| 優先度 | 種類 | 拡張子 | 表示 | ライブ更新 |
|---|---|---|---|---|
| 必須 | Markdown | md / mdx / markdown | markdown-it と CSS で描画。チェックボックス、表、脚注に対応 | エディタ連携時は保存前の編集も反映。単体時はファイルを保存したとき |
| 必須 | Mermaid | md 内の ` ```mermaid `、`.mmd` | 図として描画 | 同上 |
| 必須 | HTML | html / htm | ファイルそのものを表示する。相対パスの CSS / JS / 画像は元の場所を基準に読み込む | 再読み込みする（スクロール位置は保つ） |
| 必須 | 画像 | png / jpg / jpeg / gif / webp / svg / avif / bmp / ico | 暗い背景のビューア。幅に合わせる表示と等倍表示を切り替えられる | ファイルが変わったら再読み込み |
| 必須 | PDF | pdf | Chromium の PDF ビューア | ファイルが変わったら再読み込み |
| 必須 | 動画 | mp4 / webm / mov / m4v | `<video>` で再生（操作バー付き） | ファイルが変わったら再読み込み |
| 推奨 | コードのハイライト | md のコードブロック | highlight.js | md と同じ |
| 推奨 | CSV / TSV | csv / tsv | 見出し固定・並べ替えできる表 | ファイルが変わったら再描画 |
| 推奨 | Excel | xlsx / xls | シートをタブで切り替える表（SheetJS） | ファイルが変わったら再描画 |
| 推奨 | 数式 | md 内の `$...$` / `$$...$$` | KaTeX | md と同じ |
| 任意 | 音声 | mp3 / wav / m4a / ogg | `<audio>` で再生 | なし |
| 任意 | JSON / YAML | json / yaml / yml | 折りたためるツリー | ファイルが変わったら再描画 |
| 対象外 | Word / PowerPoint / drawio | docx / pptx / drawio | 表示がきれいに再現できないか、ライブラリが大きすぎるため見送る | - |

- 種類は拡張子で判定する。`--type` で上書きもできる
- 対応していない拡張子は、テキストとして表示する

### 5.2 CLI

```
peekpane FILE[:LINE] [--split left|right|up|down] [--size 0.2-0.95] [--type TYPE]
peekpane open FILE[:LINE] [options]      # 上と同じ
peekpane scroll FILE LINE                # 指定した行へスクロール（md、csv など行の概念があるもの）
peekpane push FILE [--line N] < STDIN    # 保存前の内容を送る（エディタ連携用）
peekpane focus                           # エディタ ⇄ プレビューのフォーカス切り替え（案 A）
peekpane zoom                            # プレビューの全画面化 / 解除（案 B）
peekpane close [FILE]                    # FILE を省略したら全部閉じる
peekpane ls [--json]                     # 開いているプレビューの一覧
peekpane help / --version
```

- 同じファイルをもう一度 `open` したら、新しく開かずに既存のプレビューを使い、指定があればスクロールする
- 既存のプレビューがあれば、`FILE` だけで呼べる（エージェントが「この md を見せて」と言われたときに使う）
- 終了コード: 0 は成功、1 は実行時エラー（ファイルがない、terminal-browser がないなど）、2 は使い方の誤り

### 5.3 エディタとプレビューの切り替え

| 案 | 内容 | デフォルト |
|---|---|---|
| **A. フォーカス移動**（デフォルト） | 並べて表示したまま、キーを押すたびに操作対象がエディタ ⇄ プレビューと移る | 有効。キー `M-p`（Alt+P） |
| **B. 全画面表示** | プレビューを全画面にする（tmux の zoom）。もう一度押すと戻る | 有効。キー `M-P`（Alt+Shift+P） |

- キーは設定で変更・無効化できる
- tmux の中では、プレビューを開いている間だけ `bind-key -n` で登録する。最後のプレビューを閉じたら解除し、もとのバインドがあれば元に戻す
- tmux の外では A / B は使わない。terminal-browser の分割機能だけで動かす
- 作者の環境（Ghostty）では、Cmd+P / Cmd+Shift+P を tmux の `M-p` / `M-P` に変換して使う（**未決**: Q2。dotfiles 側で設定する）

### 5.4 ライブ更新

- 単体で使うとき: CLI がファイルを監視し、変更されたら再描画する。エージェントの書き換えにも追従する
- エディタ連携のとき: エディタが `push` で保存前の内容とカーソル行を送り、プレビューが追従してスクロールする
- 表示が反映されるまでの目標: md は入力を止めてから 0.5 秒以内、その他はファイルの変更から 1 秒以内

### 5.5 Neovim プラグイン

- `require('peekpane').setup{}` で設定する
  - `split`、`size`、`focus_key`、`zoom_key`、`follow_cursor`、`css`、`filetypes`、`cmd`（CLI のパス）
- コマンド:
  - `:Peek [open|close|toggle] [left|right|up|down]`
  - `:PeekScroll [line]`、`:PeekFocus`、`:PeekZoom`
- キーマップは提供しない（ユーザーが設定する）。README に `<leader>mp` の例を載せる
- 保存前の編集とカーソル位置を、デバウンス（150ms）して CLI に送る
- バッファを閉じたら、そのプレビューも閉じる。Neovim を終了したら、すべて閉じる
- `$NVIM` がある環境（Neovim の terminal の中）から CLI で `open` したときは、その Neovim でファイルも開く

### 5.6 AI エージェント連携

- `skills/peekpane/SKILL.md` を同梱する。Claude Code / Codex / kiro-cli 共通の書式にする
  - 「ドキュメントや画像を作ったら、ユーザーに見せるために `peekpane` で開く」
  - 「行を指して説明するときは `peekpane scroll` を使う」
- dotfiles の `make agents` で、スキルの symlink と許可設定（`peekpane` の実行を自動で許可する）を入れる

### 5.7 カスタマイズ

- テーマ: 既定はダーク（Ayu Mirage 系）。ターミナルの背景色に合わせる
- 追加の CSS ファイルを読み込める（`--css` / `css`）
- 設定ファイル `~/.config/peekpane/config.json`（split、size、キー、CSS）。CLI のオプションの方が優先される

## 6. 非機能要件

### 6.1 セキュリティ・プライバシー

- **ネットワークに一切アクセスしない**。ライブラリはすべて同梱し、CDN は使わない（お客様資料を扱うことを想定）
- **待ち受けポートを開かない**。表示は `file://` だけで完結させる
- 一時ファイルは、ユーザー専用のキャッシュディレクトリ（`$XDG_CACHE_HOME/peekpane`、パーミッション 700）に置く
- md 内の生 HTML は表示する（markdown-it の `html: true`）。外部から受け取ったファイルを開くときの注意点を README に書く

### 6.2 性能

- 起動してからプレビューが表示されるまで: 2 秒以内（terminal-browser の起動を含む）
- 5,000 行の md を、入力のたびに再描画しても固まらない

### 6.3 動作環境

- macOS（主対象）と Linux
- Node.js 20 以上、terminal-browser 0.7 以上、tmux 3.2 以上（任意）、Neovim 0.10 以上（プラグインを使う場合）

### 6.4 品質

- CLI の単体テスト（node:test）と、Neovim プラグインの headless テスト
- GitHub Actions で macOS / Linux、Node 20 / 22、Neovim stable / nightly を回す
- Lint: ESLint（CLI）、stylua と luacheck（Lua）
- 同梱ライブラリのバージョンとライセンスを `THIRD_PARTY_NOTICES.md` に記載し、更新用のスクリプトを用意する
- CHANGELOG（Keep a Changelog 形式）とセマンティックバージョニング

### 6.5 ドキュメント

- `README.md`（英語、これを正とする）と `README.ja.md`（日本語）（**未決**: Q4）
  - スクリーンショット、インストール方法、使い方、設定、エージェント連携、セキュリティ
- `doc/peekpane.txt`（Neovim の `:help`）

## 7. 同梱するライブラリ（予定）

| ライブラリ | 用途 | ライセンス | サイズ（目安） |
|---|---|---|---|
| markdown-it + task-lists / footnote | Markdown | MIT / ISC | 約 110KB |
| highlight.js（主要言語版） | コードのハイライト | BSD-3-Clause | 約 100KB |
| Mermaid | 図 | MIT | 約 3MB |
| KaTeX | 数式 | MIT | 約 300KB と フォント |
| SheetJS CE（公式の配布元にある最新版） | Excel | Apache-2.0 | 約 1MB |

npm に上がっている SheetJS（0.18.5）は古く、既知の脆弱性（CVE-2023-30533）があるので使わない。

## 8. 対象外（今回はやらない）

- Word / PowerPoint / drawio の表示
- プレビュー側で編集して、エディタに書き戻すこと
- Windows 対応
- VS Code など、Neovim 以外のエディタとの連携（CLI の `push` で、後から対応できる形にはしておく）

## 9. 未決事項

| # | 内容 | 推奨 |
|---|---|---|
| Q1 | ライセンス | MIT |
| Q2 | 作者の環境でのキー | Ghostty で Cmd+P / Cmd+Shift+P を tmux の `M-p` / `M-P` に変換する（dotfiles 側で設定） |
| Q3 | npm への公開時期 | public にするときに公開する |
| Q4 | README の言語 | 英語を正にして、日本語版も付ける |
| Q5 | PDF / 動画が terminal-browser で動くか | 実装の最初に確認する。動かなければ代わりの方法を相談する |

## 10. 受け入れ条件

1. ターミナルで `peekpane README.md` → プレビューが開き、ファイルを保存すると 1 秒以内に反映される
2. Neovim で `:Peek` → 設定した向き（例: 左）にプレビューが開き、保存前の入力とカーソル位置に追従する
3. `M-p` でエディタ ⇄ プレビューのフォーカスが移り、`M-P` でプレビューが全画面になる / 戻る。最後のプレビューを閉じると、キーの登録が解除される
4. html / png / svg / pdf / mp4 / csv / xlsx と、Mermaid と数式を含む md が、それぞれ正しく表示される
5. Claude Code から「この画像を見せて」と頼むと `peekpane` で開かれる
6. 表示中にネットワークへのアクセスが 1 件も発生しない（terminal-browser の開発者ツールで確認する）
7. CI がすべて通る
