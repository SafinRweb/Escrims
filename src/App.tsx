import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import RegisterOrganizer from './pages/RegisterOrganizer';
import CreateTournament from './pages/CreateTournament';
import TournamentView from './pages/TournamentView';
import AdminDashboard from './pages/AdminDashboard'; // Import AdminDashboard
import Rankings from './pages/Rankings';
import News from './pages/News';
import NewsDetail from './pages/NewsDetail';

import Dashboard from './pages/Dashboard'; // Import Dashboard

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<RegisterOrganizer />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create-tournament" element={<CreateTournament />} />
        <Route path="/tournament/:id" element={<TournamentView />} />
        <Route path="/admin" element={<AdminDashboard />} /> {/* New Admin Route */}

        <Route path="/ranking" element={<Rankings />} />
        <Route path="/news" element={<News />} />
        <Route path="/news/:id" element={<NewsDetail />} />
      </Routes>
    </Router>
  );
}

export default App;
