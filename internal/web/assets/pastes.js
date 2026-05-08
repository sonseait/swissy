// ==================== Pastes ====================

const PASTE_LANGS = [
  "plain", "bash", "c", "cpp", "css", "diff", "dockerfile", "go", "graphql",
  "html", "ini", "java", "javascript", "json", "kotlin", "lua", "markdown",
  "nginx", "php", "python", "ruby", "rust", "scala", "shell", "sql", "swift",
  "toml", "typescript", "xml", "yaml",
];

const PASTE_EXPIRES = [
  ["", "Never"],
  ["15m", "15 min"],
  ["1h", "1 hour"],
  ["1d", "1 day"],
  ["7d", "7 days"],
  ["30d", "30 days"],
];

let pasteList = [];

async function renderPastes(pid) {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);
  $("#main").classList.remove("no-scroll");
  $("#sidebarContent").innerHTML = "";

  if (pid) {
    await renderPasteView(pid);
    return;
  }

  $("#main").innerHTML = `<div id="pasteGrid" class="grid"></div>`;
  try { pasteList = await api("/api/pastes"); } catch { pasteList = []; }
  renderPasteGrid();
  $("#pasteGrid").addEventListener("click", async e => {
    const card = e.target.closest(".paste-card");
    if (!card) return;
    const pid = card.dataset.pid;
    if (e.target.closest(".del")) {
      e.stopPropagation();
      if (!confirm("Delete this paste?")) return;
      try {
        await fetch("/api/pastes/" + pid, { method: "DELETE" });
        pasteList = pasteList.filter(p => p.public_id !== pid);
        renderPasteGrid();
      } catch (err) { toast(err.message); }
      return;
    }
    location.hash = "#/pastes/" + pid;
  });
}

function renderPasteGrid() {
  const grid = $("#pasteGrid");
  if (!grid) return;
  if (!pasteList.length) {
    grid.innerHTML = '<div class="mail-empty">No pastes yet. Click + in the top bar to create one.</div>';
    return;
  }
  grid.innerHTML = pasteList.map(p => {
    const preview = (p.body || "").slice(0, 280);
    return `
      <div class="card paste-card" data-pid="${esc(p.public_id)}">
        <button class="del" title="Delete">×</button>
        <div class="paste-card-head">
          <span class="paste-title-small">${esc(p.title || "(untitled)")}</span>
          <span class="paste-lang">${esc(p.language)}</span>
        </div>
        <pre class="paste-card-body mono">${esc(preview)}</pre>
        <div class="paste-card-foot">
          <span>${p.size} B</span>
          <span>${fmtDate(p.created_at)}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function renderPasteView(pid) {
  let p;
  try {
    p = await api("/api/pastes/" + pid);
  } catch (err) {
    $("#main").innerHTML = `<div class="text-error">Paste not found.</div>`;
    return;
  }
  const rawURL = location.origin + "/p/" + p.public_id;
  const shareURL = location.origin + "/#/pastes/" + p.public_id;
  const lang = p.language && p.language !== "plain" ? p.language : "";
  const safe = esc(p.body);
  const highlighted = lang && window.hljs && hljs.getLanguage(lang)
    ? hljs.highlight(p.body, { language: lang }).value
    : (window.hljs ? hljs.highlightAuto(p.body).value : safe);

  $("#main").innerHTML = `
    <div class="paste-view">
      <div class="paste-head">
        <div class="paste-title-row">
          <button class="ghost" id="pBack">← All pastes</button>
          <h2 class="paste-title">${esc(p.title || "(untitled)")}</h2>
          <span class="paste-lang">${esc(p.language)}</span>
          ${p.expires_at ? `<span class="paste-expires">expires ${fmtDate(p.expires_at)}</span>` : ""}
        </div>
        <div class="paste-actions">
          <button class="ghost" id="pCopy">Copy body</button>
          <button class="ghost" id="pShare">Copy share link</button>
          <a class="ghost" href="${esc(rawURL)}" target="_blank" rel="noopener">Raw</a>
          <button class="ghost" id="pDelete">Delete</button>
        </div>
      </div>
      <div class="paste-meta mono">
        ${p.size} bytes · created ${fmtDate(p.created_at)} · <a href="${esc(shareURL)}">${esc(shareURL)}</a>
      </div>
      <pre class="paste-body"><code class="hljs${lang?" language-"+esc(lang):""}">${highlighted}</code></pre>
    </div>
  `;
  $("#pBack").onclick = () => { location.hash = "#/pastes"; };
  $("#pCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(p.body); toast("Copied"); } catch { toast("Copy failed"); }
  };
  $("#pShare").onclick = async () => {
    try { await navigator.clipboard.writeText(shareURL); toast("Link copied"); } catch { toast("Copy failed"); }
  };
  $("#pDelete").onclick = async () => {
    if (!confirm("Delete this paste?")) return;
    try {
      await fetch("/api/pastes/" + p.public_id, { method: "DELETE" });
      location.hash = "#/pastes";
    } catch (err) { toast(err.message); }
  };
}

function openCreatePasteModal() {
  openModal(`
    <div class="modal-large">
    <h2>New paste</h2>
    <div class="field">
      <label>Title</label>
      <input id="mpTitle" placeholder="(optional)" autocomplete="off" />
    </div>
    <div class="field" style="flex-direction:row;gap:10px">
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <label>Language</label>
        <div class="dd" id="mpLang" data-value="plain">
          <button type="button" class="dd-toggle"><span class="dd-label">plain</span><span class="dd-arrow">▾</span></button>
          <ul class="dd-menu" hidden>
            ${PASTE_LANGS.map(l => `<li class="dd-item${l==="plain"?" active":""}" data-value="${esc(l)}">${esc(l)}</li>`).join("")}
          </ul>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <label>Expires</label>
        <div class="dd" id="mpExp" data-value="">
          <button type="button" class="dd-toggle"><span class="dd-label">Never</span><span class="dd-arrow">▾</span></button>
          <ul class="dd-menu" hidden>
            ${PASTE_EXPIRES.map(([v, label]) => `<li class="dd-item${v===""?" active":""}" data-value="${esc(v)}">${esc(label)}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Body</label>
      <div id="mpBody" class="code-editor" data-placeholder="Paste or type snippet here…"></div>
    </div>
    <div class="actions">
      <button class="ghost" id="mpCancel">Cancel</button>
      <button class="primary" id="mpSave">Create</button>
    </div>
    </div>
  `);
  const editor = attachCodeEditor($("#mpBody"), "plain");
  bindDropdown($("#mpLang"), val => {
    if (editor) editor.setLanguage(val);
    return true;
  });
  bindDropdown($("#mpExp"), () => true);
  $("#mpCancel").onclick = closeModal;
  $("#mpSave").onclick = async () => {
    const body = $("#mpBody").textContent;
    if (!body.trim()) { toast("Body required"); return; }
    const payload = {
      title: $("#mpTitle").value.trim(),
      language: $("#mpLang").dataset.value,
      body,
      expires_in: $("#mpExp").dataset.value,
    };
    try {
      const p = await api("/api/pastes", { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      toast("Paste saved");
      location.hash = "#/pastes/" + p.public_id;
    } catch (err) { toast(err.message); }
  };
  setTimeout(() => $("#mpTitle").focus(), 40);
}
