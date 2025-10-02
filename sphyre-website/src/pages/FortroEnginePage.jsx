import React from 'react';
import { GradientText, GlowButton, AnimatedCard, FloatingCard } from '../reactbits-patch';

function FortroEnginePage() {
  return (
    <section className="fortro-engine-section">
      <div className="particles-container" style={{ opacity: 0.4 }}>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>
      <div className="container">
        <div className="section-title">
          <GradientText
            text="Fortro Engine"
            colors={['#0056b3', '#00a8ff', '#0056b3']}
            style={{ fontSize: '3rem', marginBottom: '20px', fontWeight: 'bold', color: 'white' }}
          />
          <p>
            The powerful backend technology that powers the entire Sphyre ecosystem
          </p>
        </div>
        
        <div className="fortro-hero">
          <div className="fortro-image">
            <img src="/assets/sphyre-logo.svg" alt="Fortro Engine Architecture" className="fortro-diagram" />
          </div>
          <div className="fortro-description">
            <p>
              Fortro Engine is our state-of-the-art backend technology that provides the foundation
              for the entire Sphyre ecosystem. Built with security, scalability, and interoperability
              in mind, it ensures seamless credential management across all our applications.
            </p>
            <p>
              With its advanced cryptographic capabilities and blockchain integration, Fortro Engine
              enables secure issuance, storage, and verification of digital credentials while
              maintaining user privacy and control.
            </p>
          </div>
        </div>
        
        <div className="features-section">
          <h2>Key Features</h2>
          
          <div className="features-grid">
            <AnimatedCard className="feature-card">
              <div className="feature-icon security-icon"></div>
              <h3>Advanced Security</h3>
              <p>
                End-to-end encryption, secure key management, and tamper-proof credential storage
                ensure the highest level of security for all digital identities and credentials.
              </p>
            </AnimatedCard>
            
            <AnimatedCard className="feature-card">
              <div className="feature-icon scalability-icon"></div>
              <h3>Enterprise Scalability</h3>
              <p>
                Built on a microservices architecture, Fortro Engine can handle millions of
                credentials and thousands of transactions per second with minimal latency.
              </p>
            </AnimatedCard>
            
            <AnimatedCard className="feature-card">
              <div className="feature-icon interoperability-icon"></div>
              <h3>Interoperability</h3>
              <p>
                Supports multiple credential formats and standards including W3C Verifiable
                Credentials, OpenID Connect, and DID methods for maximum compatibility.
              </p>
            </AnimatedCard>
            
            <AnimatedCard className="feature-card">
              <div className="feature-icon blockchain-icon"></div>
              <h3>Blockchain Integration</h3>
              <p>
                Optional blockchain anchoring for enhanced security and auditability, with
                support for multiple blockchain networks including Ethereum and Hyperledger.
              </p>
            </AnimatedCard>
            
            <AnimatedCard className="feature-card">
              <div className="feature-icon privacy-icon"></div>
              <h3>Privacy by Design</h3>
              <p>
                Zero-knowledge proofs and selective disclosure capabilities allow users to
                share only the necessary information without revealing sensitive data.
              </p>
            </AnimatedCard>
            
            <AnimatedCard className="feature-card">
              <div className="feature-icon api-icon"></div>
              <h3>Comprehensive APIs</h3>
              <p>
                Well-documented RESTful APIs and SDKs for easy integration with existing
                systems and third-party applications.
              </p>
            </AnimatedCard>
          </div>
        </div>
        
        <FloatingCard className="technical-specs" style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '10px',
          padding: '30px',
          margin: '50px 0'
        }}>
          <h2>Technical Specifications</h2>
          
          <div className="specs-grid">
            <div className="spec-item">
              <h4>Architecture</h4>
              <p>Microservices-based with containerized deployment</p>
            </div>
            
            <div className="spec-item">
              <h4>Data Storage</h4>
              <p>Distributed database with encrypted data partitioning</p>
            </div>
            
            <div className="spec-item">
              <h4>Authentication</h4>
              <p>Multi-factor authentication with biometric support</p>
            </div>
            
            <div className="spec-item">
              <h4>Cryptography</h4>
              <p>ECC, RSA, and post-quantum cryptographic algorithms</p>
            </div>
            
            <div className="spec-item">
              <h4>API Protocols</h4>
              <p>REST, GraphQL, and gRPC</p>
            </div>
            
            <div className="spec-item">
              <h4>Deployment Options</h4>
              <p>Cloud, on-premises, or hybrid</p>
            </div>
          </div>
        </FloatingCard>
        
        <div className="integration-section">
          <h2>Integration with Sphyre Applications</h2>
          
          <div className="integration-content">
            <p>
              Fortro Engine seamlessly integrates with all Sphyre applications, providing a
              unified backend for credential management across the entire ecosystem:
            </p>
            
            <ul className="integration-list">
              <li>
                <strong>Sphyre App:</strong> Securely stores user credentials and manages digital identities
              </li>
              <li>
                <strong>Sphyre Issuers:</strong> Enables organizations to create and issue verifiable credentials
              </li>
              <li>
                <strong>Sphyre Verifier:</strong> Allows businesses to verify credentials without compromising privacy
              </li>
            </ul>
            
            <div className="cta-buttons">
              <GlowButton 
                onClick={() => window.open('https://docs.fortro.io', '_blank')}
                style={{ marginRight: '20px' }}
              >
                Technical Documentation
              </GlowButton>
              
              <GlowButton 
                onClick={() => window.location.href = '/contact'}
              >
                Request API Access
              </GlowButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default FortroEnginePage;