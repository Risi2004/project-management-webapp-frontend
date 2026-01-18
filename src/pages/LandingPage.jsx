import { useNavigate } from 'react-router-dom';
import '../App.css';
import heroImage from '../assets/hero_dashboard.png';
import ThemeToggle from '../components/ThemeToggle';

function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="app-container">
            {/* Header */}
            <header className="header">
                <div className="container nav">
                    <div className="logo">
                        <span>🔹</span> Nexus
                    </div>
                    <ul className="nav-links">
                        <li><a href="#features" className="nav-link">Features</a></li>
                        <li><a href="#solutions" className="nav-link">Solutions</a></li>
                        <li><a href="#about" className="nav-link">About</a></li>
                    </ul>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <ThemeToggle />
                        <button className="btn-secondary" onClick={() => navigate('/login')}>Login</button>
                        <button className="btn-primary" onClick={() => navigate('/signup')}>Get Started</button>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="hero">
                <div className="hero-glow"></div>
                <div className="container">
                    <div className="hero-content animate-fade-up">
                        <span className="hero-badge">New: AI-Powered Insights 🚀</span>
                        <h1>
                            Manage Projects <br />
                            <span>At Warp Speed</span>
                        </h1>
                        <p>
                            The all-in-one workspace for your team. Plan, track, and release world-class software directly from your workspace.
                        </p>
                        <div className="hero-actions">
                            <button className="btn-primary" onClick={() => navigate('/signup')}>Start for free</button>
                            <button className="btn-secondary">View Demo</button>
                        </div>
                    </div>

                    <div className="hero-image-container animate-fade-up" style={{ animationDelay: '0.2s' }}>
                        <img src={heroImage} alt="Dashboard Preview" className="hero-image" />
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="features" id="features">
                <div className="container">
                    <div className="section-title">
                        <h2>Everything you need to ship faster</h2>
                        <p>Powerful features built for modern product teams.</p>
                    </div>

                    <div className="features-grid">
                        <FeatureCard
                            icon="📊"
                            title="Advanced Analytics"
                            description="Gain insights into your team's velocity and identify bottlenecks before they happen."
                        />
                        <FeatureCard
                            icon="🎯"
                            title="Goal Tracking"
                            description="Set clear objectives and track your progress in real-time with visual dashboards."
                        />
                        <FeatureCard
                            icon="⚡"
                            title="Automated Workflows"
                            description="Automate repetitive tasks and focus on what matters most - building great products."
                        />
                        <FeatureCard
                            icon="🔄"
                            title="Real-time Sync"
                            description="Collaborate in real-time. Changes are instantly reflected across all devices."
                        />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="container">
                    <p>&copy; 2026 Nexus Inc. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, description }) {
    return (
        <div className="feature-card">
            <div className="feature-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{description}</p>
        </div>
    );
}

export default LandingPage;
