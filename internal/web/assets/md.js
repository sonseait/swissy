// ==================== Markdown editor + preview + print ====================

const MD_STORAGE = "swissy.md.draft";

function renderMarkdown() {
  if (typeof totpMailStream !== "undefined" && totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);

  // Configure marked + highlight.js once
  if (window.marked && !marked._configured) {
    marked.use({
      gfm: true, breaks: false,
      renderer: {
        code(code, lang) {
          let highlighted = "";
          const codeStr = typeof code === "string" ? code : code.text;
          const language = typeof code === "object" ? code.lang : lang;
          try {
            if (language && window.hljs && hljs.getLanguage(language)) {
              highlighted = hljs.highlight(codeStr, { language }).value;
            } else if (window.hljs) {
              highlighted = hljs.highlightAuto(codeStr).value;
            } else {
              highlighted = codeStr.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
            }
          } catch { highlighted = codeStr; }
          return `<pre><code class="hljs language-${language || ""}">${highlighted}</code></pre>`;
        },
      },
    });
    marked._configured = true;
  }

  $("#sidebarContent").innerHTML = `
    <div class="sidebar-header">Markdown</div>
    <div style="padding:0 10px;display:flex;flex-direction:column;gap:6px">
      <button class="sidebar-btn" id="mdSample">Load sample</button>
      <button class="sidebar-btn" id="mdClear">Clear</button>
      <button class="sidebar-btn" id="mdPrint">Print / PDF</button>
    </div>
    <div class="sidebar-header">Options</div>
    <div style="padding:0 10px">
      <label class="opt-check" style="padding:4px 0">
        <input type="checkbox" id="mdWrap" checked /> Wrap code (no scroll)
      </label>
    </div>
  `;

  $("#main").classList.add("no-scroll");
  $("#main").innerHTML = `
    <div class="md-workspace">
      <div id="mdInput" class="code-editor" data-placeholder="# Hello"></div>
      <div id="mdPreview" class="md-preview"></div>
    </div>
  `;

  const input = $("#mdInput");
  const initial = localStorage.getItem(MD_STORAGE) || "";
  input.textContent = initial;
  const jar = attachCodeEditor(input, "markdown");
  const wrapCb = $("#mdWrap");
  wrapCb.checked = localStorage.getItem(MD_STORAGE + ".wrap") !== "0";
  applyWrap();

  const update = () => {
    const val = input.textContent;
    localStorage.setItem(MD_STORAGE, val);
    $("#mdPreview").innerHTML = window.marked ? marked.parse(val) : "";
  };
  let t = null;
  const onInput = () => { clearTimeout(t); t = setTimeout(update, 120); };
  if (jar) jar.onUpdate(onInput);
  else input.addEventListener("input", onInput);
  wrapCb.addEventListener("change", () => {
    localStorage.setItem(MD_STORAGE + ".wrap", wrapCb.checked ? "1" : "0");
    applyWrap();
  });

  const setVal = (v) => {
    if (jar) jar.updateCode(v);
    else input.textContent = v;
    update();
  };
  $("#mdSample").addEventListener("click", () => setVal(MD_SAMPLE));
  $("#mdClear").addEventListener("click", () => setVal(""));
  $("#mdPrint").addEventListener("click", printMarkdown);

  update();
}

function applyWrap() {
  const on = $("#mdWrap").checked;
  document.body.classList.toggle("md-wrap", on);
}

function printMarkdown() {
  const html = $("#mdPreview").innerHTML;
  const wrap = document.body.classList.contains("md-wrap");
  const win = window.open("", "_blank");
  if (!win) { toast("Popup blocked"); return; }
  win.document.write(`<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Print</title>
<link rel="stylesheet" href="/vendor/highlight.css" />
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff;
         max-width: 780px; margin: 30px auto; padding: 0 20px; line-height: 1.6; font-size: 14px; }
  h1,h2,h3,h4 { margin-top: 1.4em; }
  h1 { border-bottom: 1px solid #ddd; padding-bottom: .3em; }
  h2 { border-bottom: 1px solid #eee; padding-bottom: .2em; }
  pre { background: #0d1117; color: #e6edf3; padding: 12px 14px; border-radius: 6px; overflow-x: auto;
        ${wrap ? "white-space: pre-wrap; word-break: break-word;" : ""} }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12.5px; }
  :not(pre) > code { background: #f3f3f3; padding: 2px 6px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; }
  th { background: #f6f8fa; }
  blockquote { color: #555; border-left: 4px solid #ddd; padding-left: 12px; margin-left: 0; }
  img { max-width: 100%; }
  @media print {
    body { margin: 0; padding: 16mm; }
    pre { ${wrap ? "white-space: pre-wrap; word-break: break-word;" : ""} }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head><body>${html}
<script>window.onload = () => setTimeout(() => window.print(), 200);<\/script>
</body></html>`);
  win.document.close();
}

const MD_SAMPLE = `# Sample doc

Some **bold** and *italic* text.

## Lists

- one
- two
- three

## Code

\`\`\`go
package main

import "fmt"

func main() {
    fmt.Println("hello")
}
\`\`\`

## Table

| col1 | col2 |
| --- | --- |
| a | b |
| c | d |

> A blockquote.
`;
