import React from 'react';
import { GradientText, GlowButton, AnimatedCard, ScrollReveal, AnimatedContent } from '../reactbits-patch';

function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="hero" id="home">
        <div className="particles-container">
          {/* Particle effect using CSS */}
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
          <div className="particle"></div>
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
                onClick={() => window.location.href = '/applications'}
                style={{ marginTop: '20px' }}
              >
                Explore Our Applications
              </GlowButton>
          </div>
        </div>
      </section>
      
      {/* Introduction to Fortro Engine */}
      <section className="fortro-intro">
        <div className="container">
          <div className="section-title">
            <h2>Powered by Fortro Engine</h2>
            <p>
              The backbone of our secure and scalable digital identity ecosystem
            </p>
          </div>
          
          <div className="fortro-content">
            <div className="fortro-image">
              <img src="/assets/sphyre-logo.svg" alt="Fortro Engine" className="fortro-logo" />
            </div>
            <div className="fortro-text">
              <p>
                Fortro Engine is our state-of-the-art backend technology that powers the entire Sphyre ecosystem.
                Built with security, scalability, and interoperability in mind, it ensures seamless credential
                management across all our applications.
              </p>
              <GlowButton 
                onClick={() => window.location.href = '/fortro-engine'}
                style={{ marginTop: '20px' }}
              >
                Learn More About Fortro Engine
              </GlowButton>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="features-section">
        <div className="container">
          <ScrollReveal>
            <div className="section-title">
              <h2>Key Features</h2>
              <p>Discover what makes Sphyre the leading platform for digital identity management</p>
            </div>
          </ScrollReveal>
          
          <div className="apps-grid">
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>Secure Identity Verification</h3>
                <p>
                  Our advanced verification protocols ensure that digital identities are secure, 
                  tamper-proof, and compliant with global standards. Protect your digital presence 
                  with military-grade encryption and blockchain technology.
                </p>
              </div>
            </AnimatedCard>
            
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>Seamless Integration</h3>
                <p>
                  Integrate Sphyre with your existing systems effortlessly. Our API-first approach 
                  allows for easy implementation across various platforms, reducing development time 
                  and ensuring compatibility with your current infrastructure.
                </p>
              </div>
            </AnimatedCard>
            
            <AnimatedCard className="app-card">
              <div className="app-card-content">
                <h3>User-Centric Design</h3>
                <p>
                  Put users in control of their digital identities. Our intuitive interface allows 
                  individuals to manage their credentials, control data sharing, and monitor access 
                  to their information with complete transparency.
                </p>
              </div>
            </AnimatedCard>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="use-cases-section">
        <div className="container">
          <ScrollReveal>
            <div className="section-title">
              <h2>Real-World Applications</h2>
              <p>See how Sphyre is transforming digital identity across industries</p>
            </div>
          </ScrollReveal>
          
          <div className="use-cases-container">
            <AnimatedContent style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="use-case-item">
                <div className="use-case-image">
                  <img 
                    src="https://images.unsplash.com/photo-1573164713988-8665fc963095?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
                    alt="Healthcare" 
                  />
                </div>
                <div className="use-case-content">
                  <h3>Healthcare</h3>
                  <p>
                    Secure patient records, streamline credential verification for healthcare professionals, 
                    and enable seamless sharing of medical information between authorized providers. Sphyre 
                    ensures HIPAA compliance while improving patient care through better data accessibility.
                  </p>
                </div>
              </div>
              
              <div className="use-case-item">
                <div className="use-case-content">
                  <h3>Financial Services</h3>
                  <p>
                    Simplify KYC processes, prevent fraud, and enhance customer onboarding experiences. 
                    Our platform reduces verification time from days to minutes while maintaining the 
                    highest security standards required by financial regulations worldwide.
                  </p>
                </div>
                <div className="use-case-image">
                  <img 
                    src="https://images.unsplash.com/photo-1563986768609-322da13575f3?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
                    alt="Financial Services" 
                  />
                </div>
              </div>
              
              <div className="use-case-item">
                <div className="use-case-image">
                  <img 
                    src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" 
                    alt="Education" 
                  />
                </div>
                <div className="use-case-content">
                  <h3>Education</h3>
                  <p>
                    Issue, verify, and share academic credentials instantly. Educational institutions can 
                    eliminate certificate fraud, reduce administrative overhead, and provide students with 
                    portable digital credentials that can be shared with employers or other institutions.
                  </p>
                </div>
              </div>
            </AnimatedContent>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials-section">
        <div className="container">
          <ScrollReveal>
            <div className="section-title">
              <h2>What Our Clients Say</h2>
              <p>Trusted by leading organizations worldwide</p>
            </div>
          </ScrollReveal>
          
          <div className="testimonials-grid">
            <AnimatedCard className="testimonial-card">
              <div className="testimonial-content">
                <div className="testimonial-quote">
                  <p>
                    "Implementing Sphyre has revolutionized our identity verification process. 
                    What used to take days now happens in seconds, and our customers love the 
                    seamless experience."
                  </p>
                </div>
                <div className="testimonial-author">
                  <img 
                    src="https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80" 
                    alt="Sarah Johnson" 
                    className="author-image" 
                  />
                  <div className="author-info">
                    <h4>Sarah Johnson</h4>
                    <p>CTO, Global Finance Corp</p>
                  </div>
                </div>
              </div>
            </AnimatedCard>
            
            <AnimatedCard className="testimonial-card">
              <div className="testimonial-content">
                <div className="testimonial-quote">
                  <p>
                    "The security features of Sphyre are unmatched. As a healthcare provider, 
                    protecting patient data is our top priority, and Sphyre delivers peace of 
                    mind with its robust security architecture."
                  </p>
                </div>
                <div className="testimonial-author">
                  <img 
                    src="https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80" 
                    alt="David Chen" 
                    className="author-image" 
                  />
                  <div className="author-info">
                    <h4>David Chen</h4>
                    <p>CISO, MedTech Innovations</p>
                  </div>
                </div>
              </div>
            </AnimatedCard>
            
            <AnimatedCard className="testimonial-card">
              <div className="testimonial-content">
                <div className="testimonial-quote">
                  <p>
                    "Our university reduced credential fraud by 98% after implementing Sphyre. 
                    The platform's ease of use and powerful verification capabilities have made 
                    it an essential part of our digital transformation."
                  </p>
                </div>
                <div className="testimonial-author">
                  <img 
                    src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80" 
                    alt="Elena Rodriguez" 
                    className="author-image" 
                  />
                  <div className="author-info">
                    <h4>Elena Rodriguez</h4>
                    <p>Dean of Digital Innovation, University of Technology</p>
                  </div>
                </div>
              </div>
            </AnimatedCard>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="cta-section">
        <div className="container">
          <AnimatedContent style={{ textAlign: 'center' }}>
            <h2>Ready to Transform Your Digital Identity Management?</h2>
            <p>
              Join thousands of organizations that trust Sphyre for secure, efficient, and 
              user-friendly digital identity solutions. Our team of experts is ready to help 
              you implement a customized solution for your specific needs.
            </p>
            <div className="cta-buttons">
              <GlowButton 
                onClick={() => window.location.href = '/contact'}
                style={{ marginRight: '15px' }}
              >
                Request a Demo
              </GlowButton>
              <GlowButton 
                onClick={() => window.location.href = '/documentation'}
                style={{ backgroundColor: 'transparent', border: '2px solid #0056b3' }}
              >
                View Documentation
              </GlowButton>
            </div>
            <div className="cta-image">
              <img 
                src="https://images.unsplash.com/photo-1551434678-e076c223a692?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" 
                alt="Team collaboration" 
              />
            </div>
          </AnimatedContent>
        </div>
      </section>
    </>
  );
}

export default HomePage;