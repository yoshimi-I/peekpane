const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  session,
  BrowserWindow,
  ipcMain,
  clipboard,
  nativeImage,
} = require("@zenbu-labs/pixel/electron");
const { allowed } = require("./policy.cjs");
const { createEncoder } = require("./frame.cjs");
const { captureFrame } = require("./capture.cjs");
const cache = process.argv[2];
const socketPath = path.join(cache, "renderer.sock");
const roots = new Set();
const contents = new Map();
ipcMain.on("peekpane-copy", (event, text) => {
  if (
    contents.has(event.sender) &&
    typeof text === "string" &&
    text.length <= 10000000
  ) {
    const owner = contents.get(event.sender);
    if (!owner.test) clipboard.writeText(text);
    if (fs.existsSync(owner.dir)) {
      const data = JSON.stringify({ text, sequence: Date.now() });
      fs.writeFileSync(path.join(owner.dir, "yank.json.tmp"), data, {
        mode: 0o600,
      });
      fs.renameSync(
        path.join(owner.dir, "yank.json.tmp"),
        path.join(owner.dir, "yank.json"),
      );
    }
  }
});
let idle;
app.setName("peekpane");
app.setPath("userData", path.join(cache, "renderer-runtime"));
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
const secure = (s) => {
  s.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !allowed(details.url) }),
  );
  s.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  s.setPermissionCheckHandler(() => false);
};
app.on("session-created", secure);
process.on("uncaughtException", (error) => {
  console.error(error.stack);
  app.exit(1);
});
app
  .whenReady()
  .then(() => {
    const encodeFrame = createEncoder(nativeImage);
    secure(session.defaultSession);
    app.dock?.hide();
    const { createRoot } = require("@zenbu-labs/pixel");
    function openView(request, connection) {
      clearTimeout(idle);
      const dir = request.dir;
      if (path.dirname(path.resolve(dir)) !== path.resolve(cache))
        throw new Error("Invalid preview directory");
      let watcher;
      const exited = () => {
        watcher?.close();
        roots.delete(root);
        try {
          fs.writeFileSync(path.join(dir, "viewer-stopped"), "closed", {
            mode: 0o600,
          });
        } catch {
          /* Session may already be gone. */
        }
        connection.end();
        if (!roots.size)
          idle = setTimeout(() => {
            if (!roots.size) app.exit(0);
          }, 150);
      };
      let window;
      const root = request.snapshot
        ? {
            stop() {
              if (!window.isDestroyed()) window.destroy();
            },
            loadURL(url) {
              window.loadURL(url);
              return { webContents: window.webContents, onChange() {} };
            },
          }
        : createRoot({
            tty: request.tty,
            sessionEnv: { ...process.env, ...request.env },
            onExit: exited,
            name: "peekpane",
            devtools: false,
            onKey(event) {
              if (
                event.kind === "press" &&
                event.mods.ctrl &&
                event.key === "c"
              ) {
                root.stop();
                return true;
              }
            },
          });
      if (request.snapshot) {
        window = new BrowserWindow({
          show: false,
          width: 900,
          height: 900,
          webPreferences: {
            offscreen: true,
            preload: path.join(__dirname, "preload.cjs"),
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: true,
            plugins: true,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.on("closed", exited);
      }
      roots.add(root);
      fs.writeFileSync(path.join(dir, "viewer-shared"), "1", { mode: 0o600 });
      fs.writeFileSync(path.join(dir, "viewer.pid"), String(process.pid), {
        mode: 0o600,
      });
      const page = root.loadURL(
        pathToFileURL(path.join(dir, "index.html")).href,
        {
          onOpenWindow: "deny",
          preload: path.join(__dirname, "preload.cjs"),
          browserWindowOptions: { webPreferences: { plugins: true } },
        },
      );
      const webContents = page.webContents;
      contents.set(webContents, {
        dir,
        test: request.env.PEEKPANE_SMOKE === "1",
      });
      webContents.once("destroyed", () => contents.delete(webContents));
      let outputSize;
      let forceCapture = false,
        frame = 0,
        viewportText = "";
      let deliveredState = "",
        deliveredRevision = 0;
      let queued = false,
        busy = false;
      async function update(force = false) {
        if (force === true) forceCapture = true;
        queued = true;
        if (busy) return;
        busy = true;
        try {
          while (queued) {
            queued = false;
            const timings = {};
            let mark = performance.now();
            const lap = (name) => {
              const now = performance.now();
              timings[name] = Math.round((now - mark) * 10) / 10;
              mark = now;
            };
            if (!fs.existsSync(dir)) {
              root.stop();
              return;
            }
            const state = fs.readFileSync(path.join(dir, "state.js"), "utf8");
            if (state === deliveredState && !forceCapture) continue;
            forceCapture = false;
            const revision = JSON.parse(
              state.slice(state.indexOf("=") + 1, -1),
            ).revision;
            const content =
              revision !== deliveredRevision
                ? fs.readFileSync(path.join(dir, "content.js"), "utf8")
                : "";
            await page.webContents.executeJavaScript(
              `${state}\n${content}\n(async()=>{await window.peekpaneReady;return window.peekpaneUpdate?.(window.peekpaneState,window.peekpaneContent)})()`,
            );
            if (request.snapshot) {
              lap("state");
              try {
                const text = fs.readFileSync(
                  path.join(dir, "viewport.json"),
                  "utf8",
                );
                if (text !== viewportText) {
                  const vp = JSON.parse(text);
                  if (
                    Number.isInteger(vp.pixelWidth) &&
                    Number.isInteger(vp.pixelHeight) &&
                    vp.pixelWidth > 0 &&
                    vp.pixelHeight > 0 &&
                    vp.pixelWidth <= 8192 &&
                    vp.pixelHeight <= 8192
                  )
                    outputSize = {
                      width: vp.pixelWidth,
                      height: vp.pixelHeight,
                      quality: "good",
                    };
                  if (Number.isInteger(vp.width) && Number.isInteger(vp.height))
                    window.setContentSize(
                      Math.max(100, Math.min(4096, vp.width)),
                      Math.max(100, Math.min(4096, vp.height)),
                    );
                  if (Number.isFinite(vp.scrollBy))
                    await page.webContents.executeJavaScript(
                      `window.scrollBy(0,${vp.scrollBy})`,
                    );
                  viewportText = text;
                }
              } catch {
                /* Initial viewport may not have arrived yet. */
              }
              const requests = fs
                .readdirSync(dir)
                .filter((name) => /^scroll-.*\.json$/.test(name))
                .sort();
              const deltas = requests
                .map(
                  (name) =>
                    JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
                      .delta,
                )
                .filter(Number.isFinite);
              if (deltas.length)
                await page.webContents.executeJavaScript(
                  `${JSON.stringify(deltas)}.forEach(delta=>window.scrollBy(0,delta))`,
                );
              const actions = fs
                .readdirSync(dir)
                .filter((name) => /^action-.*\.json$/.test(name))
                .sort();
              const keys = actions
                .map((name) =>
                  JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")),
                )
                .filter((action) => typeof action.key === "string");
              if (keys.length)
                await page.webContents.executeJavaScript(
                  `(async()=>{for(const action of ${JSON.stringify(keys)}) await window.peekpaneKey?.(action)})()`,
                );
              for (const name of [...requests, ...actions])
                fs.rmSync(path.join(dir, name), { force: true });
              lap("actions");
              const snapshotState = await page.webContents.executeJavaScript(
                "(async()=>{await document.fonts.ready;await new Promise(requestAnimationFrame);return {selectionLength:window.getSelection().toString().length,scrollY:window.scrollY}})()",
              );
              lap("paint");
              let image = await captureFrame(page.webContents);
              lap("capture");
              if (outputSize) image = image.resize(outputSize);
              lap("resize");
              const name = `frame-${++frame}.png`;
              const target = path.join(dir, name);
              fs.writeFileSync(target, encodeFrame(image), { mode: 0o600 });
              lap("encode");
              fs.writeFileSync(
                path.join(dir, "frame.json.tmp"),
                JSON.stringify({
                  path: target,
                  revision,
                  timings,
                  ...snapshotState,
                  width: image.getSize().width,
                  height: image.getSize().height,
                }),
                { mode: 0o600 },
              );
              fs.renameSync(
                path.join(dir, "frame.json.tmp"),
                path.join(dir, "frame.json"),
              );
              fs.rmSync(path.join(dir, "viewer-error.txt"), { force: true });
              if (frame > 3)
                fs.rmSync(path.join(dir, `frame-${frame - 3}.png`), {
                  force: true,
                });
            }
            fs.writeFileSync(path.join(dir, "viewer-ready"), "ready", {
              mode: 0o600,
            });
            deliveredState = state;
            deliveredRevision = revision;
            if (request.env.PEEKPANE_SMOKE === "1") {
              const result = await page.webContents.executeJavaScript(
                `({heading:document.querySelector('h1')?.textContent,math:!!document.querySelector('.katex'),diagram:!!document.querySelector('.mermaid svg'),mermaidLoaded:!!window.mermaid,copyBridge:!!window.peekpaneHost,diagramBoxes:[...document.querySelectorAll('.mermaid svg')].map(s=>({width:s.clientWidth,height:s.clientHeight,viewBox:s.getAttribute('viewBox'),style:s.getAttribute('style')})),images:[...document.images].map(i=>({width:i.naturalWidth,height:i.naturalHeight})),tables:document.querySelectorAll('table').length,sheets:document.querySelectorAll('[data-sheet]').length,text:document.querySelector('#preview')?.textContent,localScript:document.body.dataset.local,headingColor:document.querySelector('h1')?getComputedStyle(document.querySelector('h1')).color:null,pdf:!!document.querySelector('embed[type="application/pdf"]'),video:document.querySelector('video')?{ready:document.querySelector('video').readyState,error:document.querySelector('video').error?.message}:null,revision:window.peekpaneState?.revision})`,
              );
              fs.writeFileSync(
                path.join(dir, "viewer-snapshot.json"),
                JSON.stringify({
                  ...result,
                  pid: process.pid,
                  debugPort: app.commandLine.getSwitchValue(
                    "remote-debugging-port",
                  ),
                }),
                { mode: 0o600 },
              );
              if (!fs.existsSync(path.join(dir, "preview.png"))) {
                await page.webContents.executeJavaScript(
                  "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
                );
                const image = await captureFrame(page.webContents);
                fs.writeFileSync(path.join(dir, "preview.png"), image.toPNG(), {
                  mode: 0o600,
                });
              }
            }
          }
        } catch (error) {
          if (fs.existsSync(dir))
            fs.writeFileSync(
              path.join(dir, "viewer-error.txt"),
              error.message,
              {
                mode: 0o600,
              },
            );
        } finally {
          busy = false;
        }
      }
      watcher = fs.watch(dir, (_event, file) => {
        if (!fs.existsSync(dir)) return root.stop();
        if (file && String(file) === "viewer-close") return root.stop();
        if (
          file &&
          /^scroll-.*\.json$/.test(String(file)) &&
          fs.existsSync(path.join(dir, String(file)))
        )
          update(true);
        if (
          file &&
          /^action-.*\.json$/.test(String(file)) &&
          fs.existsSync(path.join(dir, String(file)))
        )
          update(true);
        if (file && String(file) === "viewport.json") update(true);
        if (file && String(file) === "state.js") update();
      });
      page.webContents.on("did-finish-load", update);
      page.onChange((state) => {
        if (!state.loading) update();
      });
      page.webContents.on("will-navigate", (event, url) => {
        if (!allowed(url)) event.preventDefault();
      });
      connection.on("close", () => root.stop());
      return root;
    }
    try {
      fs.unlinkSync(socketPath);
    } catch {
      /* No stale socket. */
    }
    const server = net.createServer((connection) => {
      let input = "",
        opened = false;
      connection.on("error", () => {});
      connection.on("data", (data) => {
        if (opened) return;
        input += String(data);
        if (input.length > 32768) {
          connection.destroy();
          return;
        }
        if (!input.includes("\n")) return;
        opened = true;
        try {
          openView(JSON.parse(input.split("\n")[0]), connection);
        } catch (error) {
          connection.end(JSON.stringify({ error: error.message }) + "\n");
          if (!roots.size) app.exit(1);
        }
      });
    });
    server.listen(socketPath, () => fs.chmodSync(socketPath, 0o600));
    process.on("exit", () => {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        /* Already removed. */
      }
    });
    for (const signal of ["SIGTERM", "SIGHUP"])
      process.on(signal, () => {
        for (const root of roots) root.stop();
      });
  })
  .catch((error) => {
    console.error(error.stack);
    app.exit(1);
  });
