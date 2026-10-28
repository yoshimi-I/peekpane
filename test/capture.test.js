import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { captureFrame } = createRequire(import.meta.url)("../src/capture.cjs");
test("transient surface-copy failure retries capture without replaying document actions", async () => {
  const image = {};
  const delays = [];
  let calls = 0,
    repaints = 0;
  const contents = {
    isDestroyed: () => false,
    invalidate: () => repaints++,
    capturePage: async () => {
      if (++calls === 1) throw Error("UnknownVizError");
      return image;
    },
  };
  assert.equal(
    await captureFrame(contents, async (ms) => delays.push(ms)),
    image,
  );
  assert.equal(calls, 2);
  assert.equal(repaints, 1);
  assert.deepEqual(delays, [100]);
});
test("persistent compositor failure stops after a bounded capture budget", async () => {
  const error = Error("UnknownVizError");
  const delays = [];
  let calls = 0;
  await assert.rejects(
    captureFrame(
      {
        isDestroyed: () => false,
        invalidate() {},
        capturePage: async () => {
          calls++;
          throw error;
        },
      },
      async (ms) => delays.push(ms),
    ),
    (actual) => actual === error,
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [100, 200, 300]);
});
test("non-transient capture failures are reported without retry", async () => {
  const error = Error("Frame Gone");
  let calls = 0;
  await assert.rejects(
    captureFrame({
      isDestroyed: () => false,
      invalidate: () => assert.fail("permanent errors must not invalidate"),
      capturePage: async () => {
        calls++;
        throw error;
      },
    }),
    (actual) => actual === error,
  );
  assert.equal(calls, 1);
});
test("closing a view cancels capture recovery before the next attempt", async () => {
  let destroyed = false,
    calls = 0;
  await assert.rejects(
    captureFrame(
      {
        isDestroyed: () => destroyed,
        invalidate() {},
        capturePage: async () => {
          calls++;
          throw Error("UnknownVizError");
        },
      },
      async () => {
        destroyed = true;
      },
    ),
    /destroyed/i,
  );
  assert.equal(calls, 1);
});
