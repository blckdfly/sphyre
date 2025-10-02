import React from 'react';
import { GlowButton, AnimatedCard } from '../reactbits-patch';

function ApplicationsPage() {
  return (
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
              <ul className="feature-list">
                <li>Secure credential storage</li>
                <li>Biometric authentication</li>
                <li>Selective disclosure of information</li>
                <li>QR code scanning for verification</li>
              </ul>
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
              <ul className="feature-list">
                <li>Credential template management</li>
                <li>Batch issuance capabilities</li>
                <li>Revocation management</li>
                <li>Audit logging and reporting</li>
              </ul>
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
              <ul className="feature-list">
                <li>Real-time credential verification</li>
                <li>Customizable verification rules</li>
                <li>Privacy-preserving verification</li>
                <li>Integration with existing systems</li>
              </ul>
              <GlowButton onClick={() => window.open('https://sphyre-verifier.example.com', '_blank')}>
                Launch Sphyre Verifier
              </GlowButton>
            </div>
          </AnimatedCard>
        </div>
        
        <div className="fortro-integration">
          <h3>Powered by Fortro Engine</h3>
          <p>
            All Sphyre applications are seamlessly integrated with our Fortro Engine backend,
            ensuring secure, reliable, and efficient credential management across the ecosystem.
          </p>
          <GlowButton 
            onClick={() => window.location.href = '/fortro-engine'}
            style={{ marginTop: '20px' }}
          >
            Learn About Fortro Engine
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default ApplicationsPage;