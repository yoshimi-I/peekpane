# peekpane

ローカルファイルをターミナルやNeovimの隣でプレビューするツールです。現在はprivateの開発版です。仕様の正本は [English README](README.md) です。

## インストール

Node.js 20以上、Ghosttyなどkitty graphics対応ターミナルが必要です。macOS/Linuxが対象で、tmux 3.2以上は任意です。`npm ci`で描画用のPixelとElectronランタイムを導入します。ブラウザアプリの別途インストールは不要です。初回インストール時のみダウンロードが発生します。

```sh
npm ci
npm link
peekpane README.ja.md
```

## 使い方

```sh
peekpane report.md:42 --split left --size 0.45
peekpane image.png
peekpane scroll report.md 80
printf '# 保存前の内容\n' | peekpane push report.md --line 1
peekpane ls --json
peekpane focus
peekpane zoom
peekpane close report.md
peekpane close
```

Markdown、Mermaid、HTML、画像、PDF、動画、音声、CSV/TSV、Excel、JSON/YAML、テキストに対応します。Markdownの表・チェックボックス・脚注・コードハイライト・数式にも対応します。MDXのJSXは実行しません。Mermaidは図があるときだけ読み込みます。画像は幅合わせと等倍を切り替えられ、表は見出しをクリックして並べ替えられます。

複数のプレビューでElectron本体とGPUなどの補助プロセスを共有し、最後のプレビューを閉じると終了します。文書用の描画上限は既定30fpsです。連携にはキャッシュ内の権限を制限したUnixソケットを使い、TCPポートは開きません。

タブやアドレスバーはなく、CSS付きの本文だけを表示します。ファイルの変更通知から画面へ直接更新を送り、定期的な画面側の確認処理は行いません。カーソル移動だけでは本文を再描画しません。同じファイルは再利用します。`--type`で種類を指定、`--css`でローカルCSSを追加できます。終了コードは成功0、実行時エラー1、引数エラー2です。

## 設定とNeovim

`~/.config/peekpane/config.json`にsplit、size、focus_key、zoom_key、cssを設定できます。キーにfalseを指定すると無効になります。tmuxでは既定のAlt+Pでフォーカス切り替え、Alt+Shift+Pでズームします。`close`で最後のプレビューを閉じると元のバインドを復元します。tmux外ではフォーカス・ズームは使えません。

```lua
{
  'yoshimi-I/peekpane',
  -- dir = vim.fn.expand('~/Desktop/OSS/peekpane'), -- local development
  main = 'peekpane',
  build = 'npm ci',
  cmd = { 'Peek', 'PeekScroll', 'PeekFocus', 'PeekZoom' },
  keys = {
    { '<leader>mp', '<cmd>Peek toggle<cr>', desc = 'Preview: toggle' },
  },
  opts = function(plugin)
    return {
      split = 'right', size = 0.45, follow_cursor = true,
      cmd = { 'node', plugin.dir .. '/bin/peekpane.js' },
    }
  end,
}
```

この設定ではプラグイン内のCLIを直接呼ぶため、Neovim用に`npm link`は不要です。Node.js 20以上とnpmがNeovimのPATH上に必要です。現在のローカル開発では`dir`のコメントを外してcheckout先を指定してください。ターミナルのグローバルコマンドも使う場合は、checkoutで`npm link`を実行します。`:Peek [open|close|toggle] [方向]`、`:PeekScroll [行]`、`:PeekFocus`、`:PeekZoom`を提供します。保存前の変更を150msのデバウンスで送ります。新規ファイルは一度保存してください。バッファやNeovimを閉じると、そのNeovimが開いたプレビューを閉じます。

## エージェント連携

[skills/peekpane/SKILL.md](skills/peekpane/SKILL.md)を各エージェントのスキルディレクトリへsymlinkできます。dotfilesの`make agents`との接続や許可設定の変更はこのリポジトリでは行いません。

## セキュリティと制限

表示はfile://とローカル同梱ライブラリだけを使います。peekpane自身は待ち受けポートを開きません。キャッシュは`$XDG_CACHE_HOME/peekpane`または`~/.cache/peekpane`に置き、ディレクトリ700・ファイル600とします。close時に表示内容を削除します。

実行時はfile/data/blob/aboutのローカル資源だけを許可し、外部通信・外部ページへの移動・ポップアップ・各種権限要求を遮断します。デバッグ用TCPポートも開きません。描画ライブラリのプロセス間連携にはローカルのUnixソケットを使います。生HTMLとローカルJSは実行できるため、信頼できるファイルだけを開いてください。

macOS/Ghostty/tmuxでMarkdown・数式・Mermaid・保存前更新・PNG/SVG・相対パスのHTML/CSS/JS・CSV・Excelを確認しました。起動は手元で約1.5秒、5,001行のMarkdownの本文生成は中央値14msでした。CSS描画用のChromiumのメモリは引き続き必要です。PDF・動画とLinuxの確認状況は[検証記録](docs/validation.md)を参照してください。

開発手順と詳細設定は英語READMEを参照してください。MITライセンスです。
