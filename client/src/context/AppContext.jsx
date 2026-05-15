import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getSites } from '../api/auth';
import { setGlobalSiteId } from '../api/client';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

const SITE_KEY = 'ehs_active_site';

function readStoredSite() {
  const v = localStorage.getItem(SITE_KEY);
  return v ? Number(v) : null;
}

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Helper: open the wizard with optional initial values (e.g. asset_id from
  // an asset detail page). Cleared automatically when the wizard closes.
  const openWizard = useCallback((prefill = null) => {
    setWizardPrefill(prefill);
    setWizardOpen(true);
  }, []);
  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardPrefill(null);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [voiceSheetData, setVoiceSheetData] = useState(null);

  const [sites, setSites] = useState([]);
  const [activeSiteId, _setActiveSiteId] = useState(() => {
    const stored = readStoredSite();
    setGlobalSiteId(stored);
    return stored;
  });

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const setActiveSiteId = useCallback((id) => {
    const val = id ? Number(id) : null;
    _setActiveSiteId(val);
    setGlobalSiteId(val);
    if (val) localStorage.setItem(SITE_KEY, val);
    else localStorage.removeItem(SITE_KEY);
    triggerRefresh();
  }, [triggerRefresh]);

  const userId = user?.id;
  const userSiteId = user?.site_id;

  useEffect(() => {
    if (!userId) return;
    getSites()
      .then(data => {
        const list = data.sites || [];
        setSites(list);
        const stored = readStoredSite();
        if (stored && !list.some(s => s.id === stored)) {
          _setActiveSiteId(null);
          setGlobalSiteId(null);
          localStorage.removeItem(SITE_KEY);
        } else if (!stored && userSiteId && list.some(s => s.id === userSiteId)) {
          _setActiveSiteId(userSiteId);
          setGlobalSiteId(userSiteId);
          localStorage.setItem(SITE_KEY, userSiteId);
        }
      })
      .catch(() => {});
  }, [userId, userSiteId]);

  return (
    <AppContext.Provider value={{
      wizardOpen, setWizardOpen,
      wizardPrefill, openWizard, closeWizard,
      refreshKey, triggerRefresh,
      sidebarOpen, setSidebarOpen,
      voiceSheetOpen, setVoiceSheetOpen,
      voiceSheetData, setVoiceSheetData,
      sites, setSites,
      activeSiteId, setActiveSiteId,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
