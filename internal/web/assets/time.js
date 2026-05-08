// ==================== Time / Timezone ====================

const TZ_STORE = "timezones";
const DEFAULT_TZS = ["UTC", "Asia/Ho_Chi_Minh", "America/New_York", "Europe/London", "Asia/Tokyo"];

function tzIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("swissy", 2);
    req.onupgradeneeded = (ev) => {
      const d = req.result;
      if (!d.objectStoreNames.contains("recent")) d.createObjectStore("recent", { keyPath: "addr" });
      if (!d.objectStoreNames.contains(TZ_STORE)) d.createObjectStore(TZ_STORE, { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tzAll() {
  const d = await tzIdb();
  return new Promise((res, rej) => {
    const tx = d.transaction(TZ_STORE, "readonly");
    const r = tx.objectStore(TZ_STORE).getAll();
    r.onsuccess = () => res(r.result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    r.onerror = () => rej(r.error);
  });
}
async function tzPut(name, order) {
  const d = await tzIdb();
  await new Promise((res, rej) => {
    const tx = d.transaction(TZ_STORE, "readwrite");
    tx.objectStore(TZ_STORE).put({ name, order });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function tzDel(name) {
  const d = await tzIdb();
  await new Promise((res, rej) => {
    const tx = d.transaction(TZ_STORE, "readwrite");
    tx.objectStore(TZ_STORE).delete(name);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function tzSeedIfEmpty() {
  const existing = await tzAll();
  if (existing.length) return existing;
  for (let i = 0; i < DEFAULT_TZS.length; i++) await tzPut(DEFAULT_TZS[i], i);
  return tzAll();
}

function allTzList() {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return DEFAULT_TZS.slice(); }
}

// Get current offset (minutes) for a timezone at given instant.
function tzOffsetMin(tz, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
    +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}
function fmtOffset(min) {
  const sign = min >= 0 ? "+" : "-";
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fmtInTz(date, tz) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour12: false,
    weekday: "short", year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(date);
}

// Parse local datetime-local input (YYYY-MM-DDTHH:mm[:ss]) as a wall clock in srcTz.
function parseInTz(localStr, srcTz) {
  if (!localStr) return new Date();
  const [d, t = "00:00:00"] = localStr.split("T");
  const [Y, Mo, D] = d.split("-").map(Number);
  const [H, Mi, S = 0] = t.split(":").map(Number);
  // naive UTC of those wall-clock numbers
  let guess = Date.UTC(Y, Mo - 1, D, H, Mi, S);
  // correct by current offset of srcTz at guess
  const off = tzOffsetMin(srcTz, new Date(guess));
  return new Date(guess - off * 60000);
}

function localInputValue(date, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

async function renderTime() {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzs = await tzSeedIfEmpty();
  const srcTz = browserTz;

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Pinned zones</div>
    <div id="tzList"></div>
    <div style="padding: 8px 10px">
      <button class="sidebar-btn" id="addTzBtn">+ Add timezone</button>
    </div>
  `;
  renderTzSidebar(tzs);

  const now = new Date();
  $("#main").innerHTML = `
    <div class="mail-topbar">
      <div class="open-row">
        <label>Source:</label>
        <div class="dd" id="tzSrc" data-value="${esc(srcTz)}" style="min-width:220px">
          <button type="button" class="dd-toggle">
            <span class="dd-label">${esc(srcTz)}</span>
            <span class="dd-arrow">▾</span>
          </button>
          <ul class="dd-menu" hidden>
            ${allTzList().map(z =>
              `<li class="dd-item${z===srcTz?' active':''}" data-value="${esc(z)}">${esc(z)}</li>`).join("")}
          </ul>
        </div>
        <input type="datetime-local" id="tzInput" step="1" value="${esc(localInputValue(now, srcTz))}" />
        <button class="ghost" id="tzNow">Now</button>
      </div>
    </div>
    <div id="tzResults" class="tz-grid"></div>
  `;

  bindDropdown($("#tzSrc"), () => true);
  $("#tzSrc").addEventListener("click", refreshTz);
  $("#tzInput").addEventListener("input", refreshTz);
  $("#tzNow").addEventListener("click", () => {
    $("#tzInput").value = localInputValue(new Date(), $("#tzSrc").dataset.value);
    refreshTz();
  });
  $("#addTzBtn").addEventListener("click", () => openAddTzModal());
  $("#tzList").addEventListener("click", async e => {
    const item = e.target.closest(".mb-item");
    if (!item) return;
    if (e.target.classList.contains("x")) {
      await tzDel(item.dataset.name);
      renderTime();
    }
  });

  refreshTz();
}

function renderTzSidebar(tzs) {
  $("#tzList").innerHTML = tzs.length
    ? tzs.map(t => `
      <div class="mb-item" data-name="${esc(t.name)}">
        <span class="addr" title="${esc(t.name)}">${esc(t.name)}</span>
        <span class="x" title="Remove">×</span>
      </div>`).join("")
    : '<div style="color:var(--dim);font-size:12px;padding:8px 12px">Empty.</div>';
}

async function refreshTz() {
  const srcTz = $("#tzSrc").dataset.value;
  const localStr = $("#tzInput").value;
  const date = parseInTz(localStr, srcTz);
  const tzs = await tzAll();
  const iso = date.toISOString();
  const epoch = Math.floor(date.getTime() / 1000);

  $("#tzResults").innerHTML = `
    <div class="tz-summary">
      <div><span class="tz-k">UTC ISO</span><span class="tz-v mono">${esc(iso)}</span></div>
      <div><span class="tz-k">Epoch</span><span class="tz-v mono">${epoch}</span></div>
    </div>
    <div class="tz-cards">
      ${tzs.map(t => {
        const off = tzOffsetMin(t.name, date);
        return `<div class="tz-card">
          <div class="tz-name">${esc(t.name)}</div>
          <div class="tz-time mono">${esc(fmtInTz(date, t.name))}</div>
          <div class="tz-off">UTC ${fmtOffset(off)}</div>
        </div>`;
      }).join("")}
    </div>
  `;
}

function openAddTzModal() {
  const zones = allTzList();
  openModal(`
    <h2>Add timezone</h2>
    <div class="field">
      <label>Search</label>
      <input id="tzSearch" placeholder="Asia/Tokyo" autocomplete="off" />
    </div>
    <div id="tzOptions" class="tz-options"></div>
    <div class="actions">
      <button class="ghost" onclick="closeModal()">Cancel</button>
    </div>
  `);
  const render = (q = "") => {
    const ql = q.toLowerCase();
    const filtered = zones.filter(z => z.toLowerCase().includes(ql)).slice(0, 60);
    $("#tzOptions").innerHTML = filtered.map(z =>
      `<div class="tz-opt" data-name="${esc(z)}">${esc(z)}</div>`).join("")
      || '<div style="color:var(--dim);padding:8px">No match</div>';
  };
  render();
  $("#tzSearch").addEventListener("input", e => render(e.target.value));
  $("#tzOptions").addEventListener("click", async e => {
    const it = e.target.closest(".tz-opt");
    if (!it) return;
    const existing = await tzAll();
    await tzPut(it.dataset.name, existing.length);
    closeModal();
    renderTime();
  });
}
