// Map raw SQLite constraint codes to user-grade messages so we don't leak
// schema names or trigger text. The full err.message is always logged
// server-side (see console.error above) for debugging — only the response
// body gets sanitized.
function scrubSqliteError(err) {
  // SQLite combines a base code with a sub-code (e.g. SQLITE_CONSTRAINT_FOREIGNKEY).
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();

  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || msg.includes('foreign key')) {
    return { status: 409, body: { error: 'A referenced item does not exist or has been removed.' } };
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('unique constraint')) {
    return { status: 409, body: { error: 'An item with this value already exists.' } };
  }
  if (code === 'SQLITE_CONSTRAINT_CHECK' || msg.includes('check constraint')) {
    return { status: 400, body: { error: 'The submitted data is not in a valid combination.' } };
  }
  if (code === 'SQLITE_CONSTRAINT_NOTNULL' || msg.includes('not null')) {
    return { status: 400, body: { error: 'A required field is missing.' } };
  }
  if (code === 'SQLITE_CONSTRAINT' || msg.includes('constraint')) {
    // Triggers raise SQLITE_CONSTRAINT with a custom message — those messages
    // are written to be user-facing (e.g. "CAPA owner and verifier must be
    // different people"), so we surface them verbatim.
    return { status: 409, body: { error: err.message || 'Operation rejected by a database rule.' } };
  }
  return null;
}

// Multer 2.x exposes typed errors. Limit/mime errors should be 400-class,
// not 500. Anything else falls through to the generic handler.
function scrubMulterError(err) {
  if (err.name !== 'MulterError') return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, body: { error: 'File is too large. Max upload size is 25 MB.' } };
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return { status: 400, body: { error: 'Too many files. Max 10 per upload.' } };
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return { status: 400, body: { error: 'Unexpected file field.' } };
  }
  return { status: 400, body: { error: `Upload failed: ${err.message}` } };
}

export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const sqlite = scrubSqliteError(err);
  if (sqlite) return res.status(sqlite.status).json(sqlite.body);

  const multer = scrubMulterError(err);
  if (multer) return res.status(multer.status).json(multer.body);

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
