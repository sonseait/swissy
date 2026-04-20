// ==================== Image crop/resize/convert ====================

const imgState = {
  img: null,
  file: null,
  crop: null,
  dragging: null,
  targetW: null,
  targetH: null,
  aspectLock: false,
  cropRatio: null, // null = free, or number w/h
};

const CROP_PRESETS = [
  ["free", "Free", null],
  ["1:1", "1:1", 1],
  ["4:3", "4:3", 4/3],
  ["3:2", "3:2", 3/2],
  ["16:9", "16:9", 16/9],
  ["9:16", "9:16", 9/16],
  ["3:4", "3:4", 3/4],
  ["2:3", "2:3", 2/3],
  ["21:9", "21:9", 21/9],
  ["a4p", "A4 portrait", 210/297],
  ["a4l", "A4 landscape", 297/210],
];

function renderImage() {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);
  $("#main").classList.add("no-scroll");

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Image</div>
    <div style="padding:8px 12px;color:var(--dim);font-size:12px">
      Drop a file or click Choose file.
    </div>
  `;

  $("#main").innerHTML = `
    <h1>Image</h1>
    <div class="mail-topbar img-topbar">
      <div class="open-row">
        <label>File:</label>
        <label class="file-btn" for="imgFile">
          <span>Choose file</span>
          <input type="file" id="imgFile" accept="image/*" hidden />
        </label>
        <span id="imgFileName" class="file-name">No file selected</span>
        <span style="flex:1"></span>
        <button class="ghost" id="imgReset">Reset crop</button>
      </div>
      <div id="imgMeta" class="url-email" style="display:none"></div>
    </div>

    <div class="img-workspace">
      <div class="img-canvas-wrap">
        <canvas id="imgCanvas"></canvas>
        <div id="imgDrop" class="img-drop">Drop an image here</div>
      </div>
      <aside class="img-panel">
        <h2>Crop</h2>
        <div class="opt">
          <label>Aspect ratio</label>
          <div class="chip-row" id="cropPresets">
            ${CROP_PRESETS.map(([k, label]) =>
              `<button class="chip ${k==='free'?'active':''}" data-k="${k}" type="button">${esc(label)}</button>`).join("")}
          </div>
        </div>

        <h2 style="margin-top:14px">Resize</h2>
        <div class="opt-row">
          <div class="opt"><label>Width</label><input id="imgW" type="number" min="1" /></div>
          <div class="opt"><label>Height</label><input id="imgH" type="number" min="1" /></div>
        </div>
        <label class="opt-check"><input id="imgLock" type="checkbox" /> Lock aspect</label>
        <div class="opt">
          <label>Scale</label>
          <div class="chip-row">
            ${[25, 50, 75, 100, 150, 200].map(p =>
              `<button class="chip img-scale" data-p="${p}" type="button">${p}%</button>`).join("")}
          </div>
        </div>

        <h2 style="margin-top:14px">Export</h2>
        <div class="opt">
          <label>Format</label>
          <div class="dd" id="imgFmt" data-value="image/png">
            <button type="button" class="dd-toggle">
              <span class="dd-label">PNG</span><span class="dd-arrow">▾</span>
            </button>
            <ul class="dd-menu" hidden>
              <li class="dd-item active" data-value="image/png">PNG</li>
              <li class="dd-item" data-value="image/jpeg">JPEG</li>
              <li class="dd-item" data-value="image/webp">WebP</li>
            </ul>
          </div>
        </div>
        <div class="opt">
          <label>Quality (JPEG/WebP): <span id="imgQualVal">92</span></label>
          <input id="imgQual" type="range" min="1" max="100" value="92" />
        </div>
        <button class="primary" id="imgDownload">Download</button>
      </aside>
    </div>
  `;

  bindDropdown($("#imgFmt"), () => true);

  $("#imgFile").addEventListener("change", e => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
  });

  $("#cropPresets").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    $$("#cropPresets .chip").forEach(x => x.classList.toggle("active", x === b));
    const preset = CROP_PRESETS.find(p => p[0] === b.dataset.k);
    imgState.cropRatio = preset ? preset[2] : null;
    if (imgState.cropRatio && imgState.img) applyRatioToCrop();
    drawCanvas();
  });

  const drop = $("#imgDrop");
  const wrap = $(".img-canvas-wrap");
  ["dragenter", "dragover"].forEach(ev => wrap.addEventListener(ev, e => {
    e.preventDefault(); wrap.classList.add("drop-active");
  }));
  ["dragleave", "drop"].forEach(ev => wrap.addEventListener(ev, e => {
    e.preventDefault(); wrap.classList.remove("drop-active");
  }));
  wrap.addEventListener("drop", e => {
    const f = e.dataTransfer.files?.[0];
    if (f) loadImage(f);
  });

  $("#imgReset").addEventListener("click", () => { imgState.crop = null; drawCanvas(); });

  $("#imgW").addEventListener("input", e => {
    imgState.targetW = parseInt(e.target.value, 10) || null;
    if (imgState.aspectLock && imgState.img) {
      const cr = getCropRect();
      imgState.targetH = Math.round(imgState.targetW * cr.h / cr.w);
      $("#imgH").value = imgState.targetH;
    }
  });
  $("#imgH").addEventListener("input", e => {
    imgState.targetH = parseInt(e.target.value, 10) || null;
    if (imgState.aspectLock && imgState.img) {
      const cr = getCropRect();
      imgState.targetW = Math.round(imgState.targetH * cr.w / cr.h);
      $("#imgW").value = imgState.targetW;
    }
  });
  $("#imgLock").addEventListener("change", e => imgState.aspectLock = e.target.checked);
  $$(".img-scale").forEach(b => b.addEventListener("click", () => {
    if (!imgState.img) return;
    const cr = getCropRect();
    const p = parseInt(b.dataset.p, 10) / 100;
    imgState.targetW = Math.round(cr.w * p);
    imgState.targetH = Math.round(cr.h * p);
    $("#imgW").value = imgState.targetW;
    $("#imgH").value = imgState.targetH;
  }));
  $("#imgQual").addEventListener("input", e => $("#imgQualVal").textContent = e.target.value);

  $("#imgDownload").addEventListener("click", exportImage);

  bindCropInteractions();
}

function loadImage(file) {
  const img = new Image();
  img.onload = () => {
    imgState.img = img;
    imgState.file = file;
    imgState.crop = null;
    imgState.targetW = img.naturalWidth;
    imgState.targetH = img.naturalHeight;
    $("#imgW").value = img.naturalWidth;
    $("#imgH").value = img.naturalHeight;
    const meta = $("#imgMeta");
    meta.style.display = "";
    meta.innerHTML = `<b>${esc(file.name)}</b> — ${img.naturalWidth}×${img.naturalHeight}, ${(file.size/1024).toFixed(1)} KB`;
    $("#imgFileName").textContent = file.name;
    $("#imgDrop").style.display = "none";
    if (imgState.cropRatio) applyRatioToCrop();
    drawCanvas();
  };
  img.src = URL.createObjectURL(file);
}

function applyRatioToCrop() {
  const img = imgState.img;
  const r = imgState.cropRatio;
  if (!img || !r) return;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  let w, h;
  if (iw / ih > r) { h = ih; w = Math.round(h * r); }
  else { w = iw; h = Math.round(w / r); }
  imgState.crop = { x: Math.round((iw - w) / 2), y: Math.round((ih - h) / 2), w, h };
  imgState.targetW = w; imgState.targetH = h;
  const wEl = $("#imgW"), hEl = $("#imgH");
  if (wEl) wEl.value = w;
  if (hEl) hEl.value = h;
}

function constrainToRatio(rect, ratio, img) {
  if (!ratio) return rect;
  let { x, y, w, h } = rect;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  w = Math.min(w, img.naturalWidth - x);
  h = Math.min(h, img.naturalHeight - y);
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  return { x, y, w: Math.round(w), h: Math.round(h) };
}

function getCropRect() {
  if (imgState.crop) return imgState.crop;
  const img = imgState.img;
  return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
}

function drawCanvas() {
  const c = $("#imgCanvas");
  const wrap = $(".img-canvas-wrap");
  if (!c || !wrap) return;
  const img = imgState.img;
  if (!img) { c.width = c.height = 0; return; }
  const maxW = wrap.clientWidth - 20;
  const maxH = wrap.clientHeight - 20;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  const dispW = Math.max(1, Math.round(img.naturalWidth * scale));
  const dispH = Math.max(1, Math.round(img.naturalHeight * scale));
  c.width = dispW; c.height = dispH;
  c.dataset.scale = scale;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, dispW, dispH);
  ctx.drawImage(img, 0, 0, dispW, dispH);

  // overlay crop
  const cr = imgState.crop;
  if (cr) {
    const x = cr.x * scale, y = cr.y * scale, w = cr.w * scale, h = cr.h * scale;
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, dispW, y);
    ctx.fillRect(0, y + h, dispW, dispH - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, dispW - x - w, h);
    ctx.strokeStyle = "#6c8cff"; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    // handles
    ctx.fillStyle = "#6c8cff";
    const hs = 6;
    const pts = [[x,y],[x+w,y],[x,y+h],[x+w,y+h],[x+w/2,y],[x+w/2,y+h],[x,y+h/2],[x+w,y+h/2]];
    for (const [px, py] of pts) ctx.fillRect(px - hs/2, py - hs/2, hs, hs);
  }
}

function bindCropInteractions() {
  const c = $("#imgCanvas");
  const getPos = (ev) => {
    const r = c.getBoundingClientRect();
    const scale = parseFloat(c.dataset.scale || "1");
    return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale };
  };
  c.addEventListener("mousedown", ev => {
    if (!imgState.img) return;
    const p = getPos(ev);
    const cr = imgState.crop;
    let mode = "new";
    if (cr) {
      const inside = p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h;
      mode = inside ? "move" : "new";
    }
    imgState.dragging = { mode, start: p, orig: cr ? { ...cr } : { x: p.x, y: p.y, w: 0, h: 0 } };
    if (mode === "new") imgState.crop = { x: p.x, y: p.y, w: 0, h: 0 };
    drawCanvas();
  });
  window.addEventListener("mousemove", ev => {
    if (!imgState.dragging || !$("#imgCanvas")) return;
    const p = getPos(ev);
    const d = imgState.dragging;
    const img = imgState.img;
    if (d.mode === "new") {
      const x = Math.max(0, Math.min(d.start.x, p.x));
      const y = Math.max(0, Math.min(d.start.y, p.y));
      let w = Math.min(Math.abs(p.x - d.start.x), img.naturalWidth - x);
      let h = Math.min(Math.abs(p.y - d.start.y), img.naturalHeight - y);
      imgState.crop = imgState.cropRatio
        ? constrainToRatio({ x, y, w, h }, imgState.cropRatio, img)
        : { x, y, w, h };
    } else if (d.mode === "move") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      imgState.crop = {
        x: Math.max(0, Math.min(img.naturalWidth - d.orig.w, d.orig.x + dx)),
        y: Math.max(0, Math.min(img.naturalHeight - d.orig.h, d.orig.y + dy)),
        w: d.orig.w, h: d.orig.h,
      };
    }
    drawCanvas();
  });
  window.addEventListener("mouseup", () => {
    if (imgState.dragging) {
      if (imgState.crop && (imgState.crop.w < 4 || imgState.crop.h < 4)) imgState.crop = null;
      if (imgState.crop) {
        imgState.targetW = Math.round(imgState.crop.w);
        imgState.targetH = Math.round(imgState.crop.h);
        $("#imgW").value = imgState.targetW;
        $("#imgH").value = imgState.targetH;
      }
    }
    imgState.dragging = null;
    drawCanvas();
  });
}

async function exportImage() {
  if (!imgState.img) { toast("No image"); return; }
  const cr = getCropRect();
  const fmt = $("#imgFmt").dataset.value;
  const qual = parseInt($("#imgQual").value, 10) / 100;
  const w = imgState.targetW || Math.round(cr.w);
  const h = imgState.targetH || Math.round(cr.h);

  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const ctx = off.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imgState.img, cr.x, cr.y, cr.w, cr.h, 0, 0, w, h);

  off.toBlob(blob => {
    if (!blob) { toast("Export failed"); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ext = fmt === "image/jpeg" ? "jpg" : fmt === "image/webp" ? "webp" : "png";
    const base = (imgState.file?.name || "image").replace(/\.[^.]+$/, "");
    a.href = url; a.download = `${base}-${w}x${h}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${w}×${h}`);
  }, fmt, qual);
}
