// Operate on the rendered DOM, rather than a screenshot or Markdown source.
export function installInteraction() {
  let visual = false;
  window.peekpaneVisual = false;
  function finish() {
    visual = false;
    window.peekpaneVisual = false;
    selection().removeAllRanges();
    window.peekpaneFlush?.();
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
        const box = range.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && box.width > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const node = walker.nextNode();
    if (!node) return false;
    selected.collapse(node, 0);
    selected.modify("extend", "forward", "character");
    return true;
  }
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
