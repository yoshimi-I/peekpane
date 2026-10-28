import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const available = spawnSync("nvim", ["--version"]).status === 0;
test(
  "plugin opens do not steal focus through the CLI remote-editor handoff",
  { skip: !available },
  () => {
    const tmp = fs.mkdtempSync("/tmp/peekpane-focus-");
    const adapter = path.join(tmp, "adapter.mjs"),
      loader = path.join(tmp, "loader.mjs"),
      script = path.join(tmp, "focus.lua");
    fs.writeFileSync(
      adapter,
      `import fs from "node:fs";import path from "node:path";
    export const callerTty=()=>({path:"/dev/null"});
    export const detect=()=>({getCurrentPane:async()=>"fixture",split:async({command})=>{
      fs.writeFileSync(path.join(command.at(-1),"viewer-ready"),"ready");
    }});`,
    );
    fs.writeFileSync(
      loader,
      `export async function resolve(specifier,context,next){
    if(specifier==="@zenbu-labs/pixel/terminal")return{url:${JSON.stringify(pathToFileURL(adapter).href)},shortCircuit:true};
    return next(specifier,context);
  }`,
    );
    fs.writeFileSync(
      script,
      `
vim.opt.rtp:prepend(vim.fn.getcwd())
vim.env.NVIM = vim.v.servername
local p = require('peekpane')
p.setup({ cmd = { vim.env.PEEKPANE_TEST_NODE, vim.fn.getcwd() .. '/bin/peekpane.js' }, display = 'split' })
local file = vim.env.XDG_CACHE_HOME .. '/source.md'
vim.fn.writefile({ '# Source' }, file)
vim.cmd.edit(file)
local source = vim.api.nvim_get_current_buf()
p.open()
vim.cmd.vnew()
local chosen = vim.api.nvim_get_current_win()
local ok = vim.wait(8000, function() return p.is_open(source) end)
local stayed = vim.api.nvim_get_current_win() == chosen
p.close(source)
assert(ok, 'preview did not open')
assert(stayed, 'plugin CLI stole focus by remotely dropping the source file')
vim.cmd('qa!')
`,
    );
    const env = {
      ...process.env,
      XDG_CACHE_HOME: tmp,
      XDG_CONFIG_HOME: tmp,
      PEEKPANE_HEADLESS: "",
      PEEKPANE_TEST_NODE: process.execPath,
      NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loader).href}`,
      TMUX: "",
      TMUX_PANE: "",
      NVIM: "",
    };
    try {
      const result = spawnSync(
        "nvim",
        [
          "--headless",
          "--listen",
          path.join(tmp, "nvim.sock"),
          "-u",
          "NONE",
          "-l",
          script,
        ],
        { env, encoding: "utf8", timeout: 15000 },
      );
      assert.equal(result.status, 0, result.stderr);
    } finally {
      spawnSync(process.execPath, ["bin/peekpane.js", "close"], {
        env,
        timeout: 10000,
      });
      fs.rmSync(tmp, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  },
);
