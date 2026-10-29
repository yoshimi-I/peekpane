// Operate on the rendered DOM, rather than a screenshot or Markdown source.
export function installInteraction() {
  let visual = false;
  window.peekpaneVisual = false;
  function finish() {
    visual = false;
    window.peekpaneVisual = false;
    selection().removeAllRanges();
    return window.peekpaneFlush?.();
  }
  function selection() {
    return window.getSelection();
  }
  function begin() {
    const selected = selection();
    if (!selected.isCollapsed && selected.rangeCount) return true;
    const preview = document.querySelector("#preview");
    if (!preview) return false;
    const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (
          !node.textContent.trim() ||
          node.parentElement.closest("script,style,.katex-mathml")
        )
          return NodeFilter.FILTER_REJECT;
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].some(
          (box) =>
            box.bottom > 0 &&
            box.top < innerHeight &&
            box.right > 0 &&
            box.left < innerWidth &&
            box.width > 0,
        )
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const node = walker.nextNode();
    if (!node) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    const visible = [...range.getClientRects()].filter(
      (box) =>
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth,
    );
    const box =
      visible.find((rect) => rect.top >= 0 && rect.bottom <= innerHeight) ||
      visible[0];
    let offset = 0;
    if (box) {
      const rtl = getComputedStyle(node.parentElement).direction === "rtl";
      const x = rtl
        ? Math.min(innerWidth - 1, box.right - 1)
        : Math.max(0, box.left) + 1;
      const y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2;
      const caret = document.caretRangeFromPoint(x, y);
      if (caret?.startContainer === node) offset = caret.startOffset;
    }
    selected.collapse(node, offset);
    selected.modify("extend", "forward", "character");
    return true;
  }
  document.addEventListener("click", (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest?.("a[href]");
    const href = link?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    // The resource base points to the source directory, not this cache page.
    // Fragment links must stay on the current document rather than that base.
    event.preventDefault();
    if (href === "#") window.scrollTo({ top: 0, behavior: "instant" });
    else {
      const same = location.hash === href;
      location.hash = href;
      if (same) {
        try {
          document
            .getElementById(decodeURIComponent(href.slice(1)))
            ?.scrollIntoView({ behavior: "instant" });
        } catch {
          /* Invalid escape sequences do not identify an element. */
        }
      }
    }
  });
  document.addEventListener("selectionchange", () => {
    const active =
      !selection().isCollapsed && selection().toString().length > 0;
    if (active === visual) return;
    visual = active;
    window.peekpaneVisual = active;
    if (!active) window.peekpaneFlush?.();
  });
  window.peekpaneKey = async ({ key, count = 1, ctrl = false }) => {
    const target = document.activeElement || document.body;
    for (let i = 0; i < Math.max(1, Math.min(10000, count)); i++)
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          ctrlKey: ctrl,
          bubbles: true,
          cancelable: true,
        }),
      );
    await window.peekpaneFlush?.();
    return {
      selectionLength: selection().toString().length,
      scrollY: window.scrollY,
    };
  };
  document.addEventListener("keydown", (event) => {
    if (
      event.target.closest?.("input,textarea,select,[contenteditable=true]") ||
      event.altKey
    )
      return;
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "c") {
      const text = selection().toString();
      if (text && window.peekpaneHost) {
        event.preventDefault();
        window.peekpaneHost.copy(text);
      }
      return;
    }
    if (event.ctrlKey && (key === "d" || key === "u")) {
      event.preventDefault();
      window.scrollBy({
        top: (innerHeight / 2) * (key === "d" ? 1 : -1),
        behavior: "instant",
      });
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    if (key === "Escape") {
      finish();
      return;
    }
    if (key === "v") {
      if (begin()) {
        visual = !visual;
        window.peekpaneVisual = visual;
        if (!visual) finish();
        event.preventDefault();
      }
      return;
    }
    if (key === "y") {
      const text = selection().toString();
      if (text && window.peekpaneHost) {
        event.preventDefault();
        window.peekpaneHost.copy(text);
        finish();
      }
      return;
    }
    if (visual) {
      const motion = {
        h: ["backward", "character"],
        l: ["forward", "character"],
        j: ["forward", "line"],
        k: ["backward", "line"],
        w: ["forward", "word"],
        b: ["backward", "word"],
        0: ["backward", "lineboundary"],
        $: ["forward", "lineboundary"],
      }[key];
      if (motion) {
        event.preventDefault();
        selection().modify("extend", ...motion);
        selection().focusNode?.parentElement?.scrollIntoView({
          block: "nearest",
        });
      }
      return;
    }
    if (key === "j" || key === "k") {
      event.preventDefault();
      window.scrollBy({ top: key === "j" ? 48 : -48, behavior: "instant" });
    }
    if (key === "G") {
      event.preventDefault();
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      });
    }
  });
}
