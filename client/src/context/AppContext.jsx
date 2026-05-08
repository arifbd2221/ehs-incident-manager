import { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <AppContext.Provider value={{ wizardOpen, setWizardOpen, refreshKey, triggerRefresh, sidebarOpen, setSidebarOpen }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
