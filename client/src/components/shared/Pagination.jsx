import Icon from './Icon';

/**
 * Pagination — shared list-page paginator.
 *
 * Props:
 *   page          current page (1-based)
 *   limit         items per page
 *   total         total filtered items the server reports
 *   onPageChange  (nextPage: number) => void
 *   onLimitChange optional (nextLimit: number) => void — renders a size dropdown
 *   label         optional singular noun for the count ("incident", "risk")
 *   loading       optional — disables the buttons while a request is in flight
 *   pageSizes     optional [25, 50, 100] — used with onLimitChange
 *   compact       optional — tighter spacing for embedded use
 *
 * Returns null when there's nothing to paginate (total fits on the current
 * page) AND no page-size control is requested.
 */
export default function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  label,
  loading = false,
  pageSizes = [25, 50, 100],
  compact = false,
}) {
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeLimit = limit > 0 ? limit : 50;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  // Bail out if the list is already shorter than one page and the caller
  // hasn't asked for a size selector — nothing useful to render.
  if (totalPages <= 1 && !onLimitChange) return null;

  const noun = label || 'item';
  const plural = noun.endsWith('s') ? noun : `${noun}s`;
  const countText =
    safeTotal === 0
      ? `0 ${plural}`
      : `${safeTotal.toLocaleString()} ${safeTotal === 1 ? noun : plural}`;

  return (
    <div className={`pgn${compact ? ' pgn-compact' : ''}`}>
      <div className="pgn-info" aria-live="polite">
        <span className="pgn-count">{countText}</span>
        <span className="pgn-sep">·</span>
        <span className="pgn-page">Page {page} of {totalPages}</span>
      </div>

      <div className="pgn-controls">
        {onLimitChange && (
          <label className="pgn-size">
            <span className="pgn-size-lbl">Show</span>
            <select
              className="pgn-size-sel"
              value={safeLimit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              disabled={loading}
              aria-label="Items per page"
            >
              {pageSizes.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
        <div className="pgn-btns">
          <button
            type="button"
            className="pgn-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={loading || atFirst}
            aria-label="Previous page"
          >
            <Icon name="arrowL" size={14} />
            <span>Prev</span>
          </button>
          <button
            type="button"
            className="pgn-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={loading || atLast}
            aria-label="Next page"
          >
            <span>Next</span>
            <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
