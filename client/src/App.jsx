import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Home from './pages/Home/Home.jsx';
import AllPolls from './pages/Polls/AllPolls.jsx';
import PollDetail from './pages/Polls/PollDetail.jsx';
import FanProjects from './pages/FanProjects/FanProjects.jsx';
import Community from './pages/Community/Community.jsx';
import Market from './pages/Market/Market.jsx';
import Rewards from './pages/Rewards/Rewards.jsx';
import ChikaArticle from './pages/Chika/ChikaArticle.jsx';
import Login from './pages/Login/Login.jsx';
import Profile from './pages/Profile/Profile.jsx';
import EditProfile from './pages/Profile/EditProfile/EditProfile.jsx';
import Transactions from './pages/Transactions/Transactions.jsx';
import Settings from './pages/Settings/Settings.jsx';
import ForgotPassword from './pages/ForgotPassword/ForgotPassword.jsx';
import SignUp from './pages/SignUp/SignUp.jsx';
import Placeholder from './pages/Placeholder/Placeholder.jsx';
import Admin from './pages/Admin/Admin.jsx';
import Landing from './pages/Landing/Landing.jsx';
import Atmosphere from './components/Atmosphere/Atmosphere';
import ScrollProgress from './components/ScrollProgress/ScrollProgress';
import Tutorial from './components/Tutorial/Tutorial';
import useUser from './hooks/useUser';
import { isAdminUser, isArtistUser } from './api';
import './App.css';

// Notifications are a popup now. An old /notifications link goes home and opens it.
function OpenNotifications() {
  useEffect(() => { window.dispatchEvent(new Event('juancast-open-notifications')); }, []);
  return <Navigate to="/" replace />;
}

// Artist accounts have no currency, rewards or market: those pages send them home.
function NoArtists({ children }) {
  const user = useUser();
  return isArtistUser(user) ? <Navigate to="/" replace /> : children;
}

function Shell() {
  const { pathname } = useLocation();
  const user = useUser();
  // Group Admins, System Admins and Super Admins only get their own dashboard, never the user-facing pages
  const staff = isAdminUser(user);
  // the landing page is full-screen: no navbar or shared backdrop
  const bare = pathname === '/landing';

  // new page starts at the top
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  if (staff && pathname !== '/admin' && pathname !== '/login') return <Navigate to="/admin" replace />;

  return (
    <>
      {/* The navbar lives outside <Routes>, so it never reloads and the white bubble can slide */}
      {!bare && !staff && <Navbar />}
      {!bare && <ScrollProgress />}
      {/* Home gets its glow from the hero banner; every other page gets the shared one */}
      {!bare && <Atmosphere />}
      {!bare && !staff && <Tutorial />}
      {/* key = pathname re-runs the fade-in on every page change */}
      <div className="page" key={pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/polls" element={<AllPolls />} />
          <Route path="/polls/fan-projects" element={<FanProjects />} />
          <Route path="/polls/:id" element={<PollDetail />} />
          <Route path="/vote" element={<Navigate to="/polls" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/chika/:id" element={<ChikaArticle />} />
          <Route path="/market" element={<NoArtists><Market /></NoArtists>} />
          <Route path="/rewards" element={<NoArtists><Rewards /></NoArtists>} />
          <Route path="/notifications" element={<OpenNotifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<EditProfile />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/transactions" element={<NoArtists><Transactions /></NoArtists>} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Placeholder title="Page not found" />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
