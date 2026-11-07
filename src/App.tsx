import { lazy, Suspense } from 'react';
import { Link, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ReferenceDataProvider } from '@/context/ReferenceDataContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DictationLayer from '@/components/common/DictationLayer';
import HelpShortcut from '@/components/common/HelpShortcut';
import HomePage from '@/pages/HomePage';
import SearchPage from '@/pages/SearchPage';
import OptimizerPage from '@/pages/OptimizerPage';
import MyLibraryPage from '@/pages/MyLibraryPage';
import PromptDetailPage from '@/pages/PromptDetailPage';
import SharePreviewPage from '@/pages/SharePreviewPage';
import RequireAuth from '@/components/auth/RequireAuth';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import PasswordResetPage from '@/pages/auth/PasswordResetPage';
import UpdatePasswordPage from '@/pages/auth/UpdatePasswordPage';
import ProfilePage from '@/pages/ProfilePage';
import ContactPage from '@/pages/ContactPage';
const NetworkPage = lazy(() => import('@/pages/NetworkPage'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage'));
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/PersonalSettingsPage'));
// De techniekenlijst met invulvelden (training): eigen instap naast /genereren.
const TechniquesPage = lazy(() => import('@/pages/TechniquesPage'));

// Chart-/admin-zware pagina's lazy laden (houdt recharts uit de hoofdbundle).
const TrendingPage = lazy(() => import('@/pages/TrendingPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const TechniqueManagerPage = lazy(() => import('@/pages/admin/TechniqueManagerPage'));
const RoleManagerPage = lazy(() => import('@/pages/admin/RoleManagerPage'));
const FunctionRequestQueuePage = lazy(() => import('@/pages/admin/FunctionRequestQueuePage'));
const CategoryManagerPage = lazy(() => import('@/pages/admin/CategoryManagerPage'));
const CategoryRequestQueuePage = lazy(() => import('@/pages/admin/CategoryRequestQueuePage'));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const UserManagerPage = lazy(() => import('@/pages/admin/UserManagerPage'));
const ModeratorManagerPage = lazy(() => import('@/pages/admin/ModeratorManagerPage'));
const OrganizationManagerPage = lazy(() => import('@/pages/admin/OrganizationManagerPage'));
const ApprovalQueuePage = lazy(() => import('@/pages/admin/ApprovalQueuePage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'));
const PromptsPage = lazy(() => import('@/pages/admin/PromptsPage'));

/** Behoudt het promptId bij de redirect van de oude /optimaliseren-URL. */
function RedirectToGenereren() {
  const { promptId } = useParams<{ promptId?: string }>();
  return <Navigate to={`/genereren/${promptId ?? ''}`} replace />;
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="skeleton h-64 w-full rounded-xl" />
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();

  return (
    <ReferenceDataProvider>
      <div className="flex min-h-screen flex-col">
        <a href="#inhoud" className="opl-skip-link">
          Naar de inhoud
        </a>
        <Link to="/instellingen/hulp" className="opl-skip-link">
          Hulp bij toegankelijkheid
        </Link>
        <Header />
        <main id="inhoud" tabIndex={-1} className="flex-1 focus:outline-none">
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/zoeken" element={<SearchPage />} />
              <Route path="/genereren" element={<OptimizerPage />} />
              <Route path="/genereren/:promptId" element={<OptimizerPage />} />
              {/* Zelf een techniek kiezen en de velden invullen (training). */}
              <Route path="/technieken" element={<TechniquesPage />} />
              {/* Oude URL blijft werken via redirect */}
              <Route path="/optimaliseren" element={<Navigate to="/genereren" replace />} />
              <Route
                path="/optimaliseren/:promptId"
                element={<RedirectToGenereren />}
              />
              {/* Oude favorieten-URL blijft werken → favorieten-tab in de bibliotheek. */}
              <Route path="/favorieten" element={<Navigate to="/bibliotheek" replace />} />
              <Route path="/trending" element={<TrendingPage />} />
              <Route path="/activiteit" element={<ActivityPage />} />
              <Route path="/prompt/:promptId" element={<PromptDetailPage />} />
              <Route path="/share/:token" element={<SharePreviewPage />} />
              <Route path="/contact" element={<ContactPage />} />

              {/* Community — openbaar: wie maakt de prompts en bij welk ministerie. */}
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/community/:userId" element={<PublicProfilePage />} />

              {/* Authenticatie */}
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/registreren" element={<SignupPage />} />
              <Route path="/auth/wachtwoord-vergeten" element={<PasswordResetPage />} />
              <Route path="/auth/nieuw-wachtwoord" element={<UpdatePasswordPage />} />

              {/* Chat: ook zonder account. Gesprekken staan alleen op het
                  apparaat; projecten (Postgres) vragen wel een account. */}
              <Route path="/chat" element={<ChatPage />} />

              {/* Openbaar, net als de chat: toegankelijkheid moet ook zonder
                  account in te stellen zijn. Alleen de eigen instructie voor de
                  chat vraagt om in te loggen, dat regelt dat onderdeel zelf. */}
              <Route path="/instellingen/:onderdeel?" element={<PersonalSettingsPage />} />
              <Route
                path="/toegankelijkheid"
                element={<Navigate to="/instellingen/toegankelijkheid" replace />}
              />

              {/* Vereist een ingelogde gebruiker */}
              <Route element={<RequireAuth />}>
                <Route path="/bibliotheek" element={<MyLibraryPage />} />
                <Route path="/profiel" element={<ProfilePage />} />
                <Route path="/netwerk" element={<NetworkPage />} />
              </Route>

              {/* Goedkeuringen — toegankelijk voor admins én moderatoren.
                  De wachtrij filtert via RLS automatisch op wat jíj mag beoordelen. */}
              <Route element={<RequireAuth role="admin" allowModerator />}>
                <Route
                  path="/goedkeuringen"
                  element={
                    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
                      <ApprovalQueuePage />
                    </div>
                  }
                />
              </Route>

              {/* Admin panel */}
              {/* Beheerpaneel — vereist een ingelogde admin/super_admin */}
              <Route element={<RequireAuth role="admin" />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="goedkeuringen" element={<ApprovalQueuePage />} />
                  <Route path="gebruikers" element={<UserManagerPage />} />
                  <Route path="moderatoren" element={<ModeratorManagerPage />} />
                  <Route path="organisaties" element={<OrganizationManagerPage />} />
                  <Route path="technieken" element={<TechniqueManagerPage />} />
                  <Route path="rollen" element={<RoleManagerPage />} />
                  <Route path="functie-aanvragen" element={<FunctionRequestQueuePage />} />
                  <Route path="categorieen" element={<CategoryManagerPage />} />
                  <Route path="categorie-aanvragen" element={<CategoryRequestQueuePage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="rapportage" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditLogPage />} />
                  <Route path="instellingen" element={<SettingsPage />} />
                  <Route path="prompts" element={<PromptsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        {/* De chat gebruikt het hele venster om te lezen. De tekst uit de footer
            staat daar onder de kaart. */}
        {pathname !== '/chat' && <Footer />}
        {/* Microfoontje rechtsonder in elk tekstvak: inspreken in plaats van typen. */}
        <DictationLayer />
        <HelpShortcut />
      </div>
    </ReferenceDataProvider>
  );
}
