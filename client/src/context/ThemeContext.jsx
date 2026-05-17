import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'sds_theme';
const VALID = new Set(['light', 'dark', 'system']);

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.has(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(mode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  // Track the resolved theme (what's actually rendering) so consumers
  // that need to react to light-vs-dark (e.g. illustrations) can do so
  // without re-implementing the system-pref watch.
  const [resolved, setResolved] = useState(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => setResolved(e.matches ? 'dark' : 'light');
      setResolved(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    setResolved(theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID.has(next)) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
