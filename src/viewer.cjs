const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, session } = require("@zenbu-labs/pixel/electron");
const { allowed } = require("./policy.cjs");
const dir = process.argv[2];
app.setName("peekpane");
app.setPath("userData", path.join(dir, "runtime"));
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
    secure(session.defaultSession);
    app.dock?.hide();
    const { createRoot } = require("@zenbu-labs/pixel");
    const root = createRoot({
      name: "peekpane",
      devtools: false,
      onKey(event) {
        if (event.kind === "press" && event.mods.ctrl && event.key === "c") {
          root.stop();
          return true;
        }
      },
    });
    fs.writeFileSync(path.join(dir, "viewer.pid"), String(process.pid), {
      mode: 0o600,
    });
    const page = root.loadURL(
      pathToFileURL(path.join(dir, "index.html")).href,
      {
        onOpenWindow: "deny",
        browserWindowOptions: { webPreferences: { plugins: true } },
      },
    );
    let deliveredState = "",
      deliveredRevision = 0;
    let queued = false,
      busy = false;
    async function update() {
      queued = true;
      if (busy) return;
      busy = true;
      try {
        while (queued) {
          queued = false;
          if (!fs.existsSync(dir)) {
            root.stop();
            return;
          }
          const state = fs.readFileSync(path.join(dir, "state.js"), "utf8");
          if (state === deliveredState) continue;
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
          fs.writeFileSync(path.join(dir, "viewer-ready"), "ready", {
            mode: 0o600,
          });
          deliveredState = state;
          deliveredRevision = revision;
          if (process.env.PEEKPANE_SMOKE === "1") {
            const result = await page.webContents.executeJavaScript(
              `({heading:document.querySelector('h1')?.textContent,math:!!document.querySelector('.katex'),diagram:!!document.querySelector('.mermaid svg'),mermaidLoaded:!!window.mermaid,diagramBoxes:[...document.querySelectorAll('.mermaid svg')].map(s=>({width:s.clientWidth,height:s.clientHeight,viewBox:s.getAttribute('viewBox'),style:s.getAttribute('style')})),images:[...document.images].map(i=>({width:i.naturalWidth,height:i.naturalHeight})),tables:document.querySelectorAll('table').length,sheets:document.querySelectorAll('[data-sheet]').length,text:document.querySelector('#preview')?.textContent,localScript:document.body.dataset.local,headingColor:document.querySelector('h1')?getComputedStyle(document.querySelector('h1')).color:null,pdf:!!document.querySelector('embed[type="application/pdf"]'),video:document.querySelector('video')?{ready:document.querySelector('video').readyState,error:document.querySelector('video').error?.message}:null,revision:window.peekpaneState?.revision})`,
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
              const image = await page.webContents.capturePage();
              fs.writeFileSync(path.join(dir, "preview.png"), image.toPNG(), {
                mode: 0o600,
              });
            }
          }
        }
      } catch (error) {
        if (fs.existsSync(dir))
          fs.writeFileSync(path.join(dir, "viewer-error.txt"), error.message, {
            mode: 0o600,
          });
      } finally {
        busy = false;
      }
    }
    const watcher = fs.watch(dir, (_event, file) => {
      if (!fs.existsSync(dir)) return root.stop();
      if (file && String(file) === "state.js") update();
    });
    page.webContents.on("did-finish-load", update);
    page.onChange((state) => {
      if (!state.loading) update();
    });
    page.webContents.on("will-navigate", (event, url) => {
      if (!allowed(url)) event.preventDefault();
    });
    app.on("before-quit", () => watcher.close());
    for (const signal of ["SIGTERM", "SIGHUP"])
      process.on(signal, () => root.stop());
  })
  .catch((error) => {
    console.error(error.stack);
    app.exit(1);
  });
