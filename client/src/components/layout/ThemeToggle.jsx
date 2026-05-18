import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../shared/Icon';
import { useTheme } from '../../context/ThemeContext';

const INTRO_SEEN_KEY = 'sds_theme_intro_seen';

/**
 * ThemeToggle — TopBar control with three behaviours:
 *   - click           → instant flip between light and dark
 *   - long-press 600ms → open popover with Light / Dark / System
 *   - right-click     → same popover
 *
 * The icon morphs between a sun and a crescent moon via an SVG mask that
 * slides into the orb (carving a crescent) while the rays scale + fade.
 * First-login affordance: a pulsing brand ring + small tooltip points at
 * the button once, then writes a localStorage flag to never show again.
 */
export default function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [popOpen, setPopOpen] = useState(false);
  const [popPos, setPopPos] = useState({ top: 0, right: 0 });
  const [introVisible, setIntroVisible] = useState(false);

  const btnRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressed = useRef(false);

  const isDark = resolved === 'dark';

  // Show the intro tooltip once per browser.
  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) {
        // Small delay so the page has settled visually before the tip appears.
        const t = setTimeout(() => setIntroVisible(true), 900);
        return () => clearTimeout(t);
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  const dismissIntro = () => {
    if (!introVisible) return;
    setIntroVisible(false);
    try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch { /* ignore */ }
  };

  // Auto-dismiss the intro after 6s of no interaction.
  useEffect(() => {
    if (!introVisible) return;
    const t = setTimeout(dismissIntro, 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introVisible]);

  const openPopover = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPopPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setPopOpen(true);
    dismissIntro();
  };

  const handleClick = () => {
    if (longPressed.current) {
      // The pointer-down already opened the popover; this trailing click
      // is the up-event from the long-press itself. Swallow it.
      longPressed.current = false;
      return;
    }
    dismissIntro();
    setTheme(isDark ? 'light' : 'dark');
  };

  const handlePointerDown = () => {
    longPressed.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openPopover();
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    cancelLongPress();
    openPopover();
  };

  const choose = (next) => {
    setTheme(next);
    setPopOpen(false);
  };

  const themeLabel =
    theme === 'system' ? `System (${resolved})` : isDark ? 'Dark' : 'Light';

  return (
    <div className="theme-toggle-anchor">
      <button
        ref={btnRef}
        type="button"
        className={`icon-btn theme-toggle ${isDark ? 'is-dark' : 'is-light'} ${popOpen ? 'is-open' : ''}`}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={handleContextMenu}
        aria-label={`Theme: ${themeLabel}. Click to toggle, long-press or right-click for options.`}
        aria-haspopup="menu"
        aria-expanded={popOpen}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <defs>
            <mask id="tt-moon-mask">
              <rect x="0" y="0" width="24" height="24" fill="#fff" />
              <circle className="tt-cutout" cx="22" cy="8" r="5" fill="#000" />
            </mask>
          </defs>
          <g className="tt-rays">
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
            <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
            <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
            <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
          </g>
          <circle className="tt-orb" cx="12" cy="12" r="5" mask="url(#tt-moon-mask)" />
        </svg>
        {introVisible && <span className="tt-pulse" aria-hidden="true" />}
      </button>

      {introVisible && createPortal(
        <div
          className="tt-intro"
          role="status"
          style={{
            top: (btnRef.current?.getBoundingClientRect().bottom || 0) + 12,
            right: window.innerWidth - (btnRef.current?.getBoundingClientRect().right || 0),
          }}
          onClick={dismissIntro}
        >
          <span className="tt-intro-arrow" aria-hidden="true" />
          <span className="tt-intro-text">
            Switch themes anytime — click for quick toggle, hold for options.
          </span>
          <button type="button" className="tt-intro-close" onClick={dismissIntro} aria-label="Dismiss">
            <Icon name="close" size={11} />
          </button>
        </div>,
        document.body
      )}

      {popOpen && createPortal(
        <>
          <div className="tt-pop-backdrop" onClick={() => setPopOpen(false)} />
          <div
            className="tt-pop"
            role="menu"
            style={{ top: popPos.top, right: popPos.right }}
          >
            {[
              { id: 'light', label: 'Light', desc: 'Bright surfaces' },
              { id: 'dark', label: 'Dark', desc: 'Easier in low light' },
              { id: 'system', label: 'System', desc: 'Match your OS' },
            ].map((opt) => (
              <button
                key={opt.id}
                role="menuitemradio"
                aria-checked={theme === opt.id}
                type="button"
                className={`tt-pop-item ${theme === opt.id ? 'is-active' : ''}`}
                onClick={() => choose(opt.id)}
              >
                <span className={`tt-pop-swatch tt-pop-swatch-${opt.id}`} aria-hidden="true" />
                <span className="tt-pop-body">
                  <span className="tt-pop-label">{opt.label}</span>
                  <span className="tt-pop-desc">{opt.desc}</span>
                </span>
                {theme === opt.id && (
                  <span className="tt-pop-check"><Icon name="check" size={12} /></span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
