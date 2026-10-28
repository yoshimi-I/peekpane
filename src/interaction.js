// Operate on the rendered DOM, rather than a screenshot or Markdown source.
export function installInteraction() {
  let visual = false;
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
    if (event.metaKey || event.ctrlKey) return;
    if (key === "Escape") {
      visual = false;
      selection().removeAllRanges();
      return;
    }
    if (key === "v") {
      if (begin()) {
        visual = !visual;
        event.preventDefault();
      }
      return;
    }
    if (key === "y") {
      const text = selection().toString();
      if (text && window.peekpaneHost) {
        event.preventDefault();
        window.peekpaneHost.copy(text);
        visual = false;
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
