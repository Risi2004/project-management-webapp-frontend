import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { auth, db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import LandingPage from './pages/LandingPage';
import Signup from './pages/Signup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectWorkspace from './pages/ProjectWorkspace';
import './App.css';

import { ThemeProvider } from './context/ThemeContext';

function App() {
  useEffect(() => {
    let interval;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const setStatus = (status) => {
          updateDoc(userRef, {
            isOnline: status,
            lastSeen: serverTimestamp()
          }).catch(err => console.error("Error updating presence:", err));
        };

        setStatus(true);
        interval = setInterval(() => setStatus(true), 60000); // 1-minute heartbeat
      }
    });

    return () => {
      unsubscribe();
      if (interval) clearInterval(interval);
      if (auth.currentUser) {
        // Attempt to set offline on unmount/reload
        updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false }).catch(() => { });
        // Note: This cleanup might not always run solely on tab close, but works for navigation/unmount
      }
    };
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:projectId" element={<ProjectWorkspace />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
