const fs = require("node:fs");
const assert = require("node:assert/strict");
const { app, BrowserWindow, ipcMain } = require("electron");
const output = process.argv[3];
const copied = [];
ipcMain.on("peekpane-copy", (_event, text) => copied.push(text));
app
  .whenReady()
  .then(async () => {
    const page = new BrowserWindow({
      show: false,
      width: 800,
      height: 500,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: require("node:path").resolve(__dirname, "../src/preload.cjs"),
      },
    });
    await page.loadFile(process.argv[2]);
    const result = await page.webContents.executeJavaScript(`(async()=>{
  await window.peekpaneReady;
  await window.peekpaneUpdate({revision:1,line:1},{revision:1,html:document.documentElement.outerHTML});
  function key(value){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));}
  const heading=document.querySelector('h1');const range=document.createRange();range.selectNodeContents(heading);getSelection().removeAllRanges();getSelection().addRange(range);
  const selected=getSelection().toString();key('y');
  key('Escape');scrollTo(0,0);key('v');key('w');const visual=getSelection().toString();key('y');
  key('Escape');for(let i=0;i<20;i++)key('j');const down=scrollY;key('k');
  const up=scrollY;
  key('Escape');scrollTo(0,0);key('v');key('w');
  const replacement=document.documentElement.cloneNode(true);replacement.querySelector('h1').textContent='Changed after copy';
  await window.peekpaneUpdate({revision:2,line:1},{revision:2,html:replacement.outerHTML});
  const during=getSelection().toString();key('y');await window.peekpaneFlush();
  return {selected,visual,down,up,during,after:document.querySelector('h1').textContent,host:!!window.peekpaneHost};
 })()`);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(result.selected, "Copy test");
    assert.ok(result.visual.startsWith("Copy"));
    assert.equal(copied[0], "Copy test");
    assert.equal(copied[1], result.visual);
    assert.equal(
      result.during,
      "Copy",
      "live update destroyed visual selection",
    );
    assert.equal(
      copied[2],
      "Copy",
      "yank after live update lost rendered text",
    );
    assert.equal(result.after, "Changed after copy");
    assert.equal(result.down, 960);
    assert.equal(result.up, 912);
    fs.writeFileSync(output, JSON.stringify({ ok: true, ...result, copied }));
    app.exit(0);
  })
  .catch((error) => {
    fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.stack }));
    app.exit(1);
  });
