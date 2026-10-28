import { installInteraction } from "./interaction.js";
const clientUrl = document.currentScript.src;
let revision =
    Number(document.querySelector("meta[name=peekpane-revision]")?.content) ||
    0,
  busy = false,
  lastLine = 0;
async function enhance() {
  const diagrams = document.querySelectorAll(".mermaid");
  if (diagrams.length) {
    try {
      if (!window.mermaid) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = new URL(
            "mermaid.js",
            document.currentScript?.src || clientUrl,
          ).href;
          s.onload = resolve;
          s.onerror = reject;
          document.head.append(s);
        });
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
        });
      }
      await window.mermaid.run({ nodes: diagrams });
    } catch (e) {
      console.warn("Mermaid:", e.message);
    }
  }
  document
    .querySelector("#image-fit")
    ?.addEventListener("click", () =>
      document.querySelector(".preview-image")?.classList.toggle("fit"),
    );
  document
    .querySelectorAll("[data-sheet]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        document
          .querySelectorAll("[data-sheet-panel]")
          .forEach(
            (p) => (p.hidden = p.dataset.sheetPanel !== b.dataset.sheet),
          ),
      ),
    );
  document.querySelectorAll("table.sortable th").forEach((th, column) => {
    let descending = false;
    const sort = () => {
      const tbody = th.closest("table").tBodies[0];
      const rows = [...tbody.rows];
      rows.sort(
        (a, b) =>
          a.cells[column]?.textContent.localeCompare(
            b.cells[column]?.textContent,
            undefined,
            { numeric: true },
          ) * (descending ? -1 : 1),
      );
      descending = !descending;
      tbody.append(...rows);
    };
    th.addEventListener("click", sort);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sort();
    });
  });
}
const saved = sessionStorage.getItem(location.href);
if (saved) window.scrollTo(0, Number(saved));
window.addEventListener(
  "scroll",
  () => sessionStorage.setItem(location.href, String(window.scrollY)),
  { passive: true },
);
window.peekpaneUpdate = async (state, next) => {
  if (!state || busy) return;
  busy = true;
  try {
    if (state.revision !== revision) {
      if (revision) {
        if (
          document.querySelector("meta[name=peekpane-type]")?.content === "html"
        ) {
          location.reload();
          return;
        }
        if (next?.revision !== state.revision) return;
        const dom = new DOMParser().parseFromString(next.html, "text/html");
        for (const link of dom.head.querySelectorAll("link[rel=stylesheet]")) {
          if (
            ![...document.head.querySelectorAll("link[rel=stylesheet]")].some(
              (current) => current.href === link.href,
            )
          )
            document.head.append(link.cloneNode());
        }
        const y = scrollY;
        document
          .querySelector("#preview")
          .replaceChildren(...dom.querySelector("#preview").childNodes);
        await enhance();
        window.scrollTo(0, y);
      }
      revision = state.revision;
    }
    if (state.line !== lastLine) {
      lastLine = state.line;
      const target = [...document.querySelectorAll("[data-line]")]
        .reverse()
        .find((n) => Number(n.dataset.line) <= lastLine);
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  } finally {
    busy = false;
  }
};
window.peekpaneReady = enhance();

installInteraction();
