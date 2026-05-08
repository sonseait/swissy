const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32decode(s) {
  s = s.replace(/=+$/,'').toUpperCase();
  const out = [];
  let bits = 0, val = 0;
  for (const c of s) {
    const idx = B32.indexOf(c);
    if (idx < 0) throw new Error("bad base32");
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

function totpStep(t = Date.now()) {
  return Math.floor(t / 30000);
}

function totpSecondsLeft(t = Date.now()) {
  return 30 - (Math.floor(t / 1000) % 30);
}

async function totp(secretB32, t = Date.now()) {
  const key = b32decode(secretB32);
  const counter = totpStep(t);
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(4, counter & 0xffffffff);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const code = ((sig[offset] & 0x7f) << 24) |
               ((sig[offset+1] & 0xff) << 16) |
               ((sig[offset+2] & 0xff) << 8) |
               (sig[offset+3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}
