import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * この設定ファイルがあるディレクトリ。
 */
const root = import.meta.dirname
/**
 * GAS の画面で読み込むフォントの CSS。
 */
const fontLinks = [
  "https://cdn.jsdelivr.net/npm/@fontsource/line-seed-jp@5.3.1/400.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/line-seed-jp@5.3.1/700.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/line-seed-jp@5.3.1/800.css",
  "https://cdn.jsdelivr.net/npm/@fontsource/poiret-one@5.3.0/index.css",
]

export default defineConfig(({ mode }) => {
  const gas = mode === "gas"
  return {
    base: gas ? "./" : "/",
    plugins: [react(), tailwindcss(), gas ? gasHtmlPlugin(root) : null].filter(
      (plugin) => plugin !== null
    ),
    resolve: {
      alias: [{ find: "@", replacement: path.resolve(root, "src") }],
    },
    server: {
      host: "127.0.0.1",
      port: 3456,
    },
    build: gas
      ? {
          outDir: "gas-dist",
          emptyOutDir: true,
          cssCodeSplit: false,
          assetsInlineLimit: 3 * 1024 * 1024,
          modulePreload: false,
          rollupOptions: {
            output: {
              format: "iife",
              name: "timepick",
              inlineDynamicImports: true,
            },
          },
        }
      : undefined,
  }
})

/**
 * GAS 向けビルドで、HTML を1枚にまとめる。
 * @param projectRoot リポジトリのルート。
 * @returns Vite のプラグイン。
 */
function gasHtmlPlugin(projectRoot: string): Plugin {
  return {
    name: "gas-html",
    apply: "build",
    enforce: "pre",
    resolveId(source) {
      if (source === "./fonts.css" || source.endsWith("/fonts.css")) {
        return path.resolve(projectRoot, "src/fonts-gas.css")
      }
      return null
    },
    transformIndexHtml(html) {
      const links = fontLinks
        .map((href) => `    <link rel="stylesheet" href="${href}" />`)
        .join("\n")
      return html
        .replace(/\s*<link rel="icon"[^>]*>\s*/i, "\n")
        .replace(/<title>[\s\S]*?<\/title>/, "<title>__SLOTL_PAGE_TITLE__</title>")
        .replace(
          /<script id="bootstrap"[^>]*>[\s\S]*?<\/script>/,
          '<script id="bootstrap" type="application/json">__SLOTL_BOOTSTRAP__</script>'
        )
        .replace("</head>", `${links}\n  </head>`)
    },
    closeBundle() {
      const outDir = path.resolve(projectRoot, "gas-dist")
      const htmlPath = path.join(outDir, "index.html")
      if (!fs.existsSync(htmlPath)) {
        return
      }
      const html = inlineBuiltHtml(fs.readFileSync(htmlPath, "utf8"), outDir)
      assertGasSafeHtml(html)
      fs.writeFileSync(path.resolve(projectRoot, "WebApp.html"), html)
    },
  }
}

/**
 * ビルド結果の CSS とスクリプトを HTML に埋め込む。
 * @param html ビルドされた HTML。
 * @param outDir ビルド出力ディレクトリ。
 * @returns 1枚にまとめた HTML。
 */
function inlineBuiltHtml(html: string, outDir: string): string {
  let script = ""
  let next = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, "")
  next = next.replace(
    /<link rel="stylesheet"(?![^>]*https?:)[^>]*href="([^"]+)"[^>]*>/g,
    (_match, href: string) => {
      const css = readBuiltFile(outDir, href).replace(/<\/style/gi, "<\\/style")
      return `<style>${css}</style>`
    }
  )
  next = next.replace(
    /<script(?![^>]*type=["']application\/json["'])[^>]*src="([^"]+)"[^>]*><\/script>\s*/g,
    (_match, href: string) => {
      script = `<script>${escapeForGasScript(readBuiltFile(outDir, href))}</script>`
      return ""
    }
  )
  if (!script) {
    throw new Error("GAS 用に埋め込むスクリプトが見つかりません。")
  }
  next = next.replace("</body>", () => `${script}\n  </body>`)
  return next
}

/**
 * Apps Script の document.write でも動くよう、モジュール構文と script タグを除く。
 * @param js 埋め込むスクリプト。
 * @returns 画面に載せられるスクリプト。
 */
function escapeForGasScript(js: string): string {
  return js
    .replace(/\bimport\.meta\b/g, "undefined")
    .replace(/<\?/g, "<\\u003f")
    .replace(/<script/gi, "<\\x3cscript")
    .replace(/<\/script/gi, "<\\/script")
    .replace(/(^|[^\\])\/\//g, "$1\\/\\/")
}

/**
 * GAS ではモジュールスクリプトを document.write できない。
 * @param html まとめた HTML。
 * @returns {void}
 */
function assertGasSafeHtml(html: string): void {
  if (/<script[^>]*type=["']module["']/.test(html)) {
    throw new Error('WebApp.html に type="module" が残っています。')
  }
  if (/<script[^>]*\ssrc=/.test(html)) {
    throw new Error("WebApp.html に外部スクリプトが残っています。")
  }
  if (html.includes("import.meta")) {
    throw new Error("WebApp.html に import.meta が残っています。")
  }
  if (html.includes("<?")) {
    throw new Error("WebApp.html に <? が残っています。")
  }
}

/**
 * ビルド出力から、HTML が参照するファイルを読む。
 * @param outDir ビルド出力ディレクトリ。
 * @param href HTML 内の参照パス。
 * @returns ファイルの中身。
 */
function readBuiltFile(outDir: string, href: string): string {
  const relative = href.replace(/^\.\//, "").replace(/^\//, "")
  return fs.readFileSync(path.join(outDir, relative), "utf8")
}
