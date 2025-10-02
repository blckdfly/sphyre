import React from 'react';
import { FloatingCard, GlowButton } from '../reactbits-patch';

function AboutPage() {
  return (
    <section className="about-section" id="about">
      <div className="particles-container" style={{ opacity: 0.3 }}>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>
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
          margin: '0 auto 40px',
          textAlign: 'center'
        }}>
          <h3>Our Mission</h3>
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

        <div className="about-grid">
          <FloatingCard className="about-card" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '25px',
            textAlign: 'left'
          }}>
            <h3>Our Vision</h3>
            <p>
              We envision a world where digital identity is secure, portable, and 
              user-controlled. Where individuals can seamlessly prove who they are 
              without compromising their privacy or security.
            </p>
          </FloatingCard>

          <FloatingCard className="about-card" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '25px',
            textAlign: 'left'
          }}>
            <h3>Our Values</h3>
            <ul className="values-list">
              <li><strong>Privacy:</strong> We believe in privacy by design</li>
              <li><strong>Security:</strong> We never compromise on security</li>
              <li><strong>User Control:</strong> Your data belongs to you</li>
              <li><strong>Innovation:</strong> We constantly push boundaries</li>
            </ul>
          </FloatingCard>

          <FloatingCard className="about-card" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '25px',
            textAlign: 'left'
          }}>
            <h3>Our Technology</h3>
            <p>
              Powered by the Fortro Engine backend, our platform leverages blockchain 
              technology, cryptographic proofs, and decentralized identifiers to create 
              a secure and interoperable identity ecosystem.
            </p>
            <GlowButton 
              onClick={() => window.location.href = '/fortro-engine'}
              style={{ marginTop: '15px' }}
            >
              Learn About Fortro Engine
            </GlowButton>
          </FloatingCard>
        </div>

        <div className="team-section">
          <h3>Our Team</h3>
          <p>
            Sphyre is built by a team of passionate experts in cryptography, 
            blockchain technology, and digital identity. We're committed to 
            creating a more secure and user-centric digital world.
          </p>
          <GlowButton 
            onClick={() => window.location.href = '/contact'}
            style={{ marginTop: '20px' }}
          >
            Contact Our Team
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default AboutPage;