export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({ error: 'Constraint violation', detail: err.message });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
