// ==================== Logins ====================

let loginEntries = [];
let loginTimer = null;
const loginRevealed = new Set();

async function renderLogins() {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);
  clearInterval(loginTimer);

  $("#sidebarContent").innerHTML = "";
  $("#main").innerHTML = `
    <div id="loginGrid" class="grid"></div>
  `;

  $("#loginGrid").addEventListener("click", async e => {
    const card = e.target.closest(".login-card");
    if (!card) return;
    const pid = card.dataset.pid;
    if (e.target.closest(".del")) {
      e.stopPropagation();
      if (!confirm("Delete this login?")) return;
      try {
        await fetch("/api/logins/" + pid, { method: "DELETE" });
        loginEntries = loginEntries.filter(x => x.public_id !== pid);
        renderLoginGrid();
      } catch (err) { toast(err.message); }
      return;
    }
    const copyBtn = e.target.closest(".login-copy");
    if (copyBtn) {
      const text = copyBtn.dataset.value;
      const label = copyBtn.dataset.label;
      await copyLoginValue(text, label);
      return;
    }
    if (e.target.closest(".eye-btn")) {
      if (loginRevealed.has(pid)) loginRevealed.delete(pid);
      else loginRevealed.add(pid);
      const row = e.target.closest(".login-row");
      const pw = row.querySelector(".login-pw");
      pw.classList.toggle("visible", loginRevealed.has(pid));
      return;
    }
  });

  try {
    loginEntries = await api("/api/logins");
  } catch (err) {
    $("#loginGrid").innerHTML = `<div class="text-error">Load failed: ${esc(err.message)}</div>`;
    return;
  }
  await renderLoginGrid();
  loginTimer = setInterval(tickLoginOtps, 1000);
}

async function renderLoginGrid() {
  const grid = $("#loginGrid");
  if (!grid) { clearInterval(loginTimer); return; }
  if (!loginEntries.length) {
    grid.innerHTML = '<div class="mail-empty">No logins yet. Click + in the top bar to create one.</div>';
    return;
  }
  const now = Date.now();
  const cards = await Promise.all(loginEntries.map(e => buildLoginCard(e, now)));
  grid.innerHTML = cards.join("");
}

// In-place update of OTP rows only; avoids re-rendering grid every second.
async function tickLoginOtps() {
  const grid = $("#loginGrid");
  if (!grid) { clearInterval(loginTimer); return; }
  const now = Date.now();
  const remain = totpSecondsLeft(now);
  const pct = (remain / 30) * 100;
  const low = remain <= 5;
  for (const card of grid.querySelectorAll(".login-card")) {
    const pid = card.dataset.pid;
    const entry = loginEntries.find(x => x.public_id === pid);
    if (!entry || !entry.totp_secret) continue;
    let code = "------";
    try { code = await totp(entry.totp_secret, now); } catch {}
    const formatted = code.slice(0, 3) + " " + code.slice(3);
    const otpEl = card.querySelector(".login-otp");
    if (otpEl && otpEl.textContent !== formatted) otpEl.textContent = formatted;
    const remainEl = card.querySelector(".login-otp-remain");
    if (remainEl) remainEl.textContent = remain + "s";
    const copyBtn = card.querySelector('.login-copy[data-label="OTP"]');
    if (copyBtn) copyBtn.dataset.value = code;
    const bar = card.querySelector(".progress .bar");
    if (bar) {
      bar.style.width = pct + "%";
      bar.classList.toggle("low", low);
    }
  }
}

async function buildLoginCard(e, now) {
  const type = e.type ? `<span class="login-type-badge">${esc(e.type)}</span>` : "";
  const userRow = `
    <div class="login-row">
      <span class="login-k">user</span>
      <span class="login-v mono" title="${esc(e.username)}">${esc(e.username)}</span>
      <button class="login-copy" data-value="${esc(e.username)}" data-label="username" title="Copy username">📋</button>
    </div>`;
  const revealed = loginRevealed.has(e.public_id);
  const pwRow = e.password ? `
    <div class="login-row">
      <span class="login-k">pass</span>
      <span class="login-v mono login-pw${revealed ? " visible" : ""}" data-pw="${esc(e.password)}">${esc(e.password)}</span>
      <button class="eye-btn" title="Show/hide">👁</button>
      <button class="login-copy" data-value="${esc(e.password)}" data-label="password" title="Copy password">📋</button>
    </div>` : "";

  let otpRow = "";
  if (e.totp_secret) {
    let code = "------";
    try { code = await totp(e.totp_secret, now); } catch {}
    const remain = totpSecondsLeft(now);
    const pct = (remain / 30) * 100;
    const low = remain <= 5 ? " low" : "";
    const formatted = code.slice(0, 3) + " " + code.slice(3);
    otpRow = `
      <div class="login-row">
        <span class="login-k">otp</span>
        <span class="login-v mono login-otp">${esc(formatted)}</span>
        <span class="login-otp-remain">${remain}s</span>
        <button class="login-copy" data-value="${esc(code)}" data-label="OTP" title="Copy OTP">📋</button>
      </div>
      <div class="progress"><div class="bar${low}" style="width:${pct}%"></div></div>`;
  }

  return `
    <div class="card login-card" data-pid="${esc(e.public_id)}">
      <button class="del" title="Delete">×</button>
      <div class="login-head">${type}</div>
      ${userRow}
      ${pwRow}
      ${otpRow}
    </div>`;
}

async function copyLoginValue(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied " + label);
  } catch { toast("Copy failed"); return; }
}

function typeSuggestions() {
  const seen = new Map();
  for (const e of loginEntries) {
    const t = (e.type || "").trim();
    if (!t) continue;
    const prev = seen.get(t);
    const at = Date.parse(e.updated_at) || 0;
    if (!prev || at > prev) seen.set(t, at);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

function openAddLoginModal() {
  const suggestions = typeSuggestions();
  const sugHtml = suggestions.length
    ? `<div class="type-suggest">${suggestions.map(t => `<button type="button" class="chip type-chip" data-type="${esc(t)}">${esc(t)}</button>`).join("")}</div>`
    : "";
  openModal(`
    <h2>Add login</h2>
    <div class="field">
      <label>Type</label>
      <input id="lType" placeholder="chatgpt, gmail, github…" autocomplete="off" />
      ${sugHtml}
    </div>
    <div class="field">
      <label>Username <span style="color:var(--danger)">*</span></label>
      <div class="pw-row">
        <input id="lUser" placeholder="me@example.com" autocomplete="off" required />
        <button type="button" class="ghost" id="lRandUser" title="Random mailbox">🎲</button>
      </div>
    </div>
    <div class="field">
      <label>Password</label>
      <div class="pw-row">
        <input id="lPass" type="text" placeholder="(optional)" autocomplete="off" />
        <button type="button" class="ghost" id="lGen">Generate</button>
      </div>
    </div>
    <div class="field">
      <label>TOTP secret or otpauth:// URI</label>
      <input id="lTotp" placeholder="(optional)" autocomplete="off" />
    </div>
    <div class="actions">
      <button class="ghost" id="lCancel">Cancel</button>
      <button class="primary" id="lSave">Save</button>
    </div>
  `);
  $("#lCancel").onclick = closeModal;
  $("#lGen").onclick = () => { $("#lPass").value = generatePassword(20); };
  if (suggestions.length) {
    $$(".type-chip").forEach(b => b.addEventListener("click", () => {
      $("#lType").value = b.dataset.type;
      $("#lType").focus();
    }));
  }
  $("#lRandUser").onclick = async () => {
    try {
      const domains = await api("/api/domains");
      if (!domains.length) { toast("No domains registered"); return; }
      const local = randomLocal();
      const d = domains[Math.floor(Math.random() * domains.length)].name;
      const res = await api("/api/mailboxes", {
        method: "POST",
        body: JSON.stringify({ local, domain: d }),
      });
      const addr = (res && res.addr) || (local + "@" + d);
      $("#lUser").value = addr;
      toast("Mailbox created: " + addr);
    } catch (err) { toast(err.message); }
  };
  $("#lSave").onclick = async () => {
    const body = {
      type: $("#lType").value.trim(),
      username: $("#lUser").value.trim(),
      password: $("#lPass").value,
      totp_secret: $("#lTotp").value.trim(),
    };
    if (!body.username) { toast("Username required"); return; }
    try {
      loginEntries = await api("/api/logins", { method: "POST", body: JSON.stringify(body) });
      closeModal();
      renderLoginGrid();
      toast("Login added");
    } catch (err) { toast(err.message); }
  };
  setTimeout(() => $("#lType").focus(), 30);
}

function generatePassword(len = 20) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}:,.?/";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join("");
}
