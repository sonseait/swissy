// ---------- Utils ----------
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1200);
}

async function api(path, opts={}) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

function fmtDate(s) {
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString();
}

// ---------- Modal ----------
function openModal(html) {
  $("#modalBox").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); }
$("#modal").addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});

// ---------- Router ----------
function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/totps";
  const [, route, ...rest] = h.split("/");
  const cleaned = rest.filter(s => s && s !== "undefined" && s !== "null");
  return { route: route || "totps", rest: cleaned };
}

async function render() {
  const { route, rest } = parseHash();
  $$(".sidebar nav a").forEach(a =>
    a.classList.toggle("active", a.dataset.route === route));
  $("#main").classList.remove("no-scroll");
  try {
    if (route === "totps") await renderTOTPs();
    else if (route === "logins") await renderLogins();
    else if (route === "mails") await renderMails(rest.join("/"));
    else if (route === "text") await renderText(rest[0] || "case");
    else if (route === "time") await renderTime();
    else if (route === "image") await renderImage();
    else if (route === "md") await renderMarkdown();
    else { location.hash = "#/totps"; }
  } catch (err) {
    console.error("render failed:", err);
    $("#main").innerHTML = `<h1>Error</h1><div class="text-error">${esc(err.message)}</div>`;
  }
}
window.addEventListener("hashchange", render);

// ==================== TOTPs ====================
let totpEntries = [];
let totpTimer = null;

async function renderTOTPs() {
  if (totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  $("#sidebarContent").innerHTML = "";
  $("#main").innerHTML = `
    <h1>TOTPs</h1>
    <form class="row" id="totpForm">
      <input name="name" placeholder="Name (optional)" autocomplete="off" />
      <input name="secret" placeholder="Secret or otpauth://..." autocomplete="off" required />
      <button class="primary" type="submit">Add</button>
    </form>
    <div id="totpGrid" class="grid"></div>
  `;
  $("#totpForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      totpEntries = await api("/api/totps", {
        method: "POST",
        body: JSON.stringify({ name: fd.get("name"), secret: fd.get("secret") }),
      });
      e.target.reset();
      renderTOTPGrid();
    } catch (err) { toast(err.message); }
  });
  $("#totpGrid").addEventListener("click", async e => {
    const card = e.target.closest(".card");
    if (!card) return;
    if (e.target.classList.contains("del")) {
      e.stopPropagation();
      await api("/api/totps/" + card.dataset.id, { method: "DELETE" });
      totpEntries = totpEntries.filter(x => x.id != card.dataset.id);
      renderTOTPGrid();
      return;
    }
    try {
      await navigator.clipboard.writeText(card.dataset.code);
      toast("Copied " + card.dataset.code);
    } catch { toast("Copy failed"); }
  });
  totpEntries = await api("/api/totps");
  renderTOTPGrid();
  clearInterval(totpTimer);
  totpTimer = setInterval(renderTOTPGrid, 1000);
}

async function renderTOTPGrid() {
  const grid = $("#totpGrid");
  if (!grid) { clearInterval(totpTimer); return; }
  if (!totpEntries.length) {
    grid.innerHTML = '<div class="mail-empty">No entries yet.</div>';
    return;
  }
  const now = Date.now();
  const secLeft = 30 - Math.floor(now / 1000) % 30;
  const pct = (secLeft / 30) * 100;
  const cards = await Promise.all(totpEntries.map(async e => {
    let code = "------";
    try { code = await totp(e.secret, now); } catch(_) {}
    const display = code.slice(0,3) + " " + code.slice(3);
    return `<div class="card" data-code="${code}" data-id="${e.id}">
      <button class="del" title="Delete">×</button>
      <div class="name">${esc(e.name || "(unnamed)")}</div>
      <div class="code">${display}</div>
      <div class="foot">
        <span>${fmtDate(e.created_at)}</span>
        <span>${secLeft}s</span>
      </div>
      <div class="progress"><div class="bar ${secLeft<=5?'low':''}" style="width:${pct}%"></div></div>
    </div>`;
  }));
  grid.innerHTML = cards.join("");
}

// ==================== IndexedDB (recent mailboxes) ====================
const DB_NAME = "swissy", STORE = "recent";
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("recent")) d.createObjectStore("recent", { keyPath: "addr" });
      if (!d.objectStoreNames.contains("timezones")) d.createObjectStore("timezones", { keyPath: "name" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function recentPut(addr, id) {
  const d = await idb();
  await new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ addr, id: id || "", at: Date.now() });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  return id;
}
async function recentDel(addr) {
  const d = await idb();
  await new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(addr);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function recentAll() {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result.sort((a,b) => b.at - a.at));
    req.onerror = () => rej(req.error);
  });
}
async function recentByAddr(addr) {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(addr);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}
async function recentById(id) {
  const all = await recentAll();
  return all.find(r => r.id === id) || null;
}

const RAND_ADJ = [
  "swift","silent","brave","clever","happy","lucky","bright","calm","bold","gentle",
  "rapid","quiet","witty","keen","nimble","misty","sunny","frosty","cosmic","silver",
  "golden","royal","ancient","modern","mystic","urban","rustic","polar","tropic","lunar",
  "solar","stellar","amber","azure","crimson","emerald","ivory","jade","onyx","ruby",
  "sapphire","velvet","vivid","noble","humble","mighty","tiny","giant","sleek","fierce",
  "wild","tame","fancy","plain","pure","bitter","sweet","salty","spicy","mellow",
  "crisp","fluffy","sturdy","fragile","agile","lazy","busy","idle","eager","patient",
  "curious","bored","dreamy","awake","sleepy","lively","zesty","fuzzy","smooth","rough",
  "hidden","secret","open","sealed","frozen","burning","soaked","dusty","grassy","stormy",
  "breezy","cloudy","clear","hazy","foggy","chilly","warm","cool","hot","tepid",
  "restless","steady","wandering","roaming","soaring","diving","rising","falling","spiraling","drifting",
  "electric","magnetic","sonic","neon","retro","vintage","quantum","nomad","feral","tender",
  "rogue","savage","placid","serene","fierce","bashful","cheerful","gloomy","jolly","grumpy",
  "kindly","merry","proud","brash","shy","timid","stoic","zen","wise","naive"
];
const RAND_NOUN = [
  "tiger","otter","raven","falcon","willow","river","cedar","comet","ember","harbor",
  "meadow","pilot","quartz","ranger","shadow","spark","storm","vortex","wolf","zephyr",
  "phoenix","dragon","hawk","eagle","lion","panther","jaguar","cheetah","leopard","lynx",
  "bear","fox","coyote","badger","beaver","elk","stag","bison","moose","rhino",
  "whale","dolphin","shark","manta","salmon","trout","squid","kraken","turtle","gecko",
  "cobra","viper","mamba","python","lizard","iguana","heron","swan","crane","owl",
  "sparrow","robin","lark","finch","magpie","crow","vulture","albatross","puffin","penguin",
  "mountain","valley","canyon","plateau","glacier","cavern","lagoon","reef","bay","delta",
  "island","peak","summit","ridge","cliff","beacon","lantern","anchor","compass","sail",
  "mariner","voyager","captain","scout","hunter","wizard","knight","sentinel","guardian","warden",
  "forge","anvil","hammer","blade","prism","crystal","obelisk","totem","monolith","pillar",
  "nebula","galaxy","quasar","pulsar","meteor","aurora","eclipse","nova","orbit","zenith",
  "horizon","dawn","dusk","twilight","solstice","equinox","tempest","cyclone","tornado","avalanche",
  "torrent","cascade","rapids","geyser","oasis","mirage","savanna","tundra","bayou","fjord",
  "grove","thicket","orchard","glade","heath","marsh","canopy","timber","juniper","cypress"
];
function randomLocal() {
  const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
  const n = Math.floor(Math.random() * 900 + 100);
  return `${rnd(RAND_ADJ)}.${rnd(RAND_NOUN)}${n}`;
}

// ==================== Mails ====================
let totpMailStream = null;
let currentMailbox = null;

async function renderMails(idOrAddr) {
  clearInterval(totpTimer);
  let domains = [], recents = [];
  try {
    [domains, recents] = await Promise.all([api("/api/domains"), recentAll()]);
  } catch (err) {
    console.error("renderMails load failed:", err);
    $("#main").innerHTML = `<h1>Mails</h1><div class="text-error">Load failed: ${esc(err.message)}</div>`;
    return;
  }
  let addr = "";
  if (idOrAddr && idOrAddr !== "undefined" && idOrAddr !== "null") {
    const hit = recents.find(r => r.id && r.id === idOrAddr);
    if (hit) addr = hit.addr;
    else if (idOrAddr.includes("@") || idOrAddr.includes("%40")) addr = decodeURIComponent(idOrAddr);
    else {
      try {
        const r = await api("/api/mailboxes/by-id/" + encodeURIComponent(idOrAddr));
        if (r && r.addr) {
          addr = r.addr;
          await recentPut(addr, r.public_id);
          recents = await recentAll();
        }
      } catch { /* not found */ }
    }
  }

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Recent mailboxes</div>
    <div id="mailboxList"></div>
  `;
  renderRecentList(recents, addr);

  $("#mailboxList").addEventListener("click", async e => {
    const item = e.target.closest(".mb-item");
    if (!item) return;
    if (e.target.classList.contains("x")) {
      e.stopPropagation();
      await recentDel(item.dataset.addr);
      renderMails(idOrAddr);
      return;
    }
    const pid = item.dataset.id;
    const ad = item.dataset.addr;
    if (pid) location.hash = "#/mails/" + pid;
    else if (ad) location.hash = "#/mails/" + encodeURIComponent(ad);
  });

  renderMailHeader(domains, addr);

  if (addr) {
    currentMailbox = addr;
    await openMailbox(addr);
  } else {
    currentMailbox = null;
    const body = $("#mailBody");
    if (body) body.innerHTML = '<div class="mail-empty">Enter an email to open its mailbox.</div>';
  }
}

function renderRecentList(recents, active) {
  const list = $("#mailboxList");
  if (!recents.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:8px">No recent yet.</div>';
    return;
  }
  list.innerHTML = recents.map(r => `
    <div class="mb-item ${r.addr===active?'active':''}" data-addr="${esc(r.addr)}" data-id="${esc(r.id || "")}">
      <span class="addr" title="${esc(r.addr)}">${esc(r.addr)}</span>
      <span class="x" title="Remove from recent">×</span>
    </div>
  `).join("");
}

function renderMailHeader(domains, addr) {
  let local = "", domain = domains[0]?.name || "";
  if (addr) {
    const p = addr.split("@");
    local = p[0] || ""; domain = p[1] || domain;
  }

  $("#main").innerHTML = `
    <div class="mail-topbar">
      <form id="openForm" class="open-row">
        <label>Email:</label>
        <input id="openLocal" placeholder="local-part" value="${esc(local)}" autocomplete="off" required />
        <span class="at">@</span>
        <div class="dd" id="ddDomain" data-value="${esc(domain)}">
          <button type="button" class="dd-toggle">
            <span class="dd-label">${esc(domain || "Select domain")}</span>
            <span class="dd-arrow">▾</span>
          </button>
          <ul class="dd-menu" hidden>
            ${domains.map(d => `<li class="dd-item${d.name===domain?' active':''}" data-value="${esc(d.name)}">${esc(d.name)}</li>`).join("")}
            <li class="dd-item dd-add" data-value="__add__">Add domain…</li>
          </ul>
        </div>
        <button class="primary" type="submit" id="openBtn">Open</button>
        <button class="ghost" type="button" id="randomBtn" title="Random mailbox">🎲 Random</button>
        <span class="status" id="sseStatus" title="stream status"></span>
      </form>
      ${addr ? `<div class="url-email">Mailbox: <b>${esc(addr)}</b></div>` : ""}
    </div>
    <div id="mailBody"></div>
  `;

  bindDropdown($("#ddDomain"), val => {
    if (val === "__add__") { openAddDomainModal(); return false; }
    return true;
  });

  $("#randomBtn").addEventListener("click", async () => {
    if (!domains.length) { toast("Add a domain first"); return; }
    const l = randomLocal();
    const d = domains[Math.floor(Math.random() * domains.length)].name;
    try {
      const res = await api("/api/mailboxes", { method: "POST", body: JSON.stringify({ local: l, domain: d }) });
      const a = (res && res.addr) || (l + "@" + d);
      const pid = (res && res.public_id) || "";
      await recentPut(a, pid);
      location.hash = "#/mails/" + (pid ? pid : encodeURIComponent(a));
    } catch (err) { toast(err.message); }
  });

  $("#openForm").addEventListener("submit", async e => {
    e.preventDefault();
    const l = $("#openLocal").value.trim().toLowerCase();
    const d = $("#ddDomain").dataset.value;
    if (!l || !d || d === "__add__") { toast("Enter email & domain"); return; }
    try {
      const res = await api("/api/mailboxes", { method: "POST", body: JSON.stringify({ local: l, domain: d }) });
      const a = (res && res.addr) || (l + "@" + d);
      const pid = (res && res.public_id) || "";
      await recentPut(a, pid);
      location.hash = "#/mails/" + (pid ? pid : encodeURIComponent(a));
    } catch (err) { toast(err.message); }
  });
}

// ---------- Custom dropdown ----------
function bindDropdown(root, onPick) {
  const toggle = root.querySelector(".dd-toggle");
  const menu = root.querySelector(".dd-menu");
  const label = root.querySelector(".dd-label");
  const placeholder = document.createComment("dd-menu");

  const position = () => {
    const r = toggle.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = r.left + "px";
    menu.style.width = r.width + "px";
    menu.style.right = "auto";
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const menuH = Math.min(280, menu.scrollHeight + 14);
    if (spaceBelow < menuH && spaceAbove > spaceBelow) {
      menu.style.top = "auto";
      menu.style.bottom = (window.innerHeight - r.top + 6) + "px";
    } else {
      menu.style.top = (r.bottom + 6) + "px";
      menu.style.bottom = "auto";
    }
  };

  const close = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    root.classList.remove("open");
    if (menu.parentNode === document.body) {
      placeholder.parentNode?.insertBefore(menu, placeholder);
      placeholder.remove();
    }
    window.removeEventListener("scroll", position, true);
    window.removeEventListener("resize", position);
  };
  const open = () => {
    $$(".dd.open").forEach(d => {
      if (d !== root) d.dispatchEvent(new Event("dd-close"));
    });
    menu.parentNode?.insertBefore(placeholder, menu);
    document.body.appendChild(menu);
    menu.hidden = false;
    root.classList.add("open");
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
  };

  root.addEventListener("dd-close", close);

  toggle.addEventListener("click", e => {
    e.stopPropagation();
    menu.hidden ? open() : close();
  });

  menu.addEventListener("click", e => {
    const item = e.target.closest(".dd-item");
    if (!item) return;
    const val = item.dataset.value;
    const accept = onPick ? onPick(val) : true;
    if (accept !== false) {
      root.dataset.value = val;
      label.textContent = item.textContent;
      menu.querySelectorAll(".dd-item").forEach(i => i.classList.toggle("active", i === item));
    }
    close();
  });

  document.addEventListener("click", e => {
    if (menu.hidden) return;
    if (!root.contains(e.target) && !menu.contains(e.target)) close();
  });
}

let currentMails = [];
let currentSelectedId = null;

async function openMailbox(addr) {
  const body = $("#mailBody");
  body.innerHTML = `
    <div class="mail-split">
      <div class="mail-pane-left">
        <div id="mailList" class="mail-list"></div>
      </div>
      <div class="mail-pane-right" id="mailDetail">
        <div class="mail-empty">Select a message to view its contents.</div>
      </div>
    </div>
  `;
  const mails = await api("/api/mailboxes/" + encodeURIComponent(addr));
  currentMails = mails;
  currentSelectedId = null;
  renderMailList(mails);
  subscribeMail(addr);

  $("#mailList").addEventListener("click", e => {
    const item = e.target.closest(".mail-item");
    if (!item) return;
    selectMail(item.dataset.id);
  });
}

function selectMail(id) {
  currentSelectedId = String(id);
  $$("#mailList .mail-item").forEach(el =>
    el.classList.toggle("active", el.dataset.id === currentSelectedId));
  const m = currentMails.find(x => String(x.id) === currentSelectedId);
  if (!m) return;
  showMailDetail(m);
}

async function showMailDetail(m) {
  const pane = $("#mailDetail");
  if (!pane) return;
  pane.innerHTML = `
    <div class="mail-detail-head">
      <div class="mail-detail-subject">${esc(m.subject || "(no subject)")}</div>
      <div class="mail-detail-meta">
        <span><span class="tz-k">From</span><span class="mono">${esc(m.sender)}</span></span>
        <span><span class="tz-k">Received</span>${fmtDate(m.received_at)}</span>
      </div>
    </div>
    <div class="mail-detail-body"><div class="mail-loading">Loading…</div></div>
  `;
  try {
    const r = await fetch("/api/mail/" + m.id);
    const raw = await r.text();
    const parsed = parseEml(raw);
    const body = $(".mail-detail-body");
    const hasHtml = !!parsed.html;
    const hasText = !!parsed.text;
    const defaultTab = hasHtml ? "html" : (hasText ? "text" : "raw");
    body.innerHTML = `
      <div class="mail-tabs">
        ${hasHtml ? `<button class="mail-tab ${defaultTab==="html"?"active":""}" data-tab="html">HTML</button>` : ""}
        ${hasText ? `<button class="mail-tab ${defaultTab==="text"?"active":""}" data-tab="text">Text</button>` : ""}
        <button class="mail-tab ${defaultTab==="raw"?"active":""}" data-tab="raw">Raw</button>
        ${parsed.attachments.length ? `<span class="mail-attach-count">${parsed.attachments.length} attachment${parsed.attachments.length>1?"s":""}</span>` : ""}
      </div>
      <div class="mail-tab-content">
        ${hasHtml ? `<iframe class="mail-html" data-pane="html" ${defaultTab==="html"?"":"hidden"} sandbox></iframe>` : ""}
        ${hasText ? `<pre class="mail-text" data-pane="text" ${defaultTab==="text"?"":"hidden"}></pre>` : ""}
        <pre class="mail-raw" data-pane="raw" ${defaultTab==="raw"?"":"hidden"}></pre>
      </div>
    `;
    if (hasHtml) {
      const iframe = body.querySelector('[data-pane="html"]');
      iframe.srcdoc = wrapEmailHtml(parsed.html);
    }
    if (hasText) body.querySelector('[data-pane="text"]').textContent = parsed.text;
    body.querySelector('[data-pane="raw"]').textContent = raw;
    body.querySelector(".mail-tabs").addEventListener("click", e => {
      const t = e.target.closest(".mail-tab");
      if (!t) return;
      const tab = t.dataset.tab;
      body.querySelectorAll(".mail-tab").forEach(b => b.classList.toggle("active", b === t));
      body.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== tab);
    });
  } catch (err) {
    $(".mail-detail-body").innerHTML = `<div class="text-error">Error: ${esc(err.message)}</div>`;
  }
}

function wrapEmailHtml(html) {
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  html, body {
    background: #0b1614; color: #e6f1ef;
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px; line-height: 1.6;
    margin: 0; padding: 14px 18px;
  }
  a { color: #10b981; }
  blockquote {
    border-left: 3px solid rgba(255,255,255,.15) !important;
    color: #9fb3b0; margin: 8px 0 8px 4px !important; padding-left: 12px !important;
  }
  pre, code {
    background: #050a0c; color: #e6f1ef;
    padding: 2px 6px; border-radius: 4px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
  }
  pre { padding: 10px 12px; overflow: auto; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; max-width: 100%; }
  hr { border: 0; border-top: 1px solid rgba(255,255,255,.1); }
  /* Neutralize common light backgrounds from marketing mail */
  [bgcolor="#ffffff"], [bgcolor="#FFFFFF"], [bgcolor="white"] { background: transparent !important; }
</style>
</head><body>${html}</body></html>`;
}

// ---------- Minimal RFC822 / MIME parser ----------
function parseEml(raw) {
  const out = { html: "", text: "", attachments: [] };
  const { headers, body } = splitHeadersBody(raw);
  const ct = headers["content-type"] || "text/plain";
  const cte = (headers["content-transfer-encoding"] || "7bit").toLowerCase();
  walkPart(ct, cte, body, out);
  return out;
}

function splitHeadersBody(raw) {
  const m = raw.match(/\r?\n\r?\n/);
  let headStr, body;
  if (m) {
    headStr = raw.slice(0, m.index);
    body = raw.slice(m.index + m[0].length);
  } else {
    headStr = raw; body = "";
  }
  const headers = {};
  const lines = headStr.split(/\r?\n/);
  let cur = "";
  for (const ln of lines) {
    if (/^[ \t]/.test(ln)) { cur += " " + ln.trim(); continue; }
    if (cur) pushHeader(headers, cur);
    cur = ln;
  }
  if (cur) pushHeader(headers, cur);
  return { headers, body };
}

function pushHeader(headers, line) {
  const i = line.indexOf(":");
  if (i < 0) return;
  const k = line.slice(0, i).trim().toLowerCase();
  const v = line.slice(i + 1).trim();
  headers[k] = v;
}

function parseContentType(v) {
  const parts = v.split(";").map(s => s.trim());
  const type = (parts[0] || "text/plain").toLowerCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    let val = parts[i].slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[parts[i].slice(0, eq).trim().toLowerCase()] = val;
  }
  return { type, params };
}

function walkPart(ctRaw, cte, body, out) {
  const { type, params } = parseContentType(ctRaw);
  if (type.startsWith("multipart/")) {
    const boundary = params.boundary;
    if (!boundary) return;
    const parts = splitMultipart(body, boundary);
    if (type === "multipart/alternative") {
      // Prefer last (usually HTML). Walk all, but allow any to set.
      for (const p of parts) walkMimePart(p, out);
    } else {
      for (const p of parts) walkMimePart(p, out);
    }
    return;
  }
  const decoded = decodeBody(body, cte, params.charset);
  if (type === "text/html") { if (!out.html) out.html = decoded; }
  else if (type === "text/plain") { if (!out.text) out.text = decoded; }
  else {
    out.attachments.push({ type, name: params.name || "attachment" });
  }
}

function walkMimePart(partRaw, out) {
  const { headers, body } = splitHeadersBody(partRaw);
  const ct = headers["content-type"] || "text/plain";
  const cte = (headers["content-transfer-encoding"] || "7bit").toLowerCase();
  walkPart(ct, cte, body, out);
}

function splitMultipart(body, boundary) {
  const delim = "--" + boundary;
  const end = delim + "--";
  const parts = [];
  const lines = body.split(/\r?\n/);
  let cur = null;
  for (const ln of lines) {
    const trimmed = ln.replace(/\s+$/, "");
    if (trimmed === delim || trimmed === end) {
      if (cur !== null) parts.push(cur.join("\r\n"));
      cur = trimmed === delim ? [] : null;
    } else if (cur !== null) {
      cur.push(ln);
    }
  }
  return parts;
}

function decodeBody(body, cte, charset) {
  let bytes;
  if (cte === "base64") {
    const clean = body.replace(/\s+/g, "");
    try { bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0)); }
    catch { return body; }
  } else if (cte === "quoted-printable") {
    const str = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)));
  } else {
    return body;
  }
  try {
    const cs = (charset || "utf-8").toLowerCase();
    return new TextDecoder(cs, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function openAddDomainModal() {
  openModal(`
    <h2>Add domain</h2>
    <div class="field">
      <label>Domain name</label>
      <input id="dName" placeholder="example.com" />
    </div>
    <div class="dns-help">
      After adding, point your MX record to this server so mail can arrive:
      <div style="margin-top:6px">
        <code>your-domain.  IN  MX  10  your-server-hostname.</code>
      </div>
      <div style="margin-top:6px;font-size:12px">
        The server hostname should resolve (A/AAAA) to the public IP running this app's SMTP on port 25.
      </div>
    </div>
    <div class="actions">
      <button class="ghost" id="dCancel">Cancel</button>
      <button class="primary" id="dCreate">Add</button>
    </div>
  `);
  $("#dCancel").onclick = closeModal;
  $("#dCreate").onclick = async () => {
    const name = $("#dName").value.trim().toLowerCase();
    try {
      await api("/api/domains", { method: "POST", body: JSON.stringify({ name }) });
      closeModal();
      // reopen new mailbox modal with refreshed domains
      const domains = await api("/api/domains");
      openNewMailboxModal(domains);
      toast("Domain added");
    } catch (err) { toast(err.message); }
  };
}

function renderMailList(mails) {
  const list = $("#mailList");
  if (!list) return;
  if (!mails.length) {
    list.innerHTML = '<div class="mail-empty">No mail yet. Waiting…</div>';
    return;
  }
  list.innerHTML = mails.map(m => `
    <div class="mail-item" data-id="${m.id}" data-subject="${esc(m.subject)}" data-sender="${esc(m.sender)}">
      <div class="top">
        <span class="sender">${esc(m.sender)}</span>
        <span class="time">${fmtDate(m.received_at)}</span>
      </div>
      <div class="subject">${esc(m.subject || "(no subject)")}</div>
    </div>
  `).join("");
}

function setSseStatus(state) {
  const el = $("#sseStatus");
  if (el) el.dataset.state = state;
}

function subscribeMail(addr) {
  if (totpMailStream) totpMailStream.close();
  setSseStatus("connecting");
  const es = new EventSource("/api/mail/stream?addr=" + encodeURIComponent(addr));
  totpMailStream = es;
  es.onopen = () => setSseStatus("online");
  es.onmessage = async () => {
    if (currentMailbox !== addr) return;
    const mails = await api("/api/mailboxes/" + encodeURIComponent(addr));
    currentMails = mails;
    renderMailList(mails);
    toast("New mail");
  };
  es.onerror = () => setSseStatus("offline");
}

async function openMailDetail(id, subject, sender) {
  openModal(`
    <h2>${esc(subject || "(no subject)")}</h2>
    <div style="color:var(--muted);font-size:13px;margin-bottom:12px">From: ${esc(sender)}</div>
    <div class="mail-detail"><pre id="mailRaw">Loading…</pre></div>
    <div class="actions">
      <button class="ghost" onclick="closeModal()">Close</button>
    </div>
  `);
  try {
    const r = await fetch("/api/mail/" + id);
    const raw = await r.text();
    $("#mailRaw").textContent = raw;
  } catch (err) {
    $("#mailRaw").textContent = "Error: " + err.message;
  }
}
window.closeModal = closeModal;

// ---------- Init ----------
if (!location.hash) location.hash = "#/totps";
render();
