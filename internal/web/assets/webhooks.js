// ==================== Webhooks ====================

let whStream = null;
let whEvents = [];
let whCurrent = null;

async function renderWebhooks(pid) {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);
  $("#main").classList.remove("no-scroll");
  if (whStream) { whStream.close(); whStream = null; }
  whCurrent = pid || null;

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Hooks</div>
    <div id="whList"></div>
  `;
  await refreshWebhookSidebar(pid);

  if (!pid) {
    $("#main").innerHTML = `<div class="mail-empty">Pick a hook or create a new one.</div>`;
    return;
  }
  await renderWebhookInspector(pid);
  subscribeWebhookStream(pid);
}

async function refreshWebhookSidebar(activePid) {
  let hooks = [];
  try { hooks = await api("/api/webhooks"); } catch {}
  const bar = $("#whList");
  if (!bar) return;
  if (!hooks.length) {
    bar.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:8px 12px">No hooks yet.</div>';
    return;
  }
  bar.innerHTML = hooks.map(h => `
    <div class="mb-item ${h.public_id===activePid?"active":""}" data-pid="${esc(h.public_id)}">
      <span class="addr" title="${esc(h.name || h.public_id)}">${esc(h.name || h.public_id)}</span>
      <span class="x" title="Delete">×</span>
    </div>
  `).join("");
  bar.onclick = async e => {
    const item = e.target.closest(".mb-item");
    if (!item) return;
    if (e.target.classList.contains("x")) {
      e.stopPropagation();
      if (!confirm("Delete this hook and its events?")) return;
      try {
        await fetch("/api/webhooks/" + item.dataset.pid, { method: "DELETE" });
        if (whCurrent === item.dataset.pid) location.hash = "#/webhooks";
        else refreshWebhookSidebar(whCurrent);
      } catch (err) { toast(err.message); }
      return;
    }
    location.hash = "#/webhooks/" + item.dataset.pid;
  };
}

function createWebhook() {
  openCreateWebhookModal();
}

function openCreateWebhookModal() {
  openModal(`
    <h2>New webhook</h2>
    <div class="field">
      <label>Name</label>
      <div class="pw-row">
        <input id="whName" placeholder="(optional, e.g. stripe-test)" autocomplete="off" />
        <button type="button" class="ghost" id="whRand" title="Random name">🎲</button>
      </div>
    </div>
    <div class="dns-help" style="margin-top:6px">
      A unique endpoint will be generated under <code>/hook/&lt;id&gt;</code>. Any method, any sub-path is captured.
    </div>
    <div class="actions">
      <button class="ghost" id="whCancel">Cancel</button>
      <button class="primary" id="whCreate">Create</button>
    </div>
  `);
  const fillRandom = () => {
    const adj = typeof RAND_ADJ !== "undefined" ? RAND_ADJ : ["swift","happy","clever"];
    const noun = typeof RAND_NOUN !== "undefined" ? RAND_NOUN : ["falcon","otter","comet"];
    const rnd = a => a[Math.floor(Math.random() * a.length)];
    $("#whName").value = `${rnd(adj)}-${rnd(noun)}`;
  };
  $("#whRand").onclick = fillRandom;
  $("#whCancel").onclick = closeModal;
  $("#whCreate").onclick = async () => {
    const name = $("#whName").value.trim();
    try {
      const h = await api("/api/webhooks", { method: "POST", body: JSON.stringify({ name }) });
      closeModal();
      toast("Hook created");
      location.hash = "#/webhooks/" + h.public_id;
    } catch (err) { toast(err.message); }
  };
  setTimeout(() => $("#whName").focus(), 40);
}

async function renderWebhookInspector(pid) {
  const endpoint = location.origin + "/hook/" + pid;
  $("#main").innerHTML = `
    <div class="wh-view">
      <div class="mail-topbar">
        <div class="open-row">
          <label>Endpoint:</label>
          <input readonly value="${esc(endpoint)}" class="mono" style="flex:1" id="whEndpoint" />
          <button class="ghost" id="whCopy">📋 Copy</button>
          <button class="ghost" id="whClear">Clear events</button>
          <span class="status" id="whStatus" title="stream status"></span>
        </div>
        <div class="url-email">
          Any method, any path under <code style="color:var(--accent)">${esc(endpoint)}</code> is captured (up to 1 MiB per request).
        </div>
      </div>
      <div class="mail-split">
        <div class="mail-pane-left"><div id="whEvList" class="mail-list"></div></div>
        <div class="mail-pane-right" id="whDetail">
          <div class="mail-empty">Select a request to inspect.</div>
        </div>
      </div>
    </div>
  `;
  $("#main").classList.add("no-scroll");
  $("#whCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(endpoint); toast("Endpoint copied"); } catch { toast("Copy failed"); }
  };
  $("#whClear").onclick = async () => {
    if (!confirm("Delete all captured requests?")) return;
    try {
      await fetch("/api/webhooks/" + pid + "/events", { method: "DELETE" });
      whEvents = [];
      renderWhEventList();
      $("#whDetail").innerHTML = '<div class="mail-empty">Select a request to inspect.</div>';
    } catch (err) { toast(err.message); }
  };
  try {
    whEvents = await api("/api/webhooks/" + pid);
  } catch { whEvents = []; }
  renderWhEventList();
  $("#whEvList").onclick = e => {
    const it = e.target.closest(".mail-item");
    if (!it) return;
    selectWhEvent(it.dataset.id);
  };
}

function renderWhEventList() {
  const list = $("#whEvList");
  if (!list) return;
  if (!whEvents.length) {
    list.innerHTML = '<div class="mail-empty">Waiting for requests…</div>';
    return;
  }
  list.innerHTML = whEvents.map(ev => `
    <div class="mail-item" data-id="${ev.id}">
      <div class="top">
        <span class="sender"><span class="wh-method wh-${esc((ev.method||"").toLowerCase())}">${esc(ev.method)}</span> ${esc(ev.path || "/")}</span>
        <span class="time">${fmtDate(ev.received_at)}</span>
      </div>
      <div class="subject">${ev.size} bytes${ev.query ? " · ?" + esc(ev.query) : ""}</div>
    </div>
  `).join("");
}

function selectWhEvent(id) {
  const ev = whEvents.find(x => String(x.id) === String(id));
  if (!ev) return;
  $$("#whEvList .mail-item").forEach(el => el.classList.toggle("active", el.dataset.id === String(id)));
  const pane = $("#whDetail");
  let headers = {};
  try { headers = JSON.parse(ev.headers || "{}"); } catch {}
  const headersHtml = Object.entries(headers).map(([k, v]) =>
    `<div><span class="tz-k">${esc(k)}</span><span class="mono">${esc(Array.isArray(v)?v.join(", "):v)}</span></div>`
  ).join("");
  let bodyPretty = ev.body;
  if ((ev.content_type || "").includes("json")) {
    try { bodyPretty = JSON.stringify(JSON.parse(ev.body), null, 2); } catch {}
  }
  pane.innerHTML = `
    <div class="mail-detail-head">
      <div class="mail-detail-subject"><span class="wh-method wh-${esc((ev.method||"").toLowerCase())}">${esc(ev.method)}</span> ${esc(ev.path || "/")}${ev.query ? "?" + esc(ev.query) : ""}</div>
      <div class="mail-detail-meta">
        <span><span class="tz-k">From</span><span class="mono">${esc(ev.remote_addr)}</span></span>
        <span><span class="tz-k">Received</span>${fmtDate(ev.received_at)}</span>
        <span><span class="tz-k">Size</span>${ev.size} B</span>
      </div>
    </div>
    <div class="mail-detail-body">
      <div class="mail-tabs">
        <button class="mail-tab active" data-tab="body">Body</button>
        <button class="mail-tab" data-tab="headers">Headers</button>
      </div>
      <div class="mail-tab-content">
        <pre data-pane="body">${esc(bodyPretty || "")}</pre>
        <pre data-pane="headers" hidden>${esc(JSON.stringify(headers, null, 2))}</pre>
      </div>
    </div>
  `;
  pane.querySelector(".mail-tabs").addEventListener("click", e => {
    const t = e.target.closest(".mail-tab");
    if (!t) return;
    const tab = t.dataset.tab;
    pane.querySelectorAll(".mail-tab").forEach(b => b.classList.toggle("active", b === t));
    pane.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== tab);
  });
}

function subscribeWebhookStream(pid) {
  const statusEl = $("#whStatus");
  if (statusEl) statusEl.dataset.state = "connecting";
  whStream = new EventSource("/api/webhooks/" + pid + "/stream");
  whStream.onopen = () => statusEl && (statusEl.dataset.state = "online");
  whStream.onerror = () => statusEl && (statusEl.dataset.state = "offline");
  whStream.onmessage = async () => {
    if (whCurrent !== pid) return;
    try {
      whEvents = await api("/api/webhooks/" + pid);
      renderWhEventList();
      toast("New request");
    } catch {}
  };
}
