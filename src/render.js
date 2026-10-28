import MarkdownIt from "markdown-it";
import tasks from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { allowed } = require("./policy.cjs");
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function markdown(math) {
  const md = new MarkdownIt({
    html: true,
    highlight: (s, lang) => {
      const hljs = require("highlight.js/lib/common");
      return hljs.getLanguage(lang)
        ? hljs.highlight(s, { language: lang }).value
        : escape(s);
    },
  })
    .use(tasks)
    .use(footnote);
  if (math)
    md.use(require("markdown-it-texmath"), {
      engine: require("katex"),
      delimiters: "dollars",
      katexOptions: { trust: false, throwOnError: false },
    });
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, i, opts, env, self) => {
    const token = tokens[i];
    const source = token.attrGet("src");
    const url = URL.canParse(source, "file:///")
      ? new URL(source, "file:///").href
      : "";
    if (!allowed(url)) {
      const label =
        self.renderInlineAsText(token.children, opts, env) || "External image";
      return `<span class="offline-image" title="External image unavailable in offline preview">${escape(label)}</span>`;
    }
    return image(tokens, i, opts, env, self);
  };
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, i, opts, env, self) =>
    tokens[i].info.trim() === "mermaid"
      ? `<pre class="mermaid" data-line="${tokens[i].map[0] + 1}">${escape(tokens[i].content)}</pre>`
      : fence(tokens, i, opts, env, self);
  const original = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (tokens, i, opts) => {
    if (tokens[i].map && tokens[i].nesting !== -1)
      tokens[i].attrSet("data-line", String(tokens[i].map[0] + 1));
    return original(tokens, i, opts);
  };
  return md;
}
const engines = new Map();
function markdownBody(content) {
  const math = content.includes("$");
  if (!engines.has(math)) engines.set(math, markdown(math));
  return engines.get(math).render(content);
}
const asset = (name) =>
  pathToFileURL(fileURLToPath(new URL(`../assets/${name}`, import.meta.url)))
    .href;
function table(rows) {
  return `<table class="sortable"><thead><tr>${(rows[0] || []).map((v) => `<th tabindex="0">${escape(v)}</th>`).join("")}</tr></thead><tbody>${rows
    .slice(1)
    .map(
      (r, i) =>
        `<tr data-line="${i + 2}">${r.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}
function tree(value) {
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(
        ([k, v]) =>
          `<details open><summary>${escape(k)}</summary>${tree(v)}</details>`,
      )
      .join("");
  return `<pre>${escape(value)}</pre>`;
}
export function body({ file, type, content = "" }) {
  const url = escape(pathToFileURL(file).href + `?v=${Date.now()}`);
  switch (type) {
    case "markdown":
      return markdownBody(String(content));
    case "mermaid":
      return `<pre class="mermaid">${escape(content)}</pre>`;
    case "html":
      return String(content);
    case "image":
      return `<button id="image-fit">Fit / Actual size</button><img class="preview-image fit" src="${url}">`;
    case "pdf":
      return `<embed class="document" type="application/pdf" src="${url}">`;
    case "video":
    case "audio":
      return `<${type} controls src="${url}"></${type}>`;
    case "csv":
    case "tsv":
      return table(
        require("papaparse").parse(String(content), {
          delimiter: type === "tsv" ? "\t" : ",",
          skipEmptyLines: true,
        }).data,
      );
    case "excel": {
      const XLSX = require("xlsx");
      const book = XLSX.read(content, { type: "buffer" });
      return (
        `<nav>${book.SheetNames.map((n, i) => `<button data-sheet="${i}">${escape(n)}</button>`).join("")}</nav>` +
        book.SheetNames.map(
          (n, i) =>
            `<section data-sheet-panel="${i}" ${i ? "hidden" : ""}>${table(XLSX.utils.sheet_to_json(book.Sheets[n], { header: 1, defval: "" }))}</section>`,
        ).join("")
      );
    }
    case "json":
      return tree(JSON.parse(content));
    case "yaml":
      return tree(require("yaml").parse(String(content)));
    default:
      return `<pre>${String(content)
        .split("\n")
        .map((l, i) => `<span data-line="${i + 1}">${escape(l)}</span>`)
        .join("\n")}</pre>`;
  }
}
export function render(input) {
  const base = pathToFileURL(path.dirname(input.file) + path.sep).href;
  let csp =
    "default-src 'none'; script-src file: 'unsafe-inline'; style-src file: 'unsafe-inline'; img-src file: data: blob:; font-src file: data:; media-src file: blob:; object-src file:; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri file:";
  if (input.type === "pdf")
    csp = csp.replace("frame-src 'none'", "frame-src file:");
  let html = body(input);
  // HTML must get the policy before any user markup can load a resource.
  if (input.type === "html")
    html = html
      .replace(/<!doctype[^>]*>|<\/?(?:html|head|body)[^>]*>/gi, "")
      .replace(/<base\b[^>]*>/gi, "");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base href="${escape(base)}"><meta name="peekpane-type" content="${escape(input.type)}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(path.basename(input.file))} · peekpane</title>${input.type !== "html" ? `<link rel="stylesheet" href="${asset("style.css")}">` : ""}${html.includes('class="katex') ? `<link rel="stylesheet" href="${asset("katex.min.css")}">` : ""}${input.css ? `<link rel="stylesheet" href="${escape(pathToFileURL(input.css).href)}">` : ""}</head><body><main id="preview">${html}</main><script src="${asset("client.js")}"></script></body></html>`;
}
