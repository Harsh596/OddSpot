import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { NearbyFeed } from './pages/NearbyFeed';
import { CreatePost } from './pages/CreatePost';
import { PostDetail } from './pages/PostDetail';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import './App.css';

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash || '#/feed');

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || '#/feed');
      window.scrollTo(0, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.location.hash = '#/feed';
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (newHash) => {
    window.location.hash = newHash;
  };

  const renderContent = () => {
    if (route.startsWith('#/post/')) {
      const postId = route.replace('#/post/', '').split('?')[0];
      return <PostDetail postId={postId} navigate={navigate} />;
    }

    switch (route) {
      case '#/create':
        return <CreatePost navigate={navigate} />;
      case '#/login':
        return <Login navigate={navigate} />;
      case '#/signup':
        return <Signup navigate={navigate} />;
      case '#/feed':
      default:
        return <NearbyFeed navigate={navigate} />;
    }
  };

  return (
    <AuthProvider>
      <div className="app-shell">
        <Navbar currentRoute={route} navigate={navigate} />
        <main className="main-content">{renderContent()}</main>
        <footer className="footer">
          <p>Oddspot · A location-based log of the weird, bizarre, and overlooked.</p>
        </footer>
      </div>
    </AuthProvider>
  );
}
