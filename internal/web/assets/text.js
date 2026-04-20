// ==================== Text utils ====================
// Pure client-side. Each tool = {id, name, group, options?, run(input, opts) => string, sync?}
// sync=false means async (e.g. hash via WebCrypto) — UI shows Run button.

const TEXT_TOOLS = [];

// ---------- Helpers ----------
function splitLines(s) { return s.split(/\r?\n/); }
function joinLines(arr) { return arr.join("\n"); }

// ---------- Case ----------
const CASE_MODES = [
  ["upper", "UPPERCASE"], ["lower", "lowercase"], ["title", "Title Case"],
  ["camel", "camelCase"], ["pascal", "PascalCase"],
  ["snake", "snake_case"], ["kebab", "kebab-case"], ["const", "CONSTANT_CASE"],
];
function toCase(s, mode) {
  if (mode === "upper") return s.toUpperCase();
  if (mode === "lower") return s.toLowerCase();
  if (mode === "title") return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  // split on non-alphanum OR case boundaries
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
  if (!words.length) return "";
  if (mode === "camel") return words[0] + words.slice(1).map(cap).join("");
  if (mode === "pascal") return words.map(cap).join("");
  if (mode === "snake") return words.join("_");
  if (mode === "kebab") return words.join("-");
  if (mode === "const") return words.join("_").toUpperCase();
  return s;
}
function cap(w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }

TEXT_TOOLS.push({
  id: "case", name: "Case converter", group: "Transform",
  options: [{ key: "mode", type: "select", label: "Mode", default: "upper", values: CASE_MODES }],
  sync: true,
  run: (s, o) => toCase(s, o.mode),
});

// ---------- Base64 ----------
function b64EncodeUtf8(s) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64DecodeUtf8(s) {
  const bin = atob(s.trim());
  const arr = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(arr);
}
TEXT_TOOLS.push({
  id: "base64", name: "Base64", group: "Encode",
  options: [{ key: "mode", type: "select", label: "Mode", default: "encode",
    values: [["encode", "Encode"], ["decode", "Decode"]] }],
  sync: true,
  run: (s, o) => o.mode === "encode" ? b64EncodeUtf8(s) : b64DecodeUtf8(s),
});

// ---------- URL ----------
TEXT_TOOLS.push({
  id: "url", name: "URL encode/decode", group: "Encode",
  options: [
    { key: "mode", type: "select", label: "Mode", default: "encode",
      values: [["encode", "Encode"], ["decode", "Decode"]] },
    { key: "full", type: "select", label: "Scope", default: "component",
      values: [["component", "Component"], ["full", "Full URI"]] },
  ],
  sync: true,
  run: (s, o) => {
    const fn = o.mode === "encode"
      ? (o.full === "full" ? encodeURI : encodeURIComponent)
      : (o.full === "full" ? decodeURI : decodeURIComponent);
    return fn(s);
  },
});

// ---------- JSON ----------
TEXT_TOOLS.push({
  id: "json", name: "JSON format", group: "Encode",
  options: [
    { key: "mode", type: "select", label: "Mode", default: "pretty",
      values: [["pretty", "Pretty"], ["minify", "Minify"], ["sort", "Sort keys + pretty"]] },
    { key: "indent", type: "select", label: "Indent", default: "2",
      values: [["2", "2 spaces"], ["4", "4 spaces"], ["\t", "Tab"]] },
  ],
  sync: true,
  run: (s, o) => {
    if (!s.trim()) return "";
    const v = JSON.parse(s);
    const ind = o.indent === "\t" ? "\t" : parseInt(o.indent, 10);
    if (o.mode === "minify") return JSON.stringify(v);
    const val = o.mode === "sort" ? sortKeys(v) : v;
    return JSON.stringify(val, null, ind);
  },
});
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v).sort().reduce((a, k) => (a[k] = sortKeys(v[k]), a), {});
  }
  return v;
}

// ---------- Hash ----------
async function hashStr(s, algo) {
  if (algo === "MD5") return md5(s);
  const buf = new TextEncoder().encode(s);
  const sig = await crypto.subtle.digest(algo, buf);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
TEXT_TOOLS.push({
  id: "hash", name: "Hash", group: "Encode",
  options: [{ key: "algo", type: "select", label: "Algorithm", default: "SHA-256",
    values: [["MD5", "MD5"], ["SHA-1", "SHA-1"], ["SHA-256", "SHA-256"], ["SHA-512", "SHA-512"]] }],
  sync: false,
  run: async (s, o) => hashStr(s, o.algo),
});

// Minimal MD5 (RFC 1321) — used only when user picks MD5.
function md5(str) {
  function rhex(n){let s="",j;for(j=0;j<=3;j++)s+=((n>>(j*8+4))&0x0F).toString(16)+((n>>(j*8))&0x0F).toString(16);return s;}
  function add(x,y){const l=(x&0xFFFF)+(y&0xFFFF);return(((x>>16)+(y>>16)+(l>>16))<<16)|(l&0xFFFF);}
  function rol(n,c){return(n<<c)|(n>>>(32-c));}
  function cmn(q,a,b,x,s,t){return add(rol(add(add(a,q),add(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,s,t);}
  // UTF-8
  const bytes = new TextEncoder().encode(str);
  const nbits = bytes.length*8;
  const nwords = (((nbits+64)>>>9)<<4)+16;
  const x = new Array(nwords).fill(0);
  for (let i=0;i<bytes.length;i++) x[i>>2] |= bytes[i] << ((i%4)*8);
  x[nbits>>5] |= 0x80 << ((nbits)%32);
  x[nwords-2] = nbits;
  let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
  for (let i=0;i<x.length;i+=16){
    const oa=a,ob=b,oc=c,od=d;
    a=ff(a,b,c,d,x[i+0],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
    a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
    a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
    a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
    a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i+0],20,-373897302);
    a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
    a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
    a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
    a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
    a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
    a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i+0],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
    a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
    a=ii(a,b,c,d,x[i+0],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
    a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
    a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
    a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
    a=add(a,oa);b=add(b,ob);c=add(c,oc);d=add(d,od);
  }
  return rhex(a)+rhex(b)+rhex(c)+rhex(d);
}

// ---------- Line tools ----------
TEXT_TOOLS.push({
  id: "sort", name: "Sort lines", group: "Lines",
  options: [
    { key: "dir", type: "select", label: "Direction", default: "asc",
      values: [["asc", "Ascending"], ["desc", "Descending"]] },
    { key: "ci", type: "check", label: "Case insensitive", default: false },
    { key: "nat", type: "check", label: "Natural (numeric-aware)", default: false },
  ],
  sync: true,
  run: (s, o) => {
    const lines = splitLines(s);
    const coll = new Intl.Collator(undefined, {
      sensitivity: o.ci ? "base" : "variant",
      numeric: o.nat,
    });
    lines.sort(coll.compare);
    if (o.dir === "desc") lines.reverse();
    return joinLines(lines);
  },
});

TEXT_TOOLS.push({
  id: "dedupe", name: "Dedupe lines", group: "Lines",
  options: [{ key: "ci", type: "check", label: "Case insensitive", default: false }],
  sync: true,
  run: (s, o) => {
    const seen = new Set(), out = [];
    for (const l of splitLines(s)) {
      const k = o.ci ? l.toLowerCase() : l;
      if (!seen.has(k)) { seen.add(k); out.push(l); }
    }
    return joinLines(out);
  },
});

TEXT_TOOLS.push({
  id: "reverse", name: "Reverse lines", group: "Lines", sync: true,
  run: s => joinLines(splitLines(s).reverse()),
});

TEXT_TOOLS.push({
  id: "shuffle", name: "Shuffle lines", group: "Lines", sync: true,
  run: s => {
    const a = splitLines(s);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return joinLines(a);
  },
});

TEXT_TOOLS.push({
  id: "trim", name: "Trim lines", group: "Lines",
  options: [{ key: "side", type: "select", label: "Side", default: "both",
    values: [["both", "Both"], ["left", "Leading"], ["right", "Trailing"]] }],
  sync: true,
  run: (s, o) => joinLines(splitLines(s).map(l =>
    o.side === "left" ? l.replace(/^\s+/, "")
    : o.side === "right" ? l.replace(/\s+$/, "")
    : l.trim())),
});

TEXT_TOOLS.push({
  id: "rmempty", name: "Remove empty lines", group: "Lines",
  options: [{ key: "ws", type: "check", label: "Treat whitespace-only as empty", default: true }],
  sync: true,
  run: (s, o) => joinLines(splitLines(s).filter(l => o.ws ? l.trim() !== "" : l !== "")),
});

TEXT_TOOLS.push({
  id: "count", name: "Count", group: "Lines", sync: true,
  run: s => {
    const bytes = new TextEncoder().encode(s).length;
    const chars = [...s].length;
    const words = (s.match(/\S+/g) || []).length;
    const lines = s === "" ? 0 : splitLines(s).length;
    return `Characters: ${chars}\nBytes (UTF-8): ${bytes}\nWords: ${words}\nLines: ${lines}`;
  },
});

TEXT_TOOLS.push({
  id: "split", name: "Split into lines", group: "Lines",
  options: [
    { key: "sep", type: "select", label: "Separator", default: "space",
      values: [["space", "Whitespace"], ["comma", "Comma"], ["tab", "Tab"], ["custom", "Custom"]] },
    { key: "custom", type: "text", label: "Custom separator", default: "," },
    { key: "keepEmpty", type: "check", label: "Keep empty tokens", default: false },
  ],
  sync: true,
  run: (s, o) => {
    let re;
    if (o.sep === "space") re = /\s+/;
    else if (o.sep === "comma") re = /,/;
    else if (o.sep === "tab") re = /\t/;
    else re = o.custom || ",";
    const parts = s.split(re);
    return joinLines(o.keepEmpty ? parts : parts.filter(x => x !== ""));
  },
});

TEXT_TOOLS.push({
  id: "join", name: "Join lines", group: "Lines",
  options: [
    { key: "sep", type: "select", label: "Separator", default: "space",
      values: [["space", "Space"], ["comma", ","], ["commaSpace", ", "], ["tab", "Tab"],
        ["none", "(none)"], ["custom", "Custom"]] },
    { key: "custom", type: "text", label: "Custom separator", default: ", " },
    { key: "skipEmpty", type: "check", label: "Skip empty lines", default: true },
  ],
  sync: true,
  run: (s, o) => {
    const map = { space: " ", comma: ",", commaSpace: ", ", tab: "\t", none: "" };
    const sep = o.sep === "custom" ? (o.custom ?? "") : map[o.sep];
    let lines = splitLines(s);
    if (o.skipEmpty) lines = lines.filter(l => l.trim() !== "");
    return lines.join(sep);
  },
});

TEXT_TOOLS.push({
  id: "prefix", name: "Prefix/Suffix each line", group: "Lines",
  options: [
    { key: "prefix", type: "text", label: "Prefix", default: "" },
    { key: "suffix", type: "text", label: "Suffix", default: "" },
    { key: "skipEmpty", type: "check", label: "Skip empty lines", default: true },
  ],
  sync: true,
  run: (s, o) => joinLines(splitLines(s).map(l =>
    (o.skipEmpty && l.trim() === "") ? l : (o.prefix || "") + l + (o.suffix || ""))),
});

TEXT_TOOLS.push({
  id: "wrap", name: "Wrap each line", group: "Lines",
  options: [
    { key: "left", type: "text", label: "Left", default: "'" },
    { key: "right", type: "text", label: "Right", default: "'" },
    { key: "join", type: "text", label: "Join with (optional)", default: ", " },
    { key: "skipEmpty", type: "check", label: "Skip empty lines", default: true },
  ],
  sync: true,
  run: (s, o) => {
    let lines = splitLines(s);
    if (o.skipEmpty) lines = lines.filter(l => l.trim() !== "");
    const wrapped = lines.map(l => (o.left || "") + l + (o.right || ""));
    return o.join ? wrapped.join(o.join) : joinLines(wrapped);
  },
});

TEXT_TOOLS.push({
  id: "number", name: "Number lines", group: "Lines",
  options: [
    { key: "start", type: "text", label: "Start at", default: "1" },
    { key: "sep", type: "text", label: "Separator", default: ". " },
    { key: "pad", type: "check", label: "Zero-pad to width", default: false },
  ],
  sync: true,
  run: (s, o) => {
    const lines = splitLines(s);
    const start = parseInt(o.start, 10) || 1;
    const width = String(start + lines.length - 1).length;
    return joinLines(lines.map((l, i) => {
      const n = String(start + i);
      return (o.pad ? n.padStart(width, "0") : n) + (o.sep ?? "") + l;
    }));
  },
});

TEXT_TOOLS.push({
  id: "filter", name: "Filter lines", group: "Lines",
  options: [
    { key: "mode", type: "select", label: "Keep", default: "contains",
      values: [["contains", "Contains"], ["notContains", "Not contains"],
        ["starts", "Starts with"], ["ends", "Ends with"]] },
    { key: "needle", type: "text", label: "Substring", default: "" },
    { key: "ci", type: "check", label: "Case insensitive", default: false },
  ],
  sync: true,
  run: (s, o) => {
    const needle = o.ci ? (o.needle || "").toLowerCase() : (o.needle || "");
    if (!needle) return s;
    return joinLines(splitLines(s).filter(l => {
      const x = o.ci ? l.toLowerCase() : l;
      if (o.mode === "contains") return x.includes(needle);
      if (o.mode === "notContains") return !x.includes(needle);
      if (o.mode === "starts") return x.startsWith(needle);
      if (o.mode === "ends") return x.endsWith(needle);
      return true;
    }));
  },
});

TEXT_TOOLS.push({
  id: "indent", name: "Indent / Dedent", group: "Lines",
  options: [
    { key: "mode", type: "select", label: "Mode", default: "indent",
      values: [["indent", "Indent"], ["dedent", "Dedent"]] },
    { key: "n", type: "text", label: "Spaces", default: "2" },
  ],
  sync: true,
  run: (s, o) => {
    const n = Math.max(0, parseInt(o.n, 10) || 0);
    if (o.mode === "indent") {
      const pad = " ".repeat(n);
      return joinLines(splitLines(s).map(l => l === "" ? l : pad + l));
    }
    const re = new RegExp(`^ {0,${n}}`);
    return joinLines(splitLines(s).map(l => l.replace(re, "")));
  },
});

// ==================== Convert ====================

// --- JSON ↔ YAML ↔ TOML ---
function parseAny(s) {
  s = s.trim();
  if (!s) return {};
  // try JSON first
  try { return JSON.parse(s); } catch (_) {}
  // YAML
  try { return jsyaml.load(s); } catch (_) {}
  // TOML
  return tomlParse(s);
}

TEXT_TOOLS.push({
  id: "j2y", name: "JSON → YAML", group: "Convert", sync: true,
  run: s => s.trim() ? jsyaml.dump(JSON.parse(s), { indent: 2, lineWidth: 120 }) : "",
});
TEXT_TOOLS.push({
  id: "y2j", name: "YAML → JSON", group: "Convert",
  options: [{ key: "indent", type: "select", label: "Indent", default: "2",
    values: [["2","2"],["4","4"],["0","Minify"]] }],
  sync: true,
  run: (s, o) => {
    if (!s.trim()) return "";
    const v = jsyaml.load(s);
    const i = parseInt(o.indent, 10);
    return i === 0 ? JSON.stringify(v) : JSON.stringify(v, null, i);
  },
});
TEXT_TOOLS.push({
  id: "j2t", name: "JSON → TOML", group: "Convert", sync: true,
  run: s => s.trim() ? tomlStringify(JSON.parse(s)) : "",
});
TEXT_TOOLS.push({
  id: "t2j", name: "TOML → JSON", group: "Convert",
  options: [{ key: "indent", type: "select", label: "Indent", default: "2",
    values: [["2","2"],["4","4"],["0","Minify"]] }],
  sync: true,
  run: (s, o) => {
    if (!s.trim()) return "";
    const v = tomlParse(s);
    const i = parseInt(o.indent, 10);
    return i === 0 ? JSON.stringify(v) : JSON.stringify(v, null, i);
  },
});

// Minimal TOML (subset: key=value, strings, numbers, bools, arrays, tables [a.b])
function tomlParse(s) {
  const root = {};
  let ctx = root;
  for (let rawLine of s.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^\[([^\]]+)\]$/);
    if (m) {
      ctx = root;
      for (const k of m[1].split(".")) ctx = (ctx[k] ||= {});
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    ctx[k] = tomlValue(v);
  }
  return root;
}
function tomlValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (/^".*"$/.test(v)) return JSON.parse(v);
  if (/^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^\[.*\]$/.test(v)) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}
function tomlStringify(obj, prefix = "") {
  const scalars = [], sections = [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      sections.push([k, v]);
    } else {
      scalars.push([k, v]);
    }
  }
  let out = "";
  if (prefix && scalars.length) out += `[${prefix}]\n`;
  for (const [k, v] of scalars) out += `${k} = ${tomlScalar(v)}\n`;
  for (const [k, v] of sections) {
    out += (out ? "\n" : "") + tomlStringify(v, prefix ? prefix + "." + k : k);
  }
  if (!prefix && !out.trim()) out = "";
  return out;
}
function tomlScalar(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  return JSON.stringify(v);
}

// --- JSON → Go struct ---
TEXT_TOOLS.push({
  id: "j2go", name: "JSON → Go struct", group: "Convert",
  options: [{ key: "name", type: "text", label: "Root name", default: "Root" }],
  sync: true,
  run: (s, o) => s.trim() ? jsonToGo(JSON.parse(s), o.name || "Root") : "",
});

function goName(k) {
  if (!k) return "Field";
  const parts = k.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const p = parts.map(w => w[0].toUpperCase() + w.slice(1)).join("") || "Field";
  return /^[A-Za-z]/.test(p) ? p : "F" + p;
}
function goType(v) {
  if (v === null || v === undefined) return "interface{}";
  if (Array.isArray(v)) return "[]" + (v.length ? goType(v[0]) : "interface{}");
  if (typeof v === "object") return "{}";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float64";
  return "interface{}";
}
function jsonToGo(v, rootName) {
  const structs = [];
  function emit(obj, name) {
    const fields = [];
    for (const k of Object.keys(obj)) {
      const vv = obj[k];
      let typ;
      if (vv && typeof vv === "object" && !Array.isArray(vv)) {
        typ = goName(k);
        emit(vv, typ);
      } else if (Array.isArray(vv) && vv[0] && typeof vv[0] === "object" && !Array.isArray(vv[0])) {
        const inner = goName(k).replace(/s$/, "") || goName(k) + "Item";
        typ = "[]" + inner;
        emit(vv[0], inner);
      } else {
        typ = goType(vv);
      }
      fields.push(`\t${goName(k)} ${typ} \`json:"${k}"\``);
    }
    structs.push(`type ${name} struct {\n${fields.join("\n")}\n}`);
  }
  if (Array.isArray(v)) {
    if (v[0] && typeof v[0] === "object") { emit(v[0], rootName); return structs.reverse().join("\n\n"); }
    return `type ${rootName} ${goType(v)}`;
  }
  if (v && typeof v === "object") { emit(v, rootName); return structs.reverse().join("\n\n"); }
  return `type ${rootName} ${goType(v)}`;
}

// --- JSON → TypeScript interface ---
TEXT_TOOLS.push({
  id: "j2ts", name: "JSON → TypeScript", group: "Convert",
  options: [{ key: "name", type: "text", label: "Root name", default: "Root" }],
  sync: true,
  run: (s, o) => s.trim() ? jsonToTS(JSON.parse(s), o.name || "Root") : "",
});
function tsType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return (v.length ? tsType(v[0]) : "unknown") + "[]";
  if (typeof v === "object") return "object";
  return typeof v === "number" ? "number" : typeof v;
}
function jsonToTS(v, rootName) {
  const out = [];
  function emit(obj, name) {
    const fields = [];
    for (const k of Object.keys(obj)) {
      const vv = obj[k];
      let typ;
      if (vv && typeof vv === "object" && !Array.isArray(vv)) {
        typ = goName(k);
        emit(vv, typ);
      } else if (Array.isArray(vv) && vv[0] && typeof vv[0] === "object" && !Array.isArray(vv[0])) {
        const inner = goName(k).replace(/s$/, "") || goName(k) + "Item";
        typ = inner + "[]";
        emit(vv[0], inner);
      } else {
        typ = tsType(vv);
      }
      const safe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k);
      fields.push(`  ${safe}: ${typ};`);
    }
    out.push(`interface ${name} {\n${fields.join("\n")}\n}`);
  }
  if (v && typeof v === "object" && !Array.isArray(v)) emit(v, rootName);
  else return `type ${rootName} = ${tsType(v)};`;
  return out.reverse().join("\n\n");
}

// --- CSV ↔ JSON ---
function csvParse(text) {
  const rows = [];
  let i = 0, field = "", row = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      row.push(field); rows.push(row); row = []; field = "";
      if (c === "\r" && text[i+1] === "\n") i++;
      i++; continue;
    }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
}
function csvStringify(rows) {
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(",")).join("\n");
}

TEXT_TOOLS.push({
  id: "c2j", name: "CSV → JSON", group: "Convert",
  options: [{ key: "header", type: "check", label: "First row is header", default: true }],
  sync: true,
  run: (s, o) => {
    if (!s.trim()) return "";
    const rows = csvParse(s);
    if (!rows.length) return "[]";
    if (o.header) {
      const h = rows[0];
      return JSON.stringify(rows.slice(1).map(r =>
        Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]))), null, 2);
    }
    return JSON.stringify(rows, null, 2);
  },
});
TEXT_TOOLS.push({
  id: "j2c", name: "JSON → CSV", group: "Convert", sync: true,
  run: s => {
    if (!s.trim()) return "";
    const v = JSON.parse(s);
    if (!Array.isArray(v)) throw new Error("input must be JSON array");
    if (!v.length) return "";
    if (typeof v[0] === "object" && !Array.isArray(v[0])) {
      const keys = [...new Set(v.flatMap(r => Object.keys(r)))];
      return csvStringify([keys, ...v.map(r => keys.map(k => r[k] ?? ""))]);
    }
    return csvStringify(v);
  },
});

TEXT_TOOLS.push({
  id: "c2md", name: "CSV → Markdown table", group: "Convert", sync: true,
  run: s => {
    if (!s.trim()) return "";
    const rows = csvParse(s);
    if (!rows.length) return "";
    const cols = rows[0].length;
    const esc = x => String(x ?? "").replace(/\|/g, "\\|");
    const out = [];
    out.push("| " + rows[0].map(esc).join(" | ") + " |");
    out.push("| " + Array(cols).fill("---").join(" | ") + " |");
    for (const r of rows.slice(1)) {
      const padded = [...r]; while (padded.length < cols) padded.push("");
      out.push("| " + padded.map(esc).join(" | ") + " |");
    }
    return out.join("\n");
  },
});

// --- XML ↔ JSON ---
function xmlParse(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const errNode = doc.querySelector("parsererror");
  if (errNode) throw new Error("Invalid XML");
  function walk(node) {
    const obj = {};
    for (const attr of node.attributes || []) obj["@" + attr.name] = attr.value;
    const elems = [...node.children];
    if (!elems.length) {
      const text = node.textContent.trim();
      if (!Object.keys(obj).length) return text;
      if (text) obj["#text"] = text;
      return obj;
    }
    for (const el of elems) {
      const v = walk(el);
      if (obj[el.tagName] !== undefined) {
        if (!Array.isArray(obj[el.tagName])) obj[el.tagName] = [obj[el.tagName]];
        obj[el.tagName].push(v);
      } else obj[el.tagName] = v;
    }
    return obj;
  }
  return { [doc.documentElement.tagName]: walk(doc.documentElement) };
}
function jsonToXml(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  const lines = [];
  function escXml(s) { return String(s).replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c])); }
  function emit(tag, val, ind) {
    const p = "  ".repeat(ind);
    if (val === null || val === undefined) { lines.push(`${p}<${tag}/>`); return; }
    if (Array.isArray(val)) { val.forEach(v => emit(tag, v, ind)); return; }
    if (typeof val === "object") {
      const attrs = [], children = [];
      for (const k of Object.keys(val)) {
        if (k.startsWith("@")) attrs.push(`${k.slice(1)}="${escXml(val[k])}"`);
        else if (k === "#text") children.push({ text: val[k] });
        else children.push({ tag: k, val: val[k] });
      }
      const at = attrs.length ? " " + attrs.join(" ") : "";
      if (!children.length) { lines.push(`${p}<${tag}${at}/>`); return; }
      if (children.length === 1 && children[0].text !== undefined) {
        lines.push(`${p}<${tag}${at}>${escXml(children[0].text)}</${tag}>`); return;
      }
      lines.push(`${p}<${tag}${at}>`);
      for (const c of children) {
        if (c.text !== undefined) lines.push("  ".repeat(ind+1) + escXml(c.text));
        else emit(c.tag, c.val, ind + 1);
      }
      lines.push(`${p}</${tag}>`);
      return;
    }
    lines.push(`${p}<${tag}>${escXml(val)}</${tag}>`);
  }
  const root = Object.keys(obj)[0];
  emit(root, obj[root], indent);
  return lines.join("\n");
}

TEXT_TOOLS.push({
  id: "x2j", name: "XML → JSON", group: "Convert", sync: true,
  run: s => s.trim() ? JSON.stringify(xmlParse(s), null, 2) : "",
});
TEXT_TOOLS.push({
  id: "j2x", name: "JSON → XML", group: "Convert", sync: true,
  run: s => s.trim() ? `<?xml version="1.0" encoding="UTF-8"?>\n` + jsonToXml(JSON.parse(s)) : "",
});

// --- SQL formatter ---
TEXT_TOOLS.push({
  id: "sqlfmt", name: "SQL formatter", group: "Convert",
  options: [
    { key: "dialect", type: "select", label: "Dialect", default: "sql",
      values: [["sql","Standard"],["postgresql","PostgreSQL"],["mysql","MySQL"],["sqlite","SQLite"],["bigquery","BigQuery"]] },
    { key: "tabWidth", type: "select", label: "Tab width", default: "2",
      values: [["2","2"],["4","4"]] },
  ],
  sync: true,
  run: (s, o) => s.trim() ? sqlFormatter.format(s, {
    language: o.dialect, tabWidth: parseInt(o.tabWidth, 10), keywordCase: "upper",
  }) : "",
});

// --- HTML ↔ JSX ---
const HTML_TO_JSX_ATTRS = {
  class: "className", for: "htmlFor", tabindex: "tabIndex", readonly: "readOnly",
  maxlength: "maxLength", minlength: "minLength", autocomplete: "autoComplete",
  autofocus: "autoFocus", contenteditable: "contentEditable", spellcheck: "spellCheck",
  colspan: "colSpan", rowspan: "rowSpan", usemap: "useMap",
  "accept-charset": "acceptCharset", "http-equiv": "httpEquiv",
};
function htmlToJsx(s) {
  // attr rename
  s = s.replace(/\s([a-zA-Z-]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g, (m, name, val) => {
    const key = name.toLowerCase();
    const mapped = HTML_TO_JSX_ATTRS[key] || (key.startsWith("data-") || key.startsWith("aria-") ? key : camel(key));
    return " " + mapped + (val || "");
  });
  // self-close void elements
  const VOID = ["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"];
  for (const tag of VOID) {
    const re = new RegExp(`<${tag}([^>/]*)(?<!/)>`, "gi");
    s = s.replace(re, `<${tag}$1 />`);
  }
  // inline style="a: b; c: d" → style={{ a: "b", c: "d" }} (basic)
  s = s.replace(/style\s*=\s*"([^"]*)"/g, (_, css) => {
    const pairs = css.split(";").map(p => p.trim()).filter(Boolean).map(p => {
      const [k, ...rest] = p.split(":");
      const val = rest.join(":").trim();
      return `${camel(k.trim())}: ${JSON.stringify(val)}`;
    });
    return `style={{ ${pairs.join(", ")} }}`;
  });
  return s;
}
function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

function jsxToHtml(s) {
  const inv = Object.fromEntries(Object.entries(HTML_TO_JSX_ATTRS).map(([h, j]) => [j, h]));
  // style={{...}} → style="..."
  s = s.replace(/style=\{\{([^}]*)\}\}/g, (_, body) => {
    const parts = body.split(",").map(p => p.trim()).filter(Boolean).map(p => {
      const m = p.match(/^(\w+)\s*:\s*(.+)$/); if (!m) return "";
      const key = m[1].replace(/([A-Z])/g, "-$1").toLowerCase();
      let val = m[2].trim(); if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      return `${key}: ${val}`;
    }).filter(Boolean);
    return `style="${parts.join("; ")}"`;
  });
  // attribute rename
  s = s.replace(/\s([a-zA-Z]+)(\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}))?/g, (m, name, val) => {
    const key = inv[name] || name.replace(/([A-Z])/g, "-$1").toLowerCase();
    return " " + key + (val || "");
  });
  return s;
}

TEXT_TOOLS.push({
  id: "h2jsx", name: "HTML → JSX", group: "Convert", sync: true,
  run: s => htmlToJsx(s),
});
TEXT_TOOLS.push({
  id: "jsx2h", name: "JSX → HTML", group: "Convert", sync: true,
  run: s => jsxToHtml(s),
});

// ==================== UI ====================

let currentTextTool = null;
let textDebounce = null;

function renderText(toolId) {
  if (totpMailStream) { totpMailStream.close(); totpMailStream = null; }
  clearInterval(totpTimer);

  const tool = TEXT_TOOLS.find(t => t.id === toolId) || TEXT_TOOLS[0];
  currentTextTool = tool;

  // Sidebar grouped
  const groups = {};
  for (const t of TEXT_TOOLS) (groups[t.group] ||= []).push(t);
  $("#sidebarContent").innerHTML = Object.entries(groups).map(([g, items]) => `
    <div class="sidebar-header">${esc(g)}</div>
    <div>
      ${items.map(t => `
        <a class="mb-item ${t.id===tool.id?'active':''}" href="#/text/${t.id}">
          <span class="addr">${esc(t.name)}</span>
        </a>
      `).join("")}
    </div>
  `).join("");

  // Main
  const opts = tool.options || [];
  $("#main").innerHTML = `
    <div class="text-header">
      <h1 style="margin:0">${esc(tool.name)}</h1>
      <div class="text-actions">
        ${tool.sync === false ? '<button class="primary" id="txtRun">Run</button>' : ""}
        <button class="ghost" id="txtSwap" title="Move output → input">↑ Swap</button>
        <button class="ghost" id="txtCopy">Copy output</button>
        <button class="ghost" id="txtClear">Clear</button>
      </div>
    </div>
    ${opts.length ? `<div class="text-options">${opts.map(renderOpt).join("")}</div>` : ""}
    <div class="text-panes">
      <textarea id="txtIn" class="text-area" placeholder="Input…" spellcheck="false"></textarea>
      <textarea id="txtOut" class="text-area" placeholder="Output…" spellcheck="false" readonly></textarea>
    </div>
    <div class="text-error" id="txtErr" hidden></div>
  `;

  // Bind option controls (custom dropdown for select)
  for (const o of opts) {
    if (o.type === "select") {
      const root = document.getElementById("opt_" + o.key);
      bindDropdown(root, () => true);
    }
  }

  const runNow = () => runText();
  $("#txtIn").addEventListener("input", () => {
    if (tool.sync === false) return;
    clearTimeout(textDebounce);
    textDebounce = setTimeout(runNow, 200);
  });
  $$(".text-options input, .text-options .dd").forEach(el => {
    el.addEventListener(el.tagName === "INPUT" ? "input" : "click", () => {
      if (tool.sync === false) return;
      clearTimeout(textDebounce);
      textDebounce = setTimeout(runNow, 100);
    });
  });
  $("#txtRun")?.addEventListener("click", runNow);
  $("#txtSwap").addEventListener("click", () => {
    $("#txtIn").value = $("#txtOut").value;
    runNow();
  });
  $("#txtCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#txtOut").value); toast("Copied"); }
    catch { toast("Copy failed"); }
  });
  $("#txtClear").addEventListener("click", () => {
    $("#txtIn").value = ""; $("#txtOut").value = "";
    $("#txtErr").hidden = true;
  });

  if (tool.sync !== false) runText();
}

function renderOpt(o) {
  if (o.type === "select") {
    const def = o.default;
    return `
      <div class="opt">
        <label>${esc(o.label)}</label>
        <div class="dd" id="opt_${o.key}" data-key="${o.key}" data-value="${esc(def)}">
          <button type="button" class="dd-toggle">
            <span class="dd-label">${esc(o.values.find(v=>v[0]===def)?.[1] ?? def)}</span>
            <span class="dd-arrow">▾</span>
          </button>
          <ul class="dd-menu" hidden>
            ${o.values.map(([v,lbl]) =>
              `<li class="dd-item${v===def?' active':''}" data-value="${esc(v)}">${esc(lbl)}</li>`).join("")}
          </ul>
        </div>
      </div>`;
  }
  if (o.type === "check") {
    return `<div class="opt opt-check">
      <label><input type="checkbox" data-key="${o.key}" ${o.default?'checked':''}/> ${esc(o.label)}</label>
    </div>`;
  }
  // text
  return `<div class="opt">
    <label>${esc(o.label)}</label>
    <input type="text" data-key="${o.key}" value="${esc(o.default ?? "")}" />
  </div>`;
}

function readOpts() {
  const opts = {};
  $$(".text-options [data-key]").forEach(el => {
    const k = el.dataset.key;
    if (el.classList.contains("dd")) opts[k] = el.dataset.value;
    else if (el.type === "checkbox") opts[k] = el.checked;
    else opts[k] = el.value;
  });
  return opts;
}

async function runText() {
  const tool = currentTextTool;
  if (!tool) return;
  const input = $("#txtIn").value;
  const err = $("#txtErr");
  err.hidden = true;
  try {
    const out = await tool.run(input, readOpts());
    $("#txtOut").value = out ?? "";
  } catch (e) {
    err.textContent = "Error: " + (e.message || e);
    err.hidden = false;
  }
}
