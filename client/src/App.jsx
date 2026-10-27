import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Home from './pages/Home/Home.jsx';
import AllPolls from './pages/Polls/AllPolls.jsx';
import PollDetail from './pages/Polls/PollDetail.jsx';
import Community from './pages/Community/Community.jsx';
import Market from './pages/Market/Market.jsx';
import Login from './pages/Login/Login.jsx';
import Profile from './pages/Profile/Profile.jsx';
import EditProfile from './pages/Profile/EditProfile/EditProfile.jsx';
import Transactions from './pages/Transactions/Transactions.jsx';
import Settings from './pages/Settings/Settings.jsx';
import ForgotPassword from './pages/ForgotPassword/ForgotPassword.jsx';
import SignUp from './pages/SignUp/SignUp.jsx';
import Placeholder from './pages/Placeholder/Placeholder.jsx';
import Atmosphere from './components/Atmosphere/Atmosphere';
import ScrollProgress from './components/ScrollProgress/ScrollProgress';
import './App.css';

function Shell() {
  const { pathname } = useLocation();

  // new page starts at the top
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      {/* The navbar lives outside <Routes>, so it never reloads and the white bubble can slide */}
      <Navbar />
      <ScrollProgress />
      {/* Home gets its glow from the hero banner; every other page gets the shared one */}
      <Atmosphere />
      {/* key = pathname re-runs the fade-in on every page change */}
      <div className="page" key={pathname}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/polls" element={<AllPolls />} />
          <Route path="/polls/:id" element={<PollDetail />} />
          <Route path="/vote" element={<Navigate to="/polls" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/community" element={<Community />} />
          <Route path="/market" element={<Market />} />
          <Route path="/notifications" element={<Placeholder title="Notifications" />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<EditProfile />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/settings/*" element={<Settings />} />
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
