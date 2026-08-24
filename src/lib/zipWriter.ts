/**
 * Minimal store-only (uncompressed) ZIP writer.
 *
 * The Euphonia Studio tells the student to "train a personalized model on your
 * data", but every clip it records lands in browser IndexedDB with no way to
 * get it out — so the training set was effectively trapped in whichever browser
 * profile did the recording. This produces one downloadable archive instead.
 *
 * Store-only is deliberate: the clips are already compressed audio (webm/opus),
 * so deflate would buy nothing and would mean pulling in a dependency. Everything
 * here is plain ZIP as specified in APPNOTE.TXT, which every unzip tool reads.
 */

export interface ZipEntry {
  /** Path inside the archive, e.g. "phrase-01/take-1.webm". */
  name: string;
  blob: Blob;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date/time, which is what the ZIP header carries. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
  };
}

/** Names are written UTF-8 with the language-encoding flag set (bit 11). */
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  private len = 0;
  get length() { return this.len; }
  push(b: Uint8Array) { this.parts.push(b); this.len += b.length; }
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); this.push(b); }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
  collect() { return this.parts; }
}

/**
 * Build a ZIP archive from the given entries.
 *
 * Rejects if the total would exceed the 4 GB the classic (non-Zip64) format can
 * address, rather than writing a silently corrupt file.
 */
export async function createZip(entries: ZipEntry[], when: Date = new Date()): Promise<Blob> {
  const { time, date } = dosDateTime(when);
  const out = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = utf8(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const offset = out.length;

    out.u32(0x04034b50);      // local file header
    out.u16(20);              // version needed
    out.u16(0x0800);          // UTF-8 name
    out.u16(0);               // stored, no compression
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(data.length);     // compressed size == uncompressed size
    out.u32(data.length);
    out.u16(name.length);
    out.u16(0);               // no extra field
    out.push(name);
    out.push(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const cdStart = out.length;
  for (const e of central) {
    out.u32(0x02014b50);      // central directory header
    out.u16(20);              // version made by
    out.u16(20);              // version needed
    out.u16(0x0800);
    out.u16(0);
    out.u16(time);
    out.u16(date);
    out.u32(e.crc);
    out.u32(e.size);
    out.u32(e.size);
    out.u16(e.name.length);
    out.u16(0);               // extra
    out.u16(0);               // comment
    out.u16(0);               // disk number
    out.u16(0);               // internal attrs
    out.u32(0);               // external attrs
    out.u32(e.offset);
    out.push(e.name);
  }
  const cdSize = out.length - cdStart;

  out.u32(0x06054b50);        // end of central directory
  out.u16(0);
  out.u16(0);
  out.u16(central.length);
  out.u16(central.length);
  out.u32(cdSize);
  out.u32(cdStart);
  out.u16(0);                 // no archive comment

  if (out.length > 0xffffffff) {
    throw new Error('Archive exceeds the 4GB limit of the classic ZIP format');
  }
  return new Blob(out.collect() as BlobPart[], { type: 'application/zip' });
}

/** Hand a generated Blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
