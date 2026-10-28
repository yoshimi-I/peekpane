import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("plain previews do not load spreadsheet, math or diagram engines", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
 import {createRequire} from 'node:module';
 import {render} from './src/render.js';
 const require=createRequire(import.meta.url);
 render({file:'/tmp/a.md',type:'markdown',content:'# Hello'});
 console.log(JSON.stringify(Object.keys(require.cache).filter(p=>/node_modules\\/(xlsx|katex|mermaid|yaml)\\//.test(p))));
 `,
    ],
    { encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(output), []);
});
