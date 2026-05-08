// ==================== QR generator ====================

const QR_STORAGE = "swissy.qr.last";

function renderQR() {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);
  $("#main").classList.remove("no-scroll");

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Templates</div>
    <div id="qrTemplates"></div>
  `;
  const templates = [
    ["url", "URL", "https://example.com"],
    ["wifi", "Wi-Fi", "WIFI:T:WPA;S:NETWORK;P:password;;"],
    ["mailto", "Email", "mailto:someone@example.com?subject=Hi"],
    ["tel", "Phone", "tel:+1234567890"],
    ["sms", "SMS", "sms:+1234567890:Hello"],
    ["geo", "Location", "geo:37.7749,-122.4194"],
    ["vcard", "Contact", "BEGIN:VCARD\nVERSION:3.0\nN:Doe;John\nTEL:+1234567890\nEMAIL:john@example.com\nEND:VCARD"],
  ];
  $("#qrTemplates").innerHTML = templates.map(([k, label]) =>
    `<div class="mb-item" data-k="${k}"><span class="addr">${esc(label)}</span></div>`
  ).join("");
  $("#qrTemplates").addEventListener("click", e => {
    const item = e.target.closest(".mb-item");
    if (!item) return;
    const t = templates.find(x => x[0] === item.dataset.k);
    if (t) { $("#qrText").value = t[2]; updateQR(); }
  });

  $("#main").innerHTML = `
    <div class="qr-workspace">
      <div class="qr-form">
        <label class="qr-label">Content</label>
        <textarea id="qrText" class="text-area mono" spellcheck="false" placeholder="Paste or type anything — URL, text, vCard, Wi-Fi config…"></textarea>
        <div class="qr-controls">
          <div class="opt">
            <label>Size</label>
            <div class="chip-row" id="qrSizes">
              ${[200, 320, 512, 800].map((s, i) =>
                `<button class="chip ${s===320?"active":""}" data-s="${s}" type="button">${s}px</button>`
              ).join("")}
            </div>
          </div>
          <button class="primary" id="qrDownload">Download PNG</button>
        </div>
      </div>
      <div class="qr-preview">
        <div class="qr-card">
          <img id="qrImg" alt="QR preview" />
          <div class="qr-meta" id="qrMeta">Enter content to generate</div>
        </div>
      </div>
    </div>
  `;

  const saved = localStorage.getItem(QR_STORAGE);
  if (saved) $("#qrText").value = saved;

  let tmr = null;
  $("#qrText").addEventListener("input", () => {
    clearTimeout(tmr);
    tmr = setTimeout(updateQR, 250);
  });
  $("#qrSizes").addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    $$("#qrSizes .chip").forEach(x => x.classList.toggle("active", x === b));
    updateQR();
  });
  $("#qrDownload").addEventListener("click", downloadQR);

  updateQR();
}

function qrCurrentSize() {
  const active = $("#qrSizes .chip.active");
  return active ? parseInt(active.dataset.s, 10) : 320;
}

function updateQR() {
  const text = $("#qrText").value;
  const img = $("#qrImg");
  const meta = $("#qrMeta");
  if (!text.trim()) {
    img.removeAttribute("src");
    img.style.display = "none";
    meta.textContent = "Enter content to generate";
    return;
  }
  localStorage.setItem(QR_STORAGE, text);
  const size = qrCurrentSize();
  const url = "/api/qr?size=" + size + "&text=" + encodeURIComponent(text);
  img.src = url;
  img.style.display = "";
  meta.textContent = `${text.length} char${text.length === 1 ? "" : "s"} · ${size}×${size}`;
}

async function downloadQR() {
  const text = $("#qrText").value.trim();
  if (!text) { toast("Enter content first"); return; }
  const size = qrCurrentSize();
  const url = "/api/qr?size=" + size + "&text=" + encodeURIComponent(text);
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `qr-${size}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Downloaded");
}
