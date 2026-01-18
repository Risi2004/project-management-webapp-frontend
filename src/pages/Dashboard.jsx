import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, limit, onSnapshot, collectionGroup, doc, deleteDoc } from "firebase/firestore";
import { auth, db } from '../firebase';
import '../App.css';
import NotificationCenter from '../components/NotificationCenter';
import ProfileMenu from '../components/ProfileMenu';
import ThemeToggle from '../components/ThemeToggle';

const Dashboard = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    // Project Form States
    const [projectName, setProjectName] = useState('');
    const [projectDesc, setProjectDesc] = useState('');
    const [memberEmail, setMemberEmail] = useState('');
    const [members, setMembers] = useState([]); // List of user objects found by email
    const [modalError, setModalError] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Member Search & Suggestions
    const [suggestions, setSuggestions] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                navigate('/login');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (memberEmail.length < 3) {
                setSuggestions([]);
                return;
            }

            try {
                // Simple prefix search
                const q = query(
                    collection(db, "users"),
                    where("email", ">=", memberEmail),
                    where("email", "<=", memberEmail + '\uf8ff'),
                    limit(5)
                );
                const querySnapshot = await getDocs(q);
                const foundUsers = [];
                querySnapshot.forEach((doc) => {
                    const userData = doc.data();
                    // Don't show self or already added members
                    if (userData.email !== user.email && !members.some(m => m.email === userData.email)) {
                        foundUsers.push({ uid: doc.id, ...userData });
                    }
                });
                setSuggestions(foundUsers);
            } catch (error) {
                console.error("Error fetching suggestions:", error);
            }
        };

        const delayDebounceFn = setTimeout(() => {
            fetchSuggestions();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [memberEmail, user, members]);

    const selectSuggestion = (selectedUser) => {
        setMemberEmail(selectedUser.email);
        setSuggestions([]);
        // Optional: Auto-add when selected?
        // For now, just fill the input so they can click Add, or we can just run the add logic immediately.
        // Let's autofill and let user click Add to confirm, or we can add it directly to 'members' state logic here.
        // User request said "suggest", so autofill + clear suggestions is standard.
        // However, usually selecting from a dropdown adds it. Let's make it add it directly and clear input for smoother UX.

        if (selectedUser.email === user.email) return;
        if (members.some(m => m.email === selectedUser.email)) return;

        setMembers([...members, selectedUser]);
        setMemberEmail('');
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            const user = auth.currentUser;
            if (user) {
                // Optional: Delete user document from Firestore first
                await deleteDoc(doc(db, "users", user.uid));

                // Delete Authentication User
                await deleteUser(user);
                navigate('/');
            }
        } catch (error) {
            console.error("Error deleting account:", error);
            if (error.code === 'auth/requires-recent-login') {
                alert("For security, please log out and log in again before deleting your account.");
            } else {
                alert("Failed to delete account: " + error.message);
            }
        }
    };

    const handleAddMember = async () => {
        if (!memberEmail) return;
        setModalError('');

        // Avoid adding self
        if (memberEmail === user.email) {
            setModalError("You are already the owner.");
            return;
        }

        // Avoid duplicates
        if (members.some(m => m.email === memberEmail)) {
            setModalError("User already added.");
            return;
        }

        try {
            const q = query(collection(db, "users"), where("email", "==", memberEmail));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setModalError("User not found. They must be registered.");
            } else {
                const userDoc = querySnapshot.docs[0];
                setMembers([...members, { uid: userDoc.id, ...userDoc.data() }]);
                setMemberEmail(''); // Clear input
                setSuggestions([]);
            }
        } catch (err) {
            console.error(err);
            setModalError("Error searching for user.");
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();
        if (!projectName) return;
        setIsCreating(true);

        try {
            const projectData = {
                name: projectName,
                description: projectDesc,
                ownerId: user.uid,
                ownerName: user.displayName || user.email,
                members: members.map(m => m.uid), // Store UIDs
                memberDetails: members.map(m => ({ uid: m.uid, name: m.name, email: m.email })), // Optional: Store snapshot of details
                createdAt: new Date().toISOString(),
                status: 'active'
            };

            const docRef = await addDoc(collection(db, "projects"), projectData);

            // Email Invites removed
            /*
            if (members.length > 0) {
                 // removed email fetch
            }
            */

            // Reset form and close modal
            setProjectName('');
            setProjectDesc('');
            setMembers([]);
            setShowModal(false);

            // Redirect to the new workspace
            navigate(`/project/${docRef.id}`);
        } catch (err) {
            console.error("Error creating project:", err);
            setModalError("Failed to create project.");
        } finally {
            setIsCreating(false);
        }
    };

    // Fetch User Projects
    const [ownedProjects, setOwnedProjects] = useState([]);
    const [memberProjects, setMemberProjects] = useState([]);

    useEffect(() => {
        if (!user) return;

        // Real-time listener for projects owned by user
        const qOwned = query(collection(db, "projects"), where("ownerId", "==", user.uid));
        const unsubscribeOwned = onSnapshot(qOwned, (snapshot) => {
            setOwnedProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        // Real-time listener for projects where user is a member
        const qMember = query(collection(db, "projects"), where("members", "array-contains", user.uid));
        const unsubscribeMember = onSnapshot(qMember, (snapshot) => {
            setMemberProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => {
            unsubscribeOwned();
            unsubscribeMember();
        };
    }, [user]);

    // Merge and deduplicate projects
    const projects = [...ownedProjects, ...memberProjects].filter((v, i, a) => a.findIndex(v2 => (v2.id === v.id)) === i);

    // Fetch Pending Tasks (Collection Group Query)
    const [pendingTasks, setPendingTasks] = useState([]);

    useEffect(() => {
        if (!user) return;

        // Query all 'tasks' subcollections where assignedTo == user.uid
        const tasksQuery = query(
            collectionGroup(db, 'tasks'),
            where('assignedTo', '==', user.uid),
            where('status', '==', 'Pending')
        );

        const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Note: doc.ref.parent.parent.id would give projectId if needed
            setPendingTasks(tasks);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) {
        return (
            <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ color: 'white' }}>Loading...</div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="header">
                <div className="container nav">
                    <div className="logo">
                        <span>🔹</span> Nexus
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <ThemeToggle />
                        <NotificationCenter user={user} />
                        <ProfileMenu
                            user={user}
                            onLogout={handleLogout}
                            onDeleteAccount={handleDeleteAccount}
                        />
                    </div>
                </div>
            </header>

            <div className="container" style={{ paddingTop: '8rem' }}>
                <div className="animate-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h1 style={{ fontSize: '2.5rem' }}>Dashboard</h1>
                        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Project</button>
                    </div>

                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
                        This is your personal workspace.
                    </p>

                    <div className="features-grid">
                        <div className="feature-card" style={{ gridColumn: 'span 2' }}>
                            <h3>My Projects</h3>
                            {projects.length === 0 ? (
                                <p>0 Active Projects</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                                    {projects.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => navigate(`/project/${p.id}`)}
                                            style={{
                                                padding: '1rem',
                                                background: 'rgba(255,255,255,0.05)',
                                                borderRadius: '0.5rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{p.description}</div>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                                                {p.ownerId === user?.uid ? 'Owner' : 'Member'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {projects.length === 0 && (
                                <button className="btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setShowModal(true)}>
                                    + Create your first project
                                </button>
                            )}
                        </div>

                        <div className="feature-card">
                            <h3>Your Pending Tasks</h3>
                            {pendingTasks.length === 0 ? (
                                <p style={{ color: 'var(--color-text-muted)' }}>No pending tasks assigned to you. 🎉</p>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {pendingTasks.map(task => (
                                        <li key={task.id} style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            padding: '1rem',
                                            marginBottom: '0.5rem',
                                            borderRadius: '0.5rem',
                                            borderLeft: `4px solid ${task.priority === 'High' ? '#ef4444' : task.priority === 'Medium' ? '#f59e0b' : '#10b981'}`
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: '500' }}>{task.taskId}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{task.dueDate}</span>
                                            </div>
                                            {task.description && <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>{task.description}</p>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Project Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="auth-card modal-content animate-fade-up">
                        <h2>Create New Project</h2>
                        {modalError && <p style={{ color: '#ec4899', fontSize: '0.9rem' }}>{modalError}</p>}

                        <form onSubmit={handleCreateProject} className="auth-form" style={{ marginTop: '1rem' }}>
                            <div className="form-group">
                                <label>Project Name</label>
                                <input
                                    type="text"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <textarea
                                    value={projectDesc}
                                    onChange={(e) => setProjectDesc(e.target.value)}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '0.75rem',
                                        padding: '0.75rem',
                                        color: 'white',
                                        fontFamily: 'var(--font-body)',
                                        outline: 'none',
                                        resize: 'vertical',
                                        minHeight: '80px'
                                    }}
                                />
                            </div>

                            {/* Add Members Section */}
                            <div className="form-group">
                                <label>Add Members by Email</label>
                                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                                    <div style={{ width: '100%', position: 'relative' }}>
                                        <input
                                            type="email"
                                            value={memberEmail}
                                            onChange={(e) => setMemberEmail(e.target.value)}
                                            placeholder="Start typing email..."
                                            autoComplete="off"
                                        />
                                        {/* Suggestions Dropdown */}
                                        {suggestions.length > 0 && (
                                            <div className="suggestions-dropdown">
                                                {suggestions.map((suggestion) => (
                                                    <div
                                                        key={suggestion.uid}
                                                        className="suggestion-item"
                                                        onClick={() => selectSuggestion(suggestion)}
                                                    >
                                                        <div style={{ fontWeight: 500 }}>{suggestion.name || 'User'}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{suggestion.email}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" className="btn-secondary" onClick={handleAddMember}>Add</button>
                                </div>
                            </div>

                            {/* Members List */}
                            {members.length > 0 && (
                                <div style={{ marginBottom: '1rem' }}>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Members to add:</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {members.map((m, idx) => (
                                            <span key={idx} style={{
                                                background: 'rgba(99, 102, 241, 0.2)',
                                                color: '#c4b5fd',
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '999px',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}>
                                                {m.email}
                                                <button
                                                    type="button"
                                                    onClick={() => setMembers(members.filter((_, i) => i !== idx))}
                                                    style={{ background: 'none', border: 'none', color: '#ec4899', fontSize: '1rem', cursor: 'pointer', padding: 0 }}
                                                >
                                                    &times;
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isCreating}>
                                    {isCreating ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
