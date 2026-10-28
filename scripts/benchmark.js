import { performance } from "node:perf_hooks";
const start = performance.now();
const { render } = await import("../src/render.js");
const loaded = performance.now();
const source = Array.from(
  { length: 1000 },
  (_, i) =>
    `## Section ${i}\n\nA paragraph with **bold** text and a [link](#).\n\n- item\n`,
).join("");
const times = [];
for (let i = 0; i < 10; i++) {
  const before = performance.now();
  render({ file: "/tmp/benchmark.md", type: "markdown", content: source });
  times.push(performance.now() - before);
}
times.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      moduleLoadMs: Math.round(loaded - start),
      lines: source.split("\n").length,
      medianRenderMs: Math.round(times[5]),
      maxRenderMs: Math.round(times.at(-1)),
      rssMiB: Math.round(process.memoryUsage().rss / 1048576),
    },
    null,
    2,
  ),
);
