/**
 * Reads GlobalSettings › UnitScaleFactor from an FBX (binary or ASCII):
 * centimetres per file unit. three.js's FBXLoader ignores it, so files saved
 * in centimetres (Blender, Maya, Mixamo) load 100× too big; multiply the
 * loaded model by fbxMetresPerUnit() to get metres. 1 when it can't tell.
 *
 * @param {ArrayBuffer|Uint8Array} data
 */
export function fbxMetresPerUnit(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const factor = isBinary(bytes) ? binaryFactor(bytes) : asciiFactor(bytes);
  return Number.isFinite(factor) && factor > 0 ? factor / 100 : 1;
}

const MAGIC = 'Kaydara FBX Binary';
const isBinary = (b) => MAGIC.split('').every((c, i) => b[i] === c.charCodeAt(0));

function binaryFactor(b) {
  const key = [...'UnitScaleFactor'].map((c) => c.charCodeAt(0));
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  outer: for (let i = 0; i < b.length - key.length - 40; i++) {
    for (let k = 0; k < key.length; k++) if (b[i + k] !== key[k]) continue outer;
    // A Properties70 "P" row: the name, then three more strings, then the value.
    if (b[i - 5] !== 0x53 || view.getUint32(i - 4, true) !== key.length) continue;
    let p = i + key.length;
    for (let s = 0; s < 3; s++) {
      if (b[p] !== 0x53) continue outer;
      p += 5 + view.getUint32(p + 1, true);
    }
    if (b[p] === 0x44) return view.getFloat64(p + 1, true);
  }
  return NaN;
}

function asciiFactor(b) {
  const text = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 200000)));
  const m = text.match(/"UnitScaleFactor"\s*,\s*"double"\s*,\s*"Number"\s*,\s*"[^"]*"\s*,\s*([-\d.eE+]+)/);
  return m ? Number(m[1]) : NaN;
}
