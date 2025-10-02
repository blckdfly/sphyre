import React, { useState } from 'react';
import { GlowButton, FloatingCard } from '../reactbits-patch';

function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [formSubmitted, setFormSubmitted] = useState(false);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real application, you would send the form data to a server here
    console.log('Form submitted:', formData);
    setFormSubmitted(true);
    
    // Reset form after submission
    setTimeout(() => {
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: ''
      });
      setFormSubmitted(false);
    }, 3000);
  };
  
  return (
    <section className="contact-section" id="contact">
      <div className="container">
        <div className="section-title">
          <h2>Contact Us</h2>
          <p>
            Have questions about Sphyre or want to learn more about our solutions?
            Get in touch with our team.
          </p>
        </div>
        
        <div className="contact-grid">
          <div className="contact-info">
            <FloatingCard className="contact-card" style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '30px',
              height: '100%'
            }}>
              <h3>Get In Touch</h3>
              <div className="contact-item">
                <i className="contact-icon email-icon"></i>
                <div>
                  <h4>Email</h4>
                  <p><a href="mailto:info@sphyre.io">info@sphyre.io</a></p>
                </div>
              </div>
              
              <div className="contact-item">
                <i className="contact-icon phone-icon"></i>
                <div>
                  <h4>Phone</h4>
                  <p><a href="tel:+1234567890">+1 (234) 567-890</a></p>
                </div>
              </div>
              
              <div className="contact-item">
                <i className="contact-icon location-icon"></i>
                <div>
                  <h4>Office</h4>
                  <p>123 Tech Plaza, Innovation District<br />San Francisco, CA 94105</p>
                </div>
              </div>
              
              <div className="social-links">
                <a href="https://twitter.com/sphyre" target="_blank" rel="noopener noreferrer" className="social-link">
                  <i className="social-icon twitter-icon"></i>
                </a>
                <a href="https://linkedin.com/company/sphyre" target="_blank" rel="noopener noreferrer" className="social-link">
                  <i className="social-icon linkedin-icon"></i>
                </a>
                <a href="https://github.com/sphyre" target="_blank" rel="noopener noreferrer" className="social-link">
                  <i className="social-icon github-icon"></i>
                </a>
              </div>
            </FloatingCard>
          </div>
          
          <div className="contact-form-container">
            <FloatingCard className="form-card" style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '30px',
              height: '100%'
            }}>
              <h3>Send Us a Message</h3>
              {formSubmitted ? (
                <div className="success-message">
                  <p>Thank you for your message! We'll get back to you soon.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="contact-form">
                  <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="subject">Subject</label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="message">Message</label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      className="form-control"
                      rows="5"
                    ></textarea>
                  </div>
                  
                  <GlowButton type="submit" style={{ width: '100%' }}>
                    Send Message
                  </GlowButton>
                </form>
              )}
            </FloatingCard>
          </div>
        </div>
        
        <div className="fortro-support">
          <h3>Technical Support</h3>
          <p>
            For technical questions about Fortro Engine integration or API access,
            please contact our developer support team.
          </p>
          <GlowButton 
            onClick={() => window.location.href = '/fortro-engine'}
            style={{ marginTop: '20px' }}
          >
            Fortro Engine Documentation
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default ContactPage;