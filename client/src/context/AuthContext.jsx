import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, signupOrg as apiSignupOrg, getMe, updateProfile as apiUpdateProfile, saveDashboardLayout } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe().then(data => setUser(data.user)).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data;
  };

  const register = async (formData) => {
    const data = await apiRegister(formData);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data;
  };

  const signupOrg = async (formData) => {
    const data = await apiSignupOrg(formData);
    localStorage.setItem('token', data.token);
    setUser(data.user);
    return data;
  };

  const updateUser = async (data) => {
    const result = await apiUpdateProfile(data);
    localStorage.setItem('token', result.token);
    setUser(result.user);
    return result;
  };

  // Refresh in-memory user + persisted JWT from a token that the caller
  // already obtained (e.g., the /organization/logo response returns a
  // re-minted token so the FE picks up the new logo_path without a
  // forced logout).
  const updateUserFromToken = (token, nextUser) => {
    if (token) localStorage.setItem('token', token);
    if (nextUser) setUser(nextUser);
  };

  const saveDashLayout = async (widgets) => {
    const result = await saveDashboardLayout(widgets);
    setUser(prev => ({ ...prev, dashboard_layout: result.dashboard_layout }));
    return result;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, signupOrg, updateUser, updateUserFromToken, saveDashLayout, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
