import { lazy, Suspense } from 'react';
import { Link, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { ReferenceDataProvider } from '@/context/ReferenceDataContext';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DictationLayer from '@/components/common/DictationLayer';
import HelpShortcut from '@/components/common/HelpShortcut';
import RouteFocus from '@/components/common/RouteFocus';
import VisitTracker from '@/components/common/VisitTracker';
import { HELP_PATH } from '@/lib/shortcuts';
import HomePage from '@/pages/HomePage';
import RequireAuth from '@/components/auth/RequireAuth';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import PasswordResetPage from '@/pages/auth/PasswordResetPage';
import UpdatePasswordPage from '@/pages/auth/UpdatePasswordPage';
// De bouwer is groot en je komt er vaak niet eens: wie op de telefoon alleen de
// chat of de start opent, hoeft hem niet te laden.
const OptimizerPage = lazy(() => import('@/pages/OptimizerPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const MyLibraryPage = lazy(() => import('@/pages/MyLibraryPage'));
const PromptDetailPage = lazy(() => import('@/pages/PromptDetailPage'));
const SharePreviewPage = lazy(() => import('@/pages/SharePreviewPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const CommunityPage = lazy(() => import('@/pages/CommunityPage'));
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/PersonalSettingsPage'));
const KeepProjectFilesPage = lazy(() => import('@/pages/KeepProjectFilesPage'));
// Frameworks oefenen: zelf een framework kiezen en de velden invullen.
const FrameworksPage = lazy(() => import('@/pages/FrameworksPage'));

// Chart-/admin-zware pagina's lazy laden (houdt recharts uit de hoofdbundle).
const TrendingPage = lazy(() => import('@/pages/TrendingPage'));
const ActivityPage = lazy(() => import('@/pages/ActivityPage'));
const AdminLayout = lazy(() => import('@/components/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const TechniqueManagerPage = lazy(() => import('@/pages/admin/TechniqueManagerPage'));
const CategoryManagerPage = lazy(() => import('@/pages/admin/CategoryManagerPage'));
const CategoryRequestQueuePage = lazy(() => import('@/pages/admin/CategoryRequestQueuePage'));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const UserManagerPage = lazy(() => import('@/pages/admin/UserManagerPage'));
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
      {/* min-h-full en geen min-h-dvh: naast de zwevende balk van Safari is dvh
          hoger dan wat je ziet, en dan kan een pagina die precies past toch schuiven. */}
      <div id="app-shell" className="opl-app flex min-h-full flex-col">
        <RouteFocus />
        <VisitTracker />
        <a href="#inhoud" className="opl-skip-link">
          Naar de inhoud
        </a>
        <Link to={HELP_PATH} className="opl-skip-link">
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
              {/* Zelf een framework kiezen en de velden invullen (oefenen). De
                  technieken staan op Maken, onder Wat wil je bereiken? */}
              <Route path="/frameworks" element={<FrameworksPage />} />
              <Route path="/technieken" element={<Navigate to="/frameworks" replace />} />
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
              <Route path="/instellingen/:onderdeel?/:sub?" element={<PersonalSettingsPage />} />
              <Route
                path="/toegankelijkheid"
                element={<Navigate to="/instellingen/toegankelijkheid" replace />}
              />
              {/* Het profiel staat sinds 25-11-2026 bij de instellingen. */}
              <Route path="/netwerk" element={<Navigate to="/zoeken" replace />} />
              <Route path="/profiel" element={<Navigate to="/instellingen/profiel" replace />} />

              {/* Vereist een ingelogde gebruiker */}
              <Route element={<RequireAuth />}>
                <Route path="/bibliotheek" element={<MyLibraryPage />} />
                <Route path="/bronnen-bewaren/:projectId" element={<KeepProjectFilesPage />} />
              </Route>

              {/* Goedkeuringen: alleen voor beheerders. */}
              <Route element={<RequireAuth role="admin" />}>
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
                  <Route path="technieken" element={<TechniqueManagerPage />} />
                  <Route path="categorieen" element={<CategoryManagerPage />} />
                  <Route path="categorie-aanvragen" element={<CategoryRequestQueuePage />} />
                  <Route path="analytics" element={<AdminAnalyticsPage />} />
                  <Route path="rapportage" element={<ReportsPage />} />
                  <Route path="audit" element={<AuditLogPage />} />
                  <Route path="instellingen" element={<SettingsPage />} />
                  <Route path="prompts" element={<PromptsPage />} />
                  {/* Organisaties, moderatoren en functies staan sinds 25-11-2026 uit beeld. */}
                  {['moderatoren', 'organisaties', 'rollen', 'functie-aanvragen', 'onderdeel-aanvragen'].map((p) => (
                    <Route key={p} path={p} element={<Navigate to="/admin" replace />} />
                  ))}
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
