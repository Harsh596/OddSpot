import React from 'react';
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
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { RandomPage } from './pages/RandomPage';
import { NearbyFeed } from './pages/NearbyFeed';
import { CreatePost } from './pages/CreatePost';
import { PostDetail } from './pages/PostDetail';
import { ProfilePage } from './pages/ProfilePage';
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
 * Route wrapper extracting username param for ProfilePage
 */
function ProfileRouteWrapper({ navigate }) {
  const { username } = useParams();
  return <ProfilePage username={username} navigate={navigate} />;
}


/**
 * Main application shell containing responsive navigation,
 * skip-to-content accessibility target, and route dispatching across
 * Home, Explore, Random, Create, Details, and Auth tabs.
 */
function AppShell() {
  const location = useLocation();
  const reactNavigate = useNavigate();

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
            <Route path="/profile" element={<ProfilePage navigate={navigate} />} />
            <Route path="/user/:username" element={<ProfileRouteWrapper navigate={navigate} />} />
            <Route path="/login" element={<Login navigate={navigate} />} />
            <Route path="/signup" element={<Signup navigate={navigate} />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
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
