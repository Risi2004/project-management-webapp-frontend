import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaGoogle } from 'react-icons/fa';
import { signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from '../firebase';
import '../App.css';

const Login = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const [showResetModal, setShowResetModal] = useState(false);
    const [resetEmail, setResetEmail] = useState('');

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
            console.log('User logged in:', userCredential.user);
            navigate('/dashboard'); // Redirect to dashboard/home after login
        } catch (err) {
            console.error(err);
            setError("Invalid email or password.");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            setLoading(true);
            setError('');
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Check if user exists in Firestore, if not create them
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    uid: user.uid,
                    name: user.displayName,
                    email: user.email,
                    createdAt: new Date().toISOString()
                });
            }

            navigate('/dashboard');
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPasswordClick = () => {
        setShowResetModal(true);
        setMessage('');
        setError('');
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        if (!resetEmail) {
            setError("Please enter your email address.");
            return;
        }

        try {
            setLoading(true);
            setError('');
            setMessage('');
            await sendPasswordResetEmail(auth, resetEmail);
            setMessage("Password reset email sent! Check your inbox.");
            setTimeout(() => {
                setShowResetModal(false);
                setMessage('');
            }, 3000);
        } catch (err) {
            console.error(err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card animate-fade-up">
                <div className="logo auth-logo">
                    <span>🔹</span> Nexus
                </div>
                <h2>Welcome back</h2>
                <p className="auth-subtitle">Enter your details to access your workspace.</p>

                {error && !showResetModal && <div style={{ color: '#ec4899', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
                {message && !showResetModal && <div style={{ color: '#10b981', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>{message}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            placeholder="john@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={handleForgotPasswordClick} className="forgot-password" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>
                            Forgot password?
                        </button>
                    </div>

                    <button type="submit" className="btn-primary btn-block" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                <div className="divider">
                    <span>or continue with</span>
                </div>

                <button onClick={handleGoogleSignIn} className="btn-secondary btn-block social-btn" disabled={loading}>
                    <FaGoogle /> Sign in with Google
                </button>

                <p className="auth-footer">
                    Don't have an account? <Link to="/signup">Sign up</Link>
                </p>
            </div>

            {showResetModal && (
                <div className="modal-overlay">
                    <div className="auth-card animate-fade-up" style={{ maxWidth: '400px' }}>
                        <h2>Reset Password</h2>
                        <p className="auth-subtitle">Enter your email to receive a reset link.</p>

                        {error && <div style={{ color: '#ec4899', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
                        {message && <div style={{ color: '#10b981', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>{message}</div>}

                        <form onSubmit={handleResetSubmit} className="auth-form">
                            <div className="form-group">
                                <label htmlFor="resetEmail">Email Address</label>
                                <input
                                    type="email"
                                    id="resetEmail"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    placeholder="john@example.com"
                                    required
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="btn-primary btn-block" disabled={loading}>
                                {loading ? 'Sending...' : 'Send Reset Link'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowResetModal(false)}
                                className="btn-secondary btn-block"
                                style={{ marginTop: '0.5rem' }}
                            >
                                Cancel
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;
