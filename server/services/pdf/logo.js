// server/services/pdf/logo.js — shared org-logo embedding helper used by
// every regulator PDF renderer (osha_300, osha_300a, osha_301,
// generic_incident, safework_nsw).
//
// The renderers each have their own header layout, so they pass the
// exact x/y position and the bounding box they have available. This
// helper does two jobs:
//
//   1. Resolve the basename stored in organizations.logo_path against
//      the server's uploadDir to an absolute path. Returns null when
//      the org has no logo.
//
//   2. Embed the image into the PDF inside the caller-provided box,
//      preserving aspect ratio (pdfkit's fit option). Wraps the call in
//      try/catch so a missing file, bad bytes, or unsupported format
//      never breaks the PDF — the renderer falls through to its
//      text-only header.
//
// Why a separate file: each renderer keeps its own internal helpers
// otherwise, but org-logo embedding is identical across all five and
// touches the filesystem, which is too much copy/paste to maintain in
// parallel.

import { join } from 'path';
import { existsSync } from 'fs';
import { uploadDir } from '../../middleware/upload.js';

/**
 * Resolve `organizations.logo_path` (a basename) to an absolute path on
 * disk, or null when the org has no logo or the file is missing.
 *
 * Defensive: only basenames are accepted to prevent path traversal —
 * if the stored value contains a '/' or '..', it's rejected.
 */
export function resolveOrgLogoPath(logoBasename) {
  if (!logoBasename) return null;
  const s = String(logoBasename);
  if (s.includes('/') || s.includes('..') || s.includes('\\')) return null;
  const abs = join(uploadDir, s);
  if (!existsSync(abs)) return null;
  return abs;
}

/**
 * Embed the org logo into the PDF at (x, y) constrained by
 * (maxWidth, maxHeight). Returns true when the image was successfully
 * embedded; false otherwise (caller can then choose to draw a fallback).
 *
 * The caller positions the box and decides what to render if the image
 * couldn't be drawn. pdfkit's `fit` option preserves aspect ratio inside
 * the bounding box; `align` + `valign` center the image inside the box.
 */
export function embedOrgLogo(doc, logoAbsPath, x, y, maxWidth, maxHeight) {
  if (!logoAbsPath) return false;
  try {
    doc.image(logoAbsPath, x, y, {
      fit: [maxWidth, maxHeight],
      align: 'left',
      valign: 'top',
    });
    return true;
  } catch (_err) {
    // pdfkit throws on unsupported formats / corrupt files. Swallow —
    // the renderer keeps going with no logo.
    return false;
  }
}
