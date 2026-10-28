const transientErrors = new Set([
  "UnknownVizError",
  "VizSentEmptyBitmap",
  "EmbeddingTokenChanged",
  "Timeout",
]);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Surface copies can fail while Chromium replaces a resized/hidden compositor
// surface. Retry capture only: replaying the update would apply scrolls twice.
async function captureFrame(contents, wait = pause) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (contents.isDestroyed()) throw Error("Capture view was destroyed");
    try {
      return await contents.capturePage();
    } catch (error) {
      if (!transientErrors.has(error.message) || attempt === 3) throw error;
      if (contents.isDestroyed()) throw error;
      contents.invalidate();
      await wait(100 * (attempt + 1));
    }
  }
}
module.exports = { captureFrame };
