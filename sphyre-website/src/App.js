import React, { useState } from 'react';
import './App.css';
import { GradientText, GlowButton, AnimatedCard, ParticleBackground, FloatingCard } from './reactbits-patch';

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div className="App">
      {/* Header Section */}
      <header className="header">
        <div className="container header-container">
          <div className="logo">
            <h1 style={{ color: 'white' }}>Sphyre</h1>
          </div>
          
          <nav>
            <ul className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
              <li className="nav-item"><a href="#home" className="nav-link">Home</a></li>
              <li className="nav-item"><a href="#apps" className="nav-link">Applications</a></li>
              <li className="nav-item"><a href="#about" className="nav-link">About</a></li>
              <li className="nav-item"><a href="#contact" className="nav-link">Contact</a></li>
            </ul>
            <button className="mobile-menu-btn" onClick={toggleMenu}>
              {isMenuOpen ? '✕' : '☰'}
            </button>
          </nav>
        </div>
      </header>
      
      {/* Hero Section */}
      <section className="hero" id="home">
        <div className="particles-container">
          {/* Particle effect using CSS */}
        </div>
        <div className="container">
          <div className="hero-content">
            <GradientText
              text="Welcome to Sphyre Ecosystem"
              colors={['#0056b3', '#007bff', '#0056b3']}
              style={{ fontSize: '3rem', marginBottom: '20px', fontWeight: 'bold', color: 'white' }}
            />
            <p>
              A comprehensive digital identity and credential management platform
              that empowers users, issuers, and verifiers in the digital world.
            </p>
            <GlowButton 
              onClick={() => document.getElementById('apps').scrollIntoView({ behavior: 'smooth' })}
              style={{ marginTop: '20px' }}
            >
              Explore Our Applications
            </GlowButton>
          </div>
        </div>
      </section>
      
      {/* Apps Section */}
      <section className="apps-section" id="apps">
        <div className="container">
          <div className="section-title">
            <h2>Our Applications</h2>
            <p>
              The Sphyre ecosystem consists of three powerful applications designed
              to work together to provide a complete digital identity solution.
            </p>
          </div>

          <div className="apps-grid">
            {/* Sphyre App Card */}
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>Sphyre App</h3>
                <p>
                  The user-facing mobile application that allows individuals to
                  manage their digital identity, store credentials, and share
                  verified information securely.
                </p>
                <GlowButton onClick={() => window.open('https://sphyre-app.example.com', '_blank')}>
                  Launch Sphyre App
                </GlowButton>
              </div>
            </AnimatedCard>

            {/* Sphyre Issuers Card */}
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>Sphyre Issuers</h3>
                <p>
                  A platform for organizations to issue verifiable credentials
                  to users, manage credential templates, and revoke credentials
                  when necessary.
                </p>
                <GlowButton onClick={() => window.open('https://sphyre-issuers.example.com', '_blank')}>
                  Launch Sphyre Issuers
                </GlowButton>
              </div>
            </AnimatedCard>

            {/* Sphyre Verifier Card */}
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>Sphyre Verifier</h3>
                <p>
                  A solution for businesses and organizations to verify user
                  credentials quickly and securely without storing sensitive
                  personal data.
                </p>
                <GlowButton onClick={() => window.open('https://sphyre-verifier.example.com', '_blank')}>
                  Launch Sphyre Verifier
                </GlowButton>
              </div>
            </AnimatedCard>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="apps-section" id="about">
        <div className="particles-container" style={{ opacity: 0.3 }}></div>
        <div className="container">
          <div className="section-title">
            <h2>About Sphyre</h2>
            <p>
              Sphyre is revolutionizing digital identity management with blockchain
              technology and decentralized identity principles.
            </p>
          </div>
          
          <FloatingCard className="floating-card" style={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '30px',
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center'
          }}>
            <p style={{ marginBottom: '20px' }}>
              Our mission is to give individuals control over their digital identity
              while providing organizations with secure and efficient verification methods.
              Built on cutting-edge technology, Sphyre ensures privacy, security, and
              interoperability across the digital ecosystem.
            </p>
            <p>
              With Sphyre, users can store their credentials securely, share only what's
              necessary, and maintain complete control over their personal information.
              Organizations can issue tamper-proof credentials, and verifiers can instantly
              validate information without compromising user privacy.
            </p>
          </FloatingCard>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer" id="contact">
        <div className="container">
          <div className="footer-content">
            <div className="footer-column">
              <h3>Sphyre</h3>
              <ul className="footer-links">
                <li className="footer-link"><a href="#home">Home</a></li>
                <li className="footer-link"><a href="#apps">Applications</a></li>
                <li className="footer-link"><a href="#about">About</a></li>
                <li className="footer-link"><a href="#contact">Contact</a></li>
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
  );
}

export default App;
