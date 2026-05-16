import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useApp } from './context/AppContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import StopWorkBanner from './components/layout/StopWorkBanner';
import Login from './pages/Login';
import Register from './pages/Register';
import SignupOrg from './pages/SignupOrg';
import OnboardingFirstSite from './pages/OnboardingFirstSite';
import Dashboard from './pages/Dashboard';
import IncidentsList from './pages/incidents/IncidentsList';
import IncidentDetail from './pages/incidents/IncidentDetail';
import InvestigationsPage from './pages/investigations/InvestigationsPage';
import InvestigationDetail from './pages/investigations/InvestigationDetail';
import CAPAPage from './pages/capas/CAPAPage';
import CAPADetail from './pages/capas/CAPADetail';
import ReportsPage from './pages/reports/ReportsPage';
import ApprovalsPage from './pages/approvals/ApprovalsPage';
import Settings from './pages/Settings';
import Sites from './pages/admin/Sites';
import SiteDetail from './pages/admin/SiteDetail';
import Members from './pages/admin/Members';
import AssetsList from './pages/assets/AssetsList';
import AssetDetail from './pages/assets/AssetDetail';
import MaintenancePage from './pages/maintenance/MaintenancePage';
import DocumentsList from './pages/documents/DocumentsList';
import TemplatesList from './pages/templates/TemplatesList';
import TemplateEditor from './pages/templates/TemplateEditor';
import InspectionsList from './pages/inspections/InspectionsList';
import InspectionEditor from './pages/inspections/InspectionEditor';
import InspectionReport from './pages/inspections/InspectionReport';
import LearnPage from './pages/learn/LearnPage';
import RisksPage from './pages/risks/RisksPage';
import RiskDetail from './pages/risks/RiskDetail';
import ReportWizard from './pages/wizard/ReportWizard';
import GlobalVoiceFab from './components/voice/GlobalVoiceFab';
import NotFound from './pages/NotFound';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { wizardOpen, wizardPrefill, closeWizard, triggerRefresh } = useApp();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <StopWorkBanner />
        <TopBar />
        <Outlet />
      </div>
      {wizardOpen && (
        <ReportWizard
          prefill={wizardPrefill}
          onClose={closeWizard}
          onSubmit={() => { closeWizard(); triggerRefresh(); }}
        />
      )}
      <GlobalVoiceFab />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/signup" element={<SignupOrg />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/onboarding/site" element={<OnboardingFirstSite />} />
        <Route path="/incidents" element={<IncidentsList />} />
        <Route path="/incidents/:id" element={<IncidentDetail />} />
        <Route path="/investigations" element={<InvestigationsPage />} />
        <Route path="/investigations/:id" element={<InvestigationDetail />} />
        <Route path="/capas" element={<CAPAPage />} />
        <Route path="/capas/:id" element={<CAPADetail />} />
        <Route path="/risks" element={<RisksPage />} />
        <Route path="/risks/:id" element={<RiskDetail />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/admin/sites" element={<Sites />} />
        <Route path="/admin/sites/:id" element={<SiteDetail />} />
        <Route path="/admin/members" element={<Members />} />
        <Route path="/assets" element={<AssetsList />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/documents" element={<DocumentsList />} />
        <Route path="/templates" element={<TemplatesList />} />
        <Route path="/templates/:id/edit" element={<TemplateEditor />} />
        <Route path="/inspections" element={<InspectionsList />} />
        <Route path="/inspections/:id" element={<InspectionEditor />} />
        <Route path="/inspections/:id/report" element={<InspectionReport />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/profile" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
