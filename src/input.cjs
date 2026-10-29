const mouseTypes = new Set(["mouseDown", "mouseUp", "mouseMove", "mouseWheel"]);
const buttons = new Set(["left", "middle", "right"]);
const modifiers = new Set([
  "shift",
  "control",
  "alt",
  "meta",
  "leftButtonDown",
  "middleButtonDown",
  "rightButtonDown",
]);
function mouseEvent(action) {
  if (
    action.kind !== "mouse" ||
    !mouseTypes.has(action.type) ||
    !Number.isFinite(action.x) ||
    !Number.isFinite(action.y) ||
    Math.abs(action.x) > 32768 ||
    Math.abs(action.y) > 32768
  )
    return;
  const event = {
    type: action.type,
    x: Math.round(action.x),
    y: Math.round(action.y),
  };
  if (action.button !== undefined) {
    if (!buttons.has(action.button)) return;
    event.button = action.button;
  }
  if (["mouseDown", "mouseUp"].includes(event.type)) {
    if (!event.button) return;
    if (action.clickCount !== undefined && !Number.isFinite(action.clickCount))
      return;
    event.clickCount = Math.max(
      1,
      Math.min(3, Math.round(action.clickCount || 1)),
    );
  }
  if (event.type === "mouseWheel") {
    const dx = action.deltaX ?? 0,
      dy = action.deltaY ?? 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    event.deltaX = Math.max(-100000, Math.min(100000, dx));
    event.deltaY = Math.max(-100000, Math.min(100000, dy));
    event.hasPreciseScrollingDeltas = true;
    event.canScroll = true;
  }
  event.modifiers = Array.isArray(action.modifiers)
    ? action.modifiers.filter((m) => modifiers.has(m))
    : [];
  return event;
}
function coalesce(actions) {
  const result = [];
  for (const action of actions) {
    if (!action || typeof action !== "object") continue;
    if (typeof action.key === "string") {
      result.push({ key: action });
      continue;
    }
    const event = mouseEvent(action);
    if (!event) continue;
    const previous = result.at(-1)?.mouse;
    const sameModifiers =
      previous &&
      JSON.stringify(previous.modifiers) === JSON.stringify(event.modifiers);
    if (
      event.type === "mouseMove" &&
      previous?.type === "mouseMove" &&
      previous.button === event.button &&
      sameModifiers
    )
      result[result.length - 1] = { mouse: event };
    else if (
      event.type === "mouseWheel" &&
      previous?.type === "mouseWheel" &&
      previous.x === event.x &&
      previous.y === event.y &&
      sameModifiers
    ) {
      previous.deltaX += event.deltaX;
      previous.deltaY += event.deltaY;
    } else result.push({ mouse: event });
  }
  return result;
}
async function dispatchInput(contents, actions) {
  let mousePending = false;
  let keys = [];
  async function flushMouse() {
    if (!mousePending) return;
    mousePending = false;
    // Let trusted native input reach the DOM before a subsequent yank or frame.
    await contents.executeJavaScript(
      "(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await window.peekpaneFlush?.()})()",
    );
  }
  async function flushKeys() {
    if (!keys.length) return;
    await contents.executeJavaScript(
      `(async()=>{for(const action of ${JSON.stringify(keys)}) await window.peekpaneKey?.(action)})()`,
    );
    keys = [];
  }
  for (const item of coalesce(actions)) {
    if (item.key) {
      await flushMouse();
      keys.push(item.key);
    } else {
      await flushKeys();
      if (item.mouse.type === "mouseDown") contents.focus?.();
      contents.sendInputEvent(item.mouse);
      mousePending = true;
    }
  }
  await flushKeys();
  await flushMouse();
}
module.exports = { dispatchInput };
