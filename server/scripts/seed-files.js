// server/scripts/seed-files.js
//
// File writers for demo/seed scripts that insert into the `documents` table.
// The download/preview endpoint (`GET /api/documents/:id/download`) requires
// `documents.stored_filename` to be set AND the file to exist in uploadDir,
// otherwise it returns 404 and the preview modal alerts "No file on disk".

import crypto from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads');
mkdirSync(uploadDir, { recursive: true });

// Build a valid 1-page PDF with `title` rendered as text. xref offsets are
// computed from real byte lengths so PDF readers accept it.
function makeMinimalPdf(title) {
  const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 14 Tf 50 720 Td (${escape(title)}) Tj ET\n`;
  const objs = [
    null,
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary')];
  const offsets = [0];
  let pos = chunks[0].length;
  for (let i = 1; i < objs.length; i++) {
    offsets.push(pos);
    const c = Buffer.from(`${i} 0 obj\n${objs[i]}\nendobj\n`, 'binary');
    chunks.push(c);
    pos += c.length;
  }
  const xrefStart = pos;
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'binary'));
  return Buffer.concat(chunks);
}

export function writeSeedPdf(title) {
  const filename = `${crypto.randomUUID()}.pdf`;
  const buf = makeMinimalPdf(title);
  writeFileSync(join(uploadDir, filename), buf);
  return { filename, size: buf.length };
}

// 1x1 white JPEG (631 bytes, base64-encoded). Stand-in for photo-type seed
// documents so the preview pane renders something instead of 404'ing.
const TINY_JPEG_B64 =
  '/9j/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/' +
  '2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wgAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAB/' +
  '/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAA' +
  'AAAAAP/hAAgQAQABBQECfwH/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Q' +
  'f//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z';

export function writeSeedJpeg() {
  const filename = `${crypto.randomUUID()}.jpg`;
  const buf = Buffer.from(TINY_JPEG_B64, 'base64');
  writeFileSync(join(uploadDir, filename), buf);
  return { filename, size: buf.length };
}
