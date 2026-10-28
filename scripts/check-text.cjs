const fs = require("node:fs");
const assert = require("node:assert/strict");
const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const { createEncoder, encode } = require("../src/frame.cjs");
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
    const visible = await page.webContents.executeJavaScript(`(async()=>{
      const next=document.documentElement.cloneNode(true);
      next.querySelector('#preview').innerHTML='<p>'+Array.from({length:500},(_,i)=>'word'+i).join(' ')+'</p>';
      await window.peekpaneUpdate({revision:3,line:1},{revision:3,html:next.outerHTML});
      scrollTo(0,700);await new Promise(requestAnimationFrame);
      await window.peekpaneKey({key:'v'});
      await window.peekpaneKey({key:'w'});
      const range=getSelection().getRangeAt(0),box=range.getBoundingClientRect();
      const result={text:getSelection().toString(),top:box.top,bottom:box.bottom,offset:getSelection().anchorOffset,viewport:innerHeight};
      await window.peekpaneKey({key:'Escape'});
      return result;
    })()`);
    assert.ok(
      visible.offset > 0,
      "selection restarted at the offscreen paragraph beginning",
    );
    assert.ok(
      visible.bottom > 0 && visible.top < visible.viewport,
      "selection is not visible",
    );
    assert.notEqual(visible.text, "word0");
    const encodeFrame = createEncoder(nativeImage);
    const image = (await page.webContents.capturePage()).resize({
      width: 1445,
      height: 1749,
    });
    const standard = image.toPNG();
    const fast = encodeFrame(image);
    assert.deepEqual(
      nativeImage.createFromBuffer(fast).getSize(),
      image.getSize(),
    );
    const decoded = nativeImage.createFromBuffer(fast).toBitmap();
    const sourcePixels = image.toBitmap();
    const reference = nativeImage.createFromBuffer(standard).toBitmap();
    let maxSource = 0,
      maxReference = 0;
    for (let i = 0; i < decoded.length; i++) {
      maxSource = Math.max(maxSource, Math.abs(decoded[i] - sourcePixels[i]));
      maxReference = Math.max(
        maxReference,
        Math.abs(decoded[i] - reference[i]),
      );
    }
    assert.equal(maxSource, 0, "PNG did not preserve the source bitmap");
    assert.ok(
      maxReference <= 1,
      `PNG color conversion differs by ${maxReference}`,
    );
    // Also exercise channel order and partial transparency, independently of screenshots.
    const translucent = nativeImage.createFromBuffer(
      encode(
        Buffer.from([200, 100, 50, 128, 30, 90, 210, 255, 0, 0, 0, 0]),
        3,
        1,
      ),
    );
    assert.deepEqual(
      nativeImage.createFromBuffer(encodeFrame(translucent)).toBitmap(),
      nativeImage.createFromBuffer(translucent.toPNG()).toBitmap(),
      "fast frames changed transparency or color channels",
    );
    await page.loadFile(process.argv[4]);
    const theme = await page.webContents.executeJavaScript(`(async()=>{
      await window.peekpaneReady;
      return {lang:document.documentElement.lang,dir:document.documentElement.dir,background:getComputedStyle(document.body).backgroundColor,color:getComputedStyle(document.body).color,note:document.body.dataset.note,sample:document.body.dataset.sample};
    })()`);
    assert.deepEqual(theme, {
      lang: "ja",
      dir: "rtl",
      background: "rgb(12, 34, 56)",
      color: "rgb(255, 255, 255)",
      note: "a>b",
      sample: '<body class="sample">',
    });
    fs.writeFileSync(
      output,
      JSON.stringify({
        ok: true,
        ...result,
        copied,
        frameBitmapPreserved: true,
      }),
    );
    app.exit(0);
  })
  .catch((error) => {
    fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.stack }));
    app.exit(1);
  });
