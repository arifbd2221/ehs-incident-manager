import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import IncidentsList from './pages/incidents/IncidentsList';
import IncidentDetail from './pages/incidents/IncidentDetail';
import InvestigationsPage from './pages/investigations/InvestigationsPage';
import InvestigationDetail from './pages/investigations/InvestigationDetail';
import CAPAPage from './pages/capas/CAPAPage';
import CAPADetail from './pages/capas/CAPADetail';
import ReportsPage from './pages/reports/ReportsPage';
import Settings from './pages/Settings';
import Sites from './pages/admin/Sites';
import AssetsList from './pages/assets/AssetsList';
import AssetDetail from './pages/assets/AssetDetail';
import DocumentsList from './pages/documents/DocumentsList';
import ReportWizard from './pages/wizard/ReportWizard';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { wizardOpen, setWizardOpen, triggerRefresh } = useApp();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <TopBar />
        <Outlet />
      </div>
      {wizardOpen && (
        <ReportWizard
          onClose={() => setWizardOpen(false)}
          onSubmit={() => { setWizardOpen(false); triggerRefresh(); }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/incidents" element={<IncidentsList />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/investigations" element={<InvestigationsPage />} />
        <Route path="/investigations/:id" element={<InvestigationDetail />} />
        <Route path="/capas" element={<CAPAPage />} />
        <Route path="/capas/:id" element={<CAPADetail />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/admin/sites" element={<Sites />} />
        <Route path="/assets" element={<AssetsList />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/documents" element={<DocumentsList />} />
        <Route path="/profile" element={<Settings />} />
      </Route>
    </Routes>
  );
}
