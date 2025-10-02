import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ApplicationsPage from './pages/ApplicationsPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import FortroEnginePage from './pages/FortroEnginePage';
import { useState } from 'react';
import './App.css';

function AppRouter() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <Router>
      <div className="App">
        {/* Header Section */}
        <header className="header">
          <div className="container header-container">
            <div className="logo">
              <Link to="/">
                <h1 style={{ color: 'white' }}>Sphyre</h1>
              </Link>
            </div>
            
            <nav>
              <ul className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
                <li className="nav-item"><Link to="/applications" className="nav-link" onClick={() => setIsMenuOpen(false)}>Applications</Link></li>
                <li className="nav-item"><Link to="/about" className="nav-link" onClick={() => setIsMenuOpen(false)}>About</Link></li>
                <li className="nav-item"><Link to="/contact" className="nav-link" onClick={() => setIsMenuOpen(false)}>Contact</Link></li>
                <li className="nav-item"><Link to="/fortro-engine" className="nav-link" onClick={() => setIsMenuOpen(false)}>Fortro Engine</Link></li>
              </ul>
              <button className="mobile-menu-btn" onClick={toggleMenu}>
                {isMenuOpen ? '✕' : '☰'}
              </button>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/fortro-engine" element={<FortroEnginePage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-column">
                <h3>Sphyre</h3>
                <ul className="footer-links">
                  <li className="footer-link"><Link to="/">Home</Link></li>
                  <li className="footer-link"><Link to="/applications">Applications</Link></li>
                  <li className="footer-link"><Link to="/about">About</Link></li>
                  <li className="footer-link"><Link to="/contact">Contact</Link></li>
                  <li className="footer-link"><Link to="/fortro-engine">Fortro Engine</Link></li>
                </ul>
              </div>
              
              <div className="footer-column">
                <h3>Applications</h3>
                <ul className="footer-links">
                  <li className="footer-link"><a href="https://sphyre-app.example.com" target="_blank" rel="noopener noreferrer">Sphyre App</a></li>
                  <li className="footer-link"><a href="https://sphyre-issuers.example.com" target="_blank" rel="noopener noreferrer">Sphyre Issuers</a></li>
                  <li className="footer-link"><a href="https://sphyre-verifier.example.com" target="_blank" rel="noopener noreferrer">Sphyre Verifier</a></li>
                </ul>
              </div>
              
              <div className="footer-column">
                <h3>Resources</h3>
                <ul className="footer-links">
                  <li className="footer-link"><a href="https://docs.sphyre.example.com" target="_blank" rel="noopener noreferrer">Documentation</a></li>
                  <li className="footer-link"><a href="https://api.sphyre.example.com" target="_blank" rel="noopener noreferrer">API Reference</a></li>
                  <li className="footer-link"><a href="https://support.sphyre.example.com" target="_blank" rel="noopener noreferrer">Support</a></li>
                </ul>
              </div>
              
              <div className="footer-column">
                <h3>Contact Us</h3>
                <ul className="footer-links">
                  <li className="footer-link"><a href="mailto:info@sphyre.io">info@sphyre.io</a></li>
                  <li className="footer-link"><a href="tel:+1234567890">+1 (234) 567-890</a></li>
                </ul>
              </div>
            </div>
            
            <div className="footer-bottom">
              <p>&copy; {new Date().getFullYear()} Sphyre. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default AppRouter;