import React, { useState, useEffect } from 'react';
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
import { ExplorePage } from './pages/ExplorePage';
import { RandomPage } from './pages/RandomPage';
import { NearbyFeed } from './pages/NearbyFeed';
import { CreatePost } from './pages/CreatePost';
import { PostDetail } from './pages/PostDetail';
import { ProfilePage } from './pages/ProfilePage';
import GuidePage from './pages/GuidePage';
import SettingsPage from './pages/SettingsPage';
import CommunitiesPage from './pages/CommunitiesPage';
import CommunityDetailPage from './pages/CommunityDetailPage';
import AdminPage from './pages/AdminPage';
import ScoutTourModal from './components/onboarding/ScoutTourModal';
import HelpPopover from './components/onboarding/HelpPopover';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import './App.css';

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
      setShowTour(true);
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

      <footer className="footer">
        <p>Oddspot · A location-based log of the weird, bizarre, and overlooked.</p>
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
