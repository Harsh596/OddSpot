import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { LoadingSkeleton } from './components/ui/StatusViews';
import ScoutTourModal from './components/onboarding/ScoutTourModal';
import HelpPopover from './components/onboarding/HelpPopover';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import './App.css';

// Route-based code splitting for secondary pages
const ExplorePage = lazy(() =>
  import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage || m.default }))
);
const RandomPage = lazy(() =>
  import('./pages/RandomPage').then((m) => ({ default: m.RandomPage || m.default }))
);
const CreatePost = lazy(() =>
  import('./pages/CreatePost').then((m) => ({ default: m.CreatePost || m.default }))
);
const PostDetail = lazy(() =>
  import('./pages/PostDetail').then((m) => ({ default: m.PostDetail || m.default }))
);
const CommunitiesPage = lazy(() =>
  import('./pages/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage || m.default }))
);
const CommunityDetailPage = lazy(() =>
  import('./pages/CommunityDetailPage').then((m) => ({ default: m.CommunityDetailPage || m.default }))
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage || m.default }))
);
const GuidePage = lazy(() =>
  import('./pages/GuidePage').then((m) => ({ default: m.GuidePage || m.default }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage || m.default }))
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage || m.default }))
);

/**
 * Route wrapper extracting post ID param for PostDetail
 */
function PostDetailRouteWrapper({ navigate }) {
  const { id } = useParams();
  return <PostDetail postId={id} navigate={navigate} />;
}

/**
 * Route wrapper extracting community slug param for CommunityDetailPage
 */
function CommunityDetailRouteWrapper({ navigate }) {
  const { slug } = useParams();
  return <CommunityDetailPage slug={slug} navigate={navigate} />;
}

/**
 * Route wrapper extracting username param for ProfilePage
 */
function ProfileRouteWrapper({ navigate }) {
  const { username } = useParams();
  return <ProfilePage username={username} navigate={navigate} />;
}

/**
 * Main application shell containing responsive navigation,
 * skip-to-content accessibility target, and route dispatching across
 * Home, Explore, Random, Create, Guide, Details, and Auth tabs.
 */
function AppShell() {
  const location = useLocation();
  const reactNavigate = useNavigate();
  const { user } = useAuth();
  const [showTour, setShowTour] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  // Automatically launch onboarding tour on a user's first login (!user.onboardingDone)
  useEffect(() => {
    if (user && !user.onboardingDone && !sessionDismissed) {
      const timer = setTimeout(() => setShowTour(true), 150);
      return () => clearTimeout(timer);
    }
  }, [user, sessionDismissed]);

  // Compatible navigate handler supporting both hash-strings ('#/feed') and paths ('/feed')
  const navigate = (destination) => {
    if (typeof destination === 'string') {
      const path = destination.startsWith('#') ? destination.slice(1) : destination;
      reactNavigate(path);
      window.scrollTo(0, 0);
    } else {
      reactNavigate(destination);
    }
  };

  const currentRoute = '#' + (location.pathname === '/' ? '/home' : location.pathname);

  // Derive contextual page key for HelpPopover
  let pageKey = 'default';
  const path = location.pathname;
  if (path === '/' || path.startsWith('/home')) pageKey = 'home';
  else if (path.startsWith('/explore') || path.startsWith('/feed')) pageKey = 'explore';
  else if (path.startsWith('/random')) pageKey = 'random';
  else if (path.startsWith('/create')) pageKey = 'create';
  else if (path.startsWith('/post/')) pageKey = 'postDetail';
  else if (path.startsWith('/communities')) pageKey = 'communities';
  else if (path.startsWith('/c/')) pageKey = 'communityDetail';
  else if (path.startsWith('/profile') || path.startsWith('/user/')) pageKey = 'profile';
  else if (path.startsWith('/guide')) pageKey = 'guide';
  else if (path.startsWith('/settings')) pageKey = 'settings';
  else if (path.startsWith('/admin')) pageKey = 'admin';

  return (
    <div className="app-shell">
      <Navbar currentRoute={currentRoute} navigate={navigate} />
      <main id="main-content" className="main-content" tabIndex="-1">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="page-container" style={{ padding: '2rem 1rem' }}>
                <LoadingSkeleton count={3} type="card" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage navigate={navigate} />} />
              <Route path="/home" element={<HomePage navigate={navigate} />} />
              <Route path="/explore" element={<ExplorePage navigate={navigate} />} />
              <Route path="/feed" element={<ExplorePage navigate={navigate} />} />
              <Route path="/random" element={<RandomPage navigate={navigate} />} />
              <Route path="/create" element={<CreatePost navigate={navigate} />} />
              <Route path="/post/:id" element={<PostDetailRouteWrapper navigate={navigate} />} />
              <Route path="/communities" element={<CommunitiesPage navigate={navigate} />} />
              <Route path="/c/:slug" element={<CommunityDetailRouteWrapper navigate={navigate} />} />
              <Route path="/profile" element={<ProfilePage navigate={navigate} />} />
              <Route path="/user/:username" element={<ProfileRouteWrapper navigate={navigate} />} />
              <Route path="/guide" element={<GuidePage onOpenTour={() => setShowTour(true)} navigate={navigate} />} />
              <Route path="/settings" element={<SettingsPage navigate={navigate} />} />
              <Route path="/admin" element={<AdminPage navigate={navigate} />} />
              <Route path="/login" element={<Login navigate={navigate} />} />
              <Route path="/signup" element={<Signup navigate={navigate} />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Floating contextual help popover */}
      <HelpPopover pageKey={pageKey} onOpenTour={() => setShowTour(true)} />

      {/* Interactive 5-Step Scout Tour Modal */}
      <ScoutTourModal
        isOpen={showTour}
        onClose={() => {
          setShowTour(false);
          setSessionDismissed(true);
        }}
        onComplete={() => {
          setShowTour(false);
        }}
      />

      <footer className="footer" style={{ borderTop: '1px solid var(--border-subtle, #ECE7DF)', background: 'var(--bg-surface, #FFFFFF)', marginTop: 'auto' }}>
        <div className="footer-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '1.75rem 1.25rem' }}>
          <div className="footer-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1.15rem' }}>👁</span>
              <strong style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>OddSpot</strong>
              <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono, monospace)', background: 'var(--bg-elevated, #FFF7ED)', border: '1px solid var(--border-subtle, #ECE7DF)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)', fontWeight: 600 }}>
                v2.4-FIELD
              </span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #524C46)' }}>
              Oddspot · A location-based log of the weird, bizarre, and overlooked. All rights reserved.
            </p>
          </div>
          <div className="footer-links" style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem' }}>
            <a href="#/guide" style={{ color: 'var(--text-secondary, #524C46)', textDecoration: 'none' }}>Field Code of Conduct</a>
            <a href="#/settings" style={{ color: 'var(--text-secondary, #524C46)', textDecoration: 'none' }}>Contrast Verification</a>
            <a href="#/guide" style={{ color: 'var(--text-secondary, #524C46)', textDecoration: 'none' }}>API Spec</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <HashRouter>
            <AppShell />
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
