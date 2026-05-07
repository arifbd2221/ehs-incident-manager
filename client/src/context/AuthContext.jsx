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
    <AuthContext.Provider value={{ user, loading, login, register, signupOrg, updateUser, saveDashLayout, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
