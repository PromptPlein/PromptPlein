import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ReferenceDataProvider } from '@/context/ReferenceDataContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import HomePage from '@/pages/HomePage';
import SearchPage from '@/pages/SearchPage';
import OptimizerPage from '@/pages/OptimizerPage';
import FavoritesPage from '@/pages/FavoritesPage';
import PromptDetailPage from '@/pages/PromptDetailPage';
import SharePreviewPage from '@/pages/SharePreviewPage';
import RequireAuth from '@/components/auth/RequireAuth';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import PasswordResetPage from '@/pages/auth/PasswordResetPage';
import ProfilePage from '@/pages/ProfilePage';
const NetworkPage = lazy(() => import('@/pages/NetworkPage'));

// Chart-/admin-zware pagina's lazy laden (houdt recharts uit de hoofdbundle).
const TrendingPage = lazy(() => import('@/pages/TrendingPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const TechniqueManagerPage = lazy(() => import('@/pages/admin/TechniqueManagerPage'));
const RoleManagerPage = lazy(() => import('@/pages/admin/RoleManagerPage'));
const CategoryManagerPage = lazy(() => import('@/pages/admin/CategoryManagerPage'));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const UserManagerPage = lazy(() => import('@/pages/admin/UserManagerPage'));
const OrganizationManagerPage = lazy(() => import('@/pages/admin/OrganizationManagerPage'));
const ApprovalQueuePage = lazy(() => import('@/pages/admin/ApprovalQueuePage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="skeleton h-64 w-full rounded-xl" />
    </div>
  );
}

export default function App() {
  return (
    <ReferenceDataProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/zoeken" element={<SearchPage />} />
              <Route path="/optimaliseren" element={<OptimizerPage />} />
              <Route path="/optimaliseren/:promptId" element={<OptimizerPage />} />
              <Route path="/favorieten" element={<FavoritesPage />} />
              <Route path="/trending" element={<TrendingPage />} />
              <Route path="/activiteit" element={<ActivityPage />} />
              <Route path="/prompt/:promptId" element={<PromptDetailPage />} />
              <Route path="/share/:token" element={<SharePreviewPage />} />

              {/* Authenticatie */}
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/registreren" element={<SignupPage />} />
              <Route path="/auth/wachtwoord-vergeten" element={<PasswordResetPage />} />

              {/* Vereist een ingelogde gebruiker */}
              <Route element={<RequireAuth />}>
                <Route path="/profiel" element={<ProfilePage />} />
                <Route path="/netwerk" element={<NetworkPage />} />
              </Route>

              {/* Admin panel */}
              {/* Beheerpaneel — vereist een ingelogde admin/super_admin */}
              <Route element={<RequireAuth role="admin" />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="goedkeuringen" element={<ApprovalQueuePage />} />
                  <Route path="gebruikers" element={<UserManagerPage />} />
                  <Route path="organisaties" element={<OrganizationManagerPage />} />
                  <Route path="technieken" element={<TechniqueManagerPage />} />
                  <Route path="rollen" element={<RoleManagerPage />} />
                  <Route path="categorieen" element={<CategoryManagerPage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="rapportage" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditLogPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </ReferenceDataProvider>
  );
}
