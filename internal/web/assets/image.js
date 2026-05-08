// ==================== Image crop/resize/convert ====================

const imgState = {
  img: null,
  file: null,
  crop: null,          // { x, y, w, h } in natural px
  targetW: null,
  targetH: null,
  aspectLock: false,
  cropRatio: null,     // null = free
  scale: 1,            // display px / natural px
  drag: null,          // { mode, handle, startPt, startCrop }
  rafPending: false,
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
    <div style="padding:8px 12px;color:var(--dim);font-size:12px">Drop a file or pick one.</div>
  `;

  $("#main").innerHTML = `
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
      <div class="img-canvas-wrap" id="imgWrap">
        <canvas id="imgCanvas"></canvas>
        <div id="cropBox" class="crop-box" hidden>
          <div class="crop-thirds"></div>
          <div class="crop-size" id="cropSize"></div>
          <div class="crop-handle h-nw" data-h="nw"></div>
          <div class="crop-handle h-n"  data-h="n"></div>
          <div class="crop-handle h-ne" data-h="ne"></div>
          <div class="crop-handle h-e"  data-h="e"></div>
          <div class="crop-handle h-se" data-h="se"></div>
          <div class="crop-handle h-s"  data-h="s"></div>
          <div class="crop-handle h-sw" data-h="sw"></div>
          <div class="crop-handle h-w"  data-h="w"></div>
        </div>
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
    scheduleDraw();
  });

  const wrap = $("#imgWrap");
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

  $("#imgReset").addEventListener("click", () => {
    imgState.crop = null; scheduleDraw();
  });

  $("#imgW").addEventListener("input", e => {
    imgState.targetW = parseInt(e.target.value, 10) || null;
    if (imgState.aspectLock && imgState.img && imgState.targetW) {
      const cr = getCropRect();
      imgState.targetH = Math.round(imgState.targetW * cr.h / cr.w);
      $("#imgH").value = imgState.targetH;
    }
  });
  $("#imgH").addEventListener("input", e => {
    imgState.targetH = parseInt(e.target.value, 10) || null;
    if (imgState.aspectLock && imgState.img && imgState.targetH) {
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
  window.addEventListener("resize", scheduleDraw);
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
    scheduleDraw();
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

function getCropRect() {
  if (imgState.crop) return imgState.crop;
  const img = imgState.img;
  return { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
}

// Clamp + round a rect to image bounds.
function clampCrop(rect, img) {
  let { x, y, w, h } = rect;
  w = Math.max(1, w); h = Math.max(1, h);
  x = Math.max(0, Math.min(x, img.naturalWidth - w));
  y = Math.max(0, Math.min(y, img.naturalHeight - h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function scheduleDraw() {
  if (imgState.rafPending) return;
  imgState.rafPending = true;
  requestAnimationFrame(() => {
    imgState.rafPending = false;
    drawCanvas();
  });
}

function drawCanvas() {
  const c = $("#imgCanvas");
  const wrap = $("#imgWrap");
  if (!c || !wrap) return;
  const img = imgState.img;
  if (!img) { c.width = c.height = 0; updateCropBox(); return; }
  const maxW = wrap.clientWidth - 24;
  const maxH = wrap.clientHeight - 24;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  const dispW = Math.max(1, Math.round(img.naturalWidth * scale));
  const dispH = Math.max(1, Math.round(img.naturalHeight * scale));
  c.width = dispW; c.height = dispH;
  imgState.scale = scale;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, dispW, dispH);
  ctx.drawImage(img, 0, 0, dispW, dispH);
  updateCropBox();
}

// Position the DOM crop box over the canvas using natural→display scale.
function updateCropBox() {
  const box = $("#cropBox");
  const c = $("#imgCanvas");
  const wrap = $("#imgWrap");
  if (!box || !c || !wrap) return;
  const cr = imgState.crop;
  if (!cr || !imgState.img) { box.hidden = true; return; }
  const canvasRect = c.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const offsetX = canvasRect.left - wrapRect.left;
  const offsetY = canvasRect.top - wrapRect.top;
  const s = imgState.scale;
  box.hidden = false;
  box.style.left = (offsetX + cr.x * s) + "px";
  box.style.top = (offsetY + cr.y * s) + "px";
  box.style.width = (cr.w * s) + "px";
  box.style.height = (cr.h * s) + "px";
  const sz = $("#cropSize");
  if (sz) sz.textContent = `${Math.round(cr.w)} × ${Math.round(cr.h)}`;
}

function bindCropInteractions() {
  const c = $("#imgCanvas");
  const box = $("#cropBox");

  const getNaturalPt = (ev) => {
    const r = c.getBoundingClientRect();
    const s = imgState.scale || 1;
    return {
      x: (ev.clientX - r.left) / s,
      y: (ev.clientY - r.top) / s,
    };
  };

  const startDrag = (ev, mode, handle) => {
    if (!imgState.img) return;
    ev.preventDefault();
    try { ev.target.setPointerCapture(ev.pointerId); } catch {}
    const pt = getNaturalPt(ev);
    imgState.drag = {
      mode, handle,
      startPt: pt,
      startCrop: imgState.crop ? { ...imgState.crop } : null,
    };
    if (mode === "create") {
      imgState.crop = { x: pt.x, y: pt.y, w: 1, h: 1 };
      scheduleDraw();
    }
  };

  // Pointer on canvas → create new crop (or move if click inside existing).
  c.addEventListener("pointerdown", ev => {
    if (!imgState.img) return;
    const pt = getNaturalPt(ev);
    const cr = imgState.crop;
    if (cr && pt.x >= cr.x && pt.x <= cr.x + cr.w && pt.y >= cr.y && pt.y <= cr.y + cr.h) {
      startDrag(ev, "move");
    } else {
      startDrag(ev, "create");
    }
  });

  // Pointer on the box body = move.
  box.addEventListener("pointerdown", ev => {
    if (ev.target.classList.contains("crop-handle")) return;
    startDrag(ev, "move");
  });

  // Pointer on handles = resize.
  for (const h of box.querySelectorAll(".crop-handle")) {
    h.addEventListener("pointerdown", ev => {
      ev.stopPropagation();
      startDrag(ev, "resize", h.dataset.h);
    });
  }

  const onMove = (ev) => {
    const d = imgState.drag;
    if (!d) return;
    const pt = getNaturalPt(ev);
    const img = imgState.img;
    const ratio = imgState.cropRatio;

    if (d.mode === "create") {
      let x = Math.min(d.startPt.x, pt.x);
      let y = Math.min(d.startPt.y, pt.y);
      let w = Math.abs(pt.x - d.startPt.x);
      let h = Math.abs(pt.y - d.startPt.y);
      if (ratio) {
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
      }
      imgState.crop = clampCrop({ x, y, w, h }, img);
    } else if (d.mode === "move") {
      const dx = pt.x - d.startPt.x;
      const dy = pt.y - d.startPt.y;
      imgState.crop = clampCrop({
        x: d.startCrop.x + dx,
        y: d.startCrop.y + dy,
        w: d.startCrop.w,
        h: d.startCrop.h,
      }, img);
    } else if (d.mode === "resize") {
      imgState.crop = resizeCrop(d.startCrop, d.handle, pt, ratio, img);
    }
    syncTargetInputs();
    scheduleDraw();
  };

  const onUp = (ev) => {
    if (!imgState.drag) return;
    try { ev.target.releasePointerCapture(ev.pointerId); } catch {}
    // Discard tiny crop.
    if (imgState.crop && (imgState.crop.w < 4 || imgState.crop.h < 4)) imgState.crop = null;
    imgState.drag = null;
    syncTargetInputs();
    scheduleDraw();
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function syncTargetInputs() {
  if (!imgState.crop) return;
  imgState.targetW = Math.round(imgState.crop.w);
  imgState.targetH = Math.round(imgState.crop.h);
  const wEl = $("#imgW"), hEl = $("#imgH");
  if (wEl) wEl.value = imgState.targetW;
  if (hEl) hEl.value = imgState.targetH;
}

// Resize by dragging a handle; optionally lock aspect ratio.
function resizeCrop(start, handle, pt, ratio, img) {
  let { x, y, w, h } = start;
  const right = x + w, bottom = y + h;
  let nx = x, ny = y, nw = w, nh = h;
  if (handle.includes("e")) nw = Math.max(1, pt.x - x);
  if (handle.includes("w")) { nx = Math.min(pt.x, right - 1); nw = right - nx; }
  if (handle.includes("s")) nh = Math.max(1, pt.y - y);
  if (handle.includes("n")) { ny = Math.min(pt.y, bottom - 1); nh = bottom - ny; }
  if (ratio) {
    // Which dimension drives depends on handle.
    const cornersWE = handle === "e" || handle === "w";
    const cornersNS = handle === "n" || handle === "s";
    if (cornersWE) {
      nh = nw / ratio;
      if (handle === "e") ny = y + (h - nh) / 2;
      else ny = y + (h - nh) / 2;
    } else if (cornersNS) {
      nw = nh * ratio;
      if (handle === "n") nx = x + (w - nw) / 2;
      else nx = x + (w - nw) / 2;
    } else {
      // corner: keep both edges that are being dragged.
      if (nw / nh > ratio) nw = nh * ratio; else nh = nw / ratio;
      if (handle === "nw") { nx = right - nw; ny = bottom - nh; }
      else if (handle === "ne") { ny = bottom - nh; }
      else if (handle === "sw") { nx = right - nw; }
    }
  }
  return clampCrop({ x: nx, y: ny, w: nw, h: nh }, img);
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
