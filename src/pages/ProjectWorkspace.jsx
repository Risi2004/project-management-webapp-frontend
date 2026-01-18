import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot, collection, addDoc, query, orderBy, updateDoc, deleteDoc, getDocs, writeBatch, arrayUnion, where } from "firebase/firestore";
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";
import { auth, db } from '../firebase';
import '../App.css';
import ChatBox from '../components/ChatBox';
import NotificationCenter from '../components/NotificationCenter';
import ProfileMenu from '../components/ProfileMenu';
import ProjectAnalytics from '../components/ProjectAnalytics';

const ProjectWorkspace = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // Task State
    const [tasks, setTasks] = useState([]);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [newTask, setNewTask] = useState({
        taskId: '',
        module: '',
        page: '',
        description: '',
        assignedTo: '',
        priority: 'Medium',
        startDate: '',
        dueDate: '',
        status: 'Pending',
        percentDone: 0,
        attachments: [] // Array of { name, url, type }
    });
    const [sectionFiles, setSectionFiles] = useState([]); // Array of File objects

    // Add Member State
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' | 'stats' | 'history'
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                navigate('/login');
            } else {
                setUser(currentUser);
            }
        });

        return () => unsubscribeAuth();
    }, [navigate]);

    // Fetch Task
    useEffect(() => {
        if (!projectId) return;
        const q = query(collection(db, "projects", projectId, "tasks"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            tasksData.sort((a, b) => a.taskId.localeCompare(b.taskId));
            setTasks(tasksData);
        });
        return () => unsubscribe();
    }, [projectId]);

    // Fetch History
    useEffect(() => {
        if (!projectId || activeTab !== 'history') return;
        const q = query(collection(db, "projects", projectId, "history"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistory(historyData);
        });
        return () => unsubscribe();
    }, [projectId, activeTab]);

    // Chat Unread Count Logic
    useEffect(() => {
        if (!projectId || !user) return;

        const lastReadKey = `nexus_last_read_${projectId}_${user.uid}`;

        // Listen to messages to update unread count
        const q = query(collection(db, "projects", projectId, "messages"), orderBy("createdAt", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (showChat) {
                // If chat is open, we are reading everything. 
                // Reset count and update last read time.
                setUnreadCount(0);
                if (!snapshot.empty) {
                    const lastMsg = snapshot.docs[snapshot.docs.length - 1].data();
                    if (lastMsg.createdAt) {
                        localStorage.setItem(lastReadKey, lastMsg.createdAt.toDate().toISOString());
                    }
                }
            } else {
                // Chat is closed. Compare with last read time.
                const storedTime = localStorage.getItem(lastReadKey);
                const lastReadTime = storedTime ? new Date(storedTime) : new Date(0); // Epoch if never read

                const msgs = snapshot.docs.map(doc => doc.data());
                const unread = msgs.filter(m => {
                    const msgTime = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(); // Handle potential null on local write
                    return msgTime > lastReadTime && m.senderId !== user.uid;
                });
                setUnreadCount(unread.length);
            }
        });

        return () => unsubscribe();
    }, [projectId, user, showChat]);

    // Fetch Project Data & Check Permissions
    useEffect(() => {
        if (!user || !projectId) return;

        const unsubProject = onSnapshot(doc(db, "projects", projectId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Use stored memberDetails directly
                setProject({ id: docSnap.id, ...data });

                if (data.ownerId === user.uid) {
                    setIsAdmin(true);
                }

                const isMember = data.members?.includes(user.uid);
                if (data.ownerId !== user.uid && !isMember) {
                    alert("You do not have access to this project.");
                    navigate('/dashboard');
                }
            } else {
                console.log("No such project!");
                navigate('/dashboard');
            }
            setLoading(false);
        });

        return () => unsubProject();
    }, [projectId, user, navigate]);



    // Delete Project Logic
    const handleDeleteProject = async () => {
        if (!window.confirm("Are you sure you want to PERMANENTLY delete this project? This action cannot be undone.")) return;

        try {
            setLoading(true);

            // Get all tasks
            const tasksQuery = query(collection(db, "projects", projectId, "tasks"));
            const tasksSnapshot = await getDocs(tasksQuery);

            // Create a batch for atomic deletion
            const batch = writeBatch(db);

            // Delete all task documents in the batch
            tasksSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            // Notify all members about project deletion
            const notificationBatch = writeBatch(db);
            if (project.members && project.members.length > 0) {
                project.members.forEach(memberId => {
                    if (memberId !== user.uid) {
                        const notifRef = doc(collection(db, "users", memberId, "notifications"));
                        notificationBatch.set(notifRef, {
                            type: 'project_deleted',
                            message: `Project "${project.name}" has been deleted by Admin.`,
                            createdAt: new Date(),
                            read: false
                        });
                    }
                });
                await notificationBatch.commit();
            }

            // Delete the project document
            const projectRef = doc(db, "projects", projectId);
            batch.delete(projectRef);

            // Commit the batch
            await batch.commit();

            console.log("Project and all tasks deleted from database.");
            navigate('/dashboard');
        } catch (err) {
            console.error("Error deleting project:", err);
            alert("Failed to delete project: " + err.message);
            setLoading(false);
        }
    };

    const logProjectActivity = async (action, details) => {
        try {
            await addDoc(collection(db, "projects", projectId, "history"), {
                action,
                details,
                performedBy: user.uid,
                performedByName: user.displayName || user.email,
                createdAt: new Date().toISOString()
            });
        } catch (error) {
            console.error("Failed to log activity:", error);
        }
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

    // Modal Form Handling
    const handleTaskChange = (e) => {
        setNewTask({ ...newTask, [e.target.name]: e.target.value });
    };

    const handleAddTask = async (e) => {
        e.preventDefault();
        try {
            const uploadedAttachments = [];

            // Upload all files
            if (sectionFiles.length > 0) {
                for (const file of sectionFiles) {
                    const formData = new FormData();
                    formData.append('file', file);

                    try {
                        const uploadRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/upload-file`, {
                            method: 'POST',
                            body: formData
                        });
                        const uploadData = await uploadRes.json();
                        if (uploadData.success) {
                            uploadedAttachments.push({
                                name: file.name,
                                url: uploadData.fileUrl,
                                type: file.type
                            });
                        }
                    } catch (error) {
                        console.error("File upload error:", error);
                        // Continue uploading others even if one fails
                    }
                }
            }

            const taskData = {
                ...newTask,
                attachments: uploadedAttachments,
                // fallback for older code that uses 'page'
                page: uploadedAttachments.length > 0 ? uploadedAttachments[0].url : '',
                createdAt: new Date().toISOString()
            };


            await addDoc(collection(db, "projects", projectId, "tasks"), taskData);
            await logProjectActivity("Created Task", `Task ${newTask.taskId} was created by ${user.displayName || user.email}`);

            // Send Email & App Notification if assigned
            if (newTask.assignedTo) {
                try {
                    const userDocRef = doc(db, "users", newTask.assignedTo);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists()) {
                        const targetUser = userDocSnap.data();
                        const targetEmail = targetUser.email;
                        const targetName = targetUser.name || targetUser.email;

                        // 1. Email Link Removed


                        // 2. In-App Notification
                        if (newTask.assignedTo !== user.uid) {
                            await addDoc(collection(db, "users", newTask.assignedTo, "notifications"), {
                                type: 'assignment',
                                message: `You were assigned task ${newTask.taskId} in ${project.name}`,
                                projectId: projectId,
                                projectName: project.name,
                                read: false,
                                createdAt: new Date() // Firestore understands Date objects
                            });
                        }
                    }
                } catch (emailErr) {
                    console.error("Failed to send notifications:", emailErr);
                }
            }

            setShowTaskModal(false);
            setNewTask({
                taskId: '',
                module: '',
                page: '',
                description: '',
                assignedTo: '',
                priority: 'Medium',
                startDate: '',
                dueDate: '',
                status: 'Pending',
                percentDone: 0,
                comments: '',
                attachments: []
            });
            setSectionFiles([]);
        } catch (err) {
            console.error("Error adding task:", err);
            alert("Failed to add task");
        }
    };

    // Inline Editing Logic
    const handleUpdateTaskField = (taskId, field, value) => {
        setTasks(prevTasks => prevTasks.map(t =>
            t.id === taskId ? { ...t, [field]: value } : t
        ));
    };

    const saveTaskUpdate = async (taskId, field, value) => {
        try {
            const taskRef = doc(db, "projects", projectId, "tasks", taskId);
            await updateDoc(taskRef, { [field]: value });

            // Fetch the task ID for the log
            const task = tasks.find(t => t.id === taskId);
            const taskDisplayId = task ? task.taskId : 'Unknown Task';
            await logProjectActivity("Updated Task", `Task ${taskDisplayId}: ${field} changed to ${value}`);

            // Notify Assignee of update
            // task is already defined above
            if (task && task.assignedTo && task.assignedTo !== user.uid) {
                await addDoc(collection(db, "users", task.assignedTo, "notifications"), {
                    type: 'task_update',
                    message: `Task ${task.taskId} updated: ${field} changed to ${value}`,
                    projectId: projectId,
                    projectName: project.name,
                    read: false,
                    createdAt: new Date()
                });
            }
        } catch (err) {
            console.error("Error updating task:", err);
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            const task = tasks.find(t => t.id === taskId);
            await deleteDoc(doc(db, "projects", projectId, "tasks", taskId));
            await logProjectActivity("Deleted Task", `Task ${task ? task.taskId : 'Unknown'} was deleted.`);

            // Notify Assignee
            if (task && task.assignedTo && task.assignedTo !== user.uid) {
                await addDoc(collection(db, "users", task.assignedTo, "notifications"), {
                    type: 'task_deleted',
                    message: `Task ${task.taskId} was deleted from ${project.name}`,
                    projectId: projectId,
                    projectName: project.name,
                    read: false,
                    createdAt: new Date()
                });
            }

        } catch (err) {
            console.error("Error deleting task:", err);
            alert("Failed to delete task");
        }
    };

    const handleAddMemberToProject = async (e) => {
        e.preventDefault();
        if (!newMemberEmail) return;

        try {
            // Find user by email
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("email", "==", newMemberEmail));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                alert("User not found. They must be registered with this email.");
                return;
            }

            const userDoc = querySnapshot.docs[0];
            const newUserData = userDoc.data();
            const newUserId = userDoc.id;

            // Check if already a member
            if (project.members?.includes(newUserId) || project.ownerId === newUserId) {
                alert("User is already a member of this project.");
                return;
            }

            // Update Project in Firestore
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
                members: arrayUnion(newUserId),
                memberDetails: arrayUnion({ uid: newUserId, name: newUserData.name, email: newUserData.email })
            });

            await logProjectActivity("Added Member", `Member ${newUserData.name || newUserData.email} was added to the project.`);

            // Email Invite Removed


            // Send In-App Notification
            await addDoc(collection(db, "users", newUserId, "notifications"), {
                type: 'project_invite',
                message: `You were added to project "${project.name}" by ${user.displayName || user.email}`,
                projectId: projectId,
                projectName: project.name,
                read: false,
                createdAt: new Date()
            });

            alert(`Member ${newUserData.email} added successfully!`);
            setNewMemberEmail('');
            setShowAddMemberModal(false);
        } catch (err) {
            console.error("Error adding member:", err);
            alert("Failed to add member.");
        }
    };

    if (loading) {
        return (
            <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ color: 'white' }}>Loading Workspace...</div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Header */}
            <header className="header">
                <div className="container nav">
                    <div className="logo" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
                        <span>🔹</span> Nexus <span style={{ opacity: 0.5, fontSize: '0.8em', marginLeft: '0.5rem' }}>/ {project?.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <NotificationCenter user={user} />
                        <button
                            className="btn-secondary"
                            onClick={() => setShowChat(!showChat)}
                            style={{
                                padding: '0.4rem 1rem',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                position: 'relative'
                            }}
                        >
                            <span>💬</span> Chat
                            {unreadCount > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: '-5px',
                                    right: '-5px',
                                    background: '#ef4444',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>
                        {isAdmin && <span className="hero-badge" style={{ margin: 0, padding: '0.25rem 0.75rem' }}>Admin</span>}
                        <ProfileMenu
                            user={user}
                            onLogout={handleLogout}
                            onDeleteAccount={handleDeleteAccount}
                        />
                    </div>
                </div>
            </header>

            <div className="container" style={{ paddingTop: '6rem', display: 'flex', gap: '2rem', height: 'calc(100vh - 2rem)', maxWidth: '98%' }}>

                {/* Sidebar / Project Info */}
                <aside style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{project?.name}</h2>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{project?.description || "No description provided."}</p>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '1rem', color: 'var(--color-text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Members</h3>
                        {isAdmin && (
                            <button
                                className="btn-secondary"
                                style={{
                                    fontSize: '0.8rem',
                                    padding: '0.25rem 0.5rem',
                                    marginBottom: '1rem',
                                    width: '100%'
                                }}
                                onClick={() => setShowAddMemberModal(true)}
                            >
                                + Add Member
                            </button>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* Owner */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                    {project?.ownerName?.[0] || 'O'}
                                </div>
                                <div style={{ fontSize: '0.9rem' }}>
                                    {project?.ownerName} <span style={{ opacity: 0.5 }}>(Owner)</span>
                                </div>
                            </div>
                            {/* Other Members */}
                            {project?.memberDetails?.map((m) => (
                                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-surface-highlight)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                        {m.name?.[0] || 'M'}
                                    </div>
                                    <div style={{ fontSize: '0.9rem' }}>{m.name || m.email}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button className="btn-secondary" onClick={() => navigate('/dashboard')}>
                        &larr; Back to Dashboard
                    </button>

                    {isAdmin && (
                        <button
                            className="btn-secondary"
                            onClick={handleDeleteProject}
                            style={{
                                marginTop: '1rem',
                                borderColor: 'rgba(239, 68, 68, 0.5)',
                                color: '#fca5a5'
                            }}
                            onMouseOver={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                            onMouseOut={(e) => { e.target.style.background = 'transparent'; }}
                        >
                            Delete Project
                        </button>
                    )}
                </aside>

                {/* Main Workspace Area (Task Table) */}
                <main style={{ flex: 1, background: 'rgba(255, 255, 255, 0.02)', borderRadius: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                className={`btn-secondary ${activeTab === 'tasks' ? 'active' : ''}`}
                                onClick={() => setActiveTab('tasks')}
                                style={{
                                    borderBottom: activeTab === 'tasks' ? '2px solid var(--color-primary)' : 'none',
                                    borderRadius: '0',
                                    background: 'transparent'
                                }}
                            >
                                📋 Tasks
                            </button>
                            <button
                                className={`btn-secondary ${activeTab === 'stats' ? 'active' : ''}`}
                                onClick={() => setActiveTab('stats')}
                                style={{
                                    borderBottom: activeTab === 'stats' ? '2px solid var(--color-primary)' : 'none',
                                    borderRadius: '0',
                                    background: 'transparent'
                                }}
                            >
                                📊 Stats
                            </button>
                            <button
                                className={`btn-secondary ${activeTab === 'history' ? 'active' : ''}`}
                                onClick={() => setActiveTab('history')}
                                style={{
                                    borderBottom: activeTab === 'history' ? '2px solid var(--color-primary)' : 'none',
                                    borderRadius: '0',
                                    background: 'transparent'
                                }}
                            >
                                🕵️ History
                            </button>
                        </div>
                        {activeTab === 'tasks' && isAdmin && <button className="btn-primary" onClick={() => setShowTaskModal(true)}>+ Add Task</button>}
                    </div>

                    {activeTab === 'tasks' ? (
                        <div className="task-table-container" style={{ flex: 1 }}>
                            <table className="task-table">
                                <thead>
                                    <tr>
                                        <th>Task ID</th>
                                        <th>Module</th>
                                        <th>Section</th>
                                        <th>Description</th>
                                        <th>Assigned To</th>
                                        <th>Priority</th>
                                        <th>Start Date</th>
                                        <th>Due Date</th>
                                        <th>Status</th>
                                        <th>% Done</th>
                                        <th>Comments</th>
                                        {isAdmin && <th>Action</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tasks.length === 0 ? (
                                        <tr>
                                            <td colSpan={isAdmin ? "12" : "11"} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                                                No tasks found. {isAdmin ? 'Add one above!' : ''}
                                            </td>
                                        </tr>
                                    ) : (
                                        tasks.map((task) => (
                                            <tr key={task.id}>
                                                <td>
                                                    {isAdmin ? (
                                                        <input
                                                            value={task.taskId}
                                                            onChange={(e) => handleUpdateTaskField(task.id, 'taskId', e.target.value)}
                                                            onBlur={(e) => saveTaskUpdate(task.id, 'taskId', e.target.value)}
                                                        />
                                                    ) : task.taskId}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <textarea
                                                            value={task.module}
                                                            onChange={(e) => handleUpdateTaskField(task.id, 'module', e.target.value)}
                                                            onBlur={(e) => saveTaskUpdate(task.id, 'module', e.target.value)}
                                                            rows={2}
                                                            style={{ resize: 'vertical', minHeight: '3rem' }}
                                                        />
                                                    ) : task.module}
                                                </td>
                                                <td>
                                                    {task.attachments && task.attachments.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            {task.attachments.map((file, idx) => (
                                                                <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer"
                                                                    style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '0.85rem' }}
                                                                    title={file.name}>
                                                                    {file.name || `File ${idx + 1}`}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : task.page && task.page.startsWith('http') ? (
                                                        <a href={task.page} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                                                            View File
                                                        </a>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                                            No Files
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <textarea
                                                            value={task.description}
                                                            onChange={(e) => handleUpdateTaskField(task.id, 'description', e.target.value)}
                                                            onBlur={(e) => saveTaskUpdate(task.id, 'description', e.target.value)}
                                                            rows={3}
                                                            style={{ resize: 'both', minWidth: '150px' }}
                                                        />
                                                    ) : task.description}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <select
                                                            value={task.assignedTo || ''}
                                                            onChange={(e) => {
                                                                handleUpdateTaskField(task.id, 'assignedTo', e.target.value);
                                                                saveTaskUpdate(task.id, 'assignedTo', e.target.value);
                                                            }}
                                                        >
                                                            <option value="" style={{ color: 'black' }}>Unassigned</option>
                                                            <option value={project?.ownerId} style={{ color: 'black' }}>{project?.ownerName} (Owner)</option>
                                                            {project?.memberDetails?.map(m => (
                                                                <option key={m.uid} value={m.uid} style={{ color: 'black' }}>{m.name || m.email}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        project?.memberDetails?.find(m => m.uid === task.assignedTo)?.name ||
                                                        (task.assignedTo === project?.ownerId ? project?.ownerName : 'Unassigned')
                                                    )}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <select
                                                            value={task.priority}
                                                            onChange={(e) => {
                                                                handleUpdateTaskField(task.id, 'priority', e.target.value);
                                                                saveTaskUpdate(task.id, 'priority', e.target.value);
                                                            }}
                                                            style={{
                                                                color: task.priority === 'High' ? '#fca5a5' : task.priority === 'Medium' ? '#fcd34d' : '#6ee7b7'
                                                            }}
                                                        >
                                                            <option value="Low" style={{ color: 'black' }}>Low</option>
                                                            <option value="Medium" style={{ color: 'black' }}>Medium</option>
                                                            <option value="High" style={{ color: 'black' }}>High</option>
                                                        </select>
                                                    ) : (
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '4px',
                                                            background: task.priority === 'High' ? 'rgba(239, 68, 68, 0.2)' : task.priority === 'Medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                                            color: task.priority === 'High' ? '#fca5a5' : task.priority === 'Medium' ? '#fcd34d' : '#6ee7b7',
                                                            fontSize: '0.85rem'
                                                        }}>
                                                            {task.priority}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <input
                                                            type="date"
                                                            value={task.startDate}
                                                            onChange={(e) => handleUpdateTaskField(task.id, 'startDate', e.target.value)}
                                                            onBlur={(e) => saveTaskUpdate(task.id, 'startDate', e.target.value)}
                                                        />
                                                    ) : task.startDate}
                                                </td>
                                                <td>
                                                    {isAdmin ? (
                                                        <input
                                                            type="date"
                                                            value={task.dueDate}
                                                            onChange={(e) => handleUpdateTaskField(task.id, 'dueDate', e.target.value)}
                                                            onBlur={(e) => saveTaskUpdate(task.id, 'dueDate', e.target.value)}
                                                        />
                                                    ) : task.dueDate}
                                                </td>
                                                <td>
                                                    {/* Status - Everyone can edit */}
                                                    <select
                                                        value={task.status}
                                                        onChange={(e) => {
                                                            const newVal = e.target.value;
                                                            handleUpdateTaskField(task.id, 'status', newVal);
                                                            saveTaskUpdate(task.id, 'status', newVal);
                                                            if (newVal === 'Completed') {
                                                                handleUpdateTaskField(task.id, 'percentDone', 100);
                                                                saveTaskUpdate(task.id, 'percentDone', 100);
                                                            } else if (newVal === 'Pending') {
                                                                handleUpdateTaskField(task.id, 'percentDone', 0);
                                                                saveTaskUpdate(task.id, 'percentDone', 0);
                                                            }
                                                        }}
                                                    >
                                                        <option value="Pending" style={{ color: 'black' }}>Pending</option>
                                                        <option value="In Progress" style={{ color: 'black' }}>In Progress</option>
                                                        <option value="Completed" style={{ color: 'black' }}>Completed</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {/* % Done - Everyone can edit */}
                                                    <input
                                                        type="number"
                                                        min="0" max="100"
                                                        value={task.percentDone}
                                                        onChange={(e) => handleUpdateTaskField(task.id, 'percentDone', e.target.value)}
                                                        onBlur={(e) => saveTaskUpdate(task.id, 'percentDone', e.target.value)}
                                                    />
                                                </td>
                                                <td>
                                                    {/* Comments - Everyone can edit */}
                                                    <input
                                                        value={task.comments}
                                                        onChange={(e) => handleUpdateTaskField(task.id, 'comments', e.target.value)}
                                                        onBlur={(e) => saveTaskUpdate(task.id, 'comments', e.target.value)}
                                                    />
                                                </td>
                                                {isAdmin && (
                                                    <td>
                                                        <button
                                                            onClick={() => handleDeleteTask(task.id)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                fontSize: '1.2rem',
                                                                padding: '0.25rem'
                                                            }}
                                                            title="Delete Task"
                                                        >
                                                            &times;
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : activeTab === 'stats' ? (
                        <ProjectAnalytics tasks={tasks} project={project} />
                    ) : (
                        <div className="history-container" style={{ overflowY: 'auto' }}>
                            <table className="task-table" style={{ minWidth: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '200px' }}>Date & Time</th>
                                        <th style={{ width: '150px' }}>User</th>
                                        <th style={{ width: '150px' }}>Action</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>No history logs yet.</td></tr>
                                    ) : (
                                        history.map(log => (
                                            <tr key={log.id}>
                                                <td style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                                    {new Date(log.createdAt).toLocaleString()}
                                                </td>
                                                <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                                                        {log.performedByName?.[0] || 'U'}
                                                    </div>
                                                    {log.performedByName}
                                                </td>
                                                <td>
                                                    <span style={{
                                                        padding: '0.2rem 0.5rem',
                                                        borderRadius: '4px',
                                                        background: 'rgba(255,255,255,0.1)',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td style={{ opacity: 0.9 }}>{log.details}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>
            </div>

            {/* Add Task Modal */}
            {showTaskModal && (
                <div className="modal-overlay">
                    <div className="auth-card modal-content animate-fade-up" style={{ minWidth: '600px' }}>
                        <h2>Add New Task</h2>
                        <form onSubmit={handleAddTask} className="auth-form" style={{ marginTop: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Task ID</label>
                                    <input name="taskId" value={newTask.taskId} onChange={handleTaskChange} placeholder="e.g. WEB-01" required />
                                </div>
                                <div className="form-group">
                                    <label>Module</label>
                                    <input name="module" value={newTask.module} onChange={handleTaskChange} placeholder="e.g. Frontend" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Attachments (Multi-select)</label>
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => setSectionFiles([...sectionFiles, ...Array.from(e.target.files)])}
                                    style={{ color: 'white' }}
                                />
                                {sectionFiles.length > 0 && (
                                    <div className="file-list">
                                        {sectionFiles.map((f, i) => (
                                            <div key={i} className="file-item">
                                                <span>{f.name}</span>
                                                <button
                                                    type="button"
                                                    className="remove-file-btn"
                                                    onClick={() => setSectionFiles(sectionFiles.filter((_, idx) => idx !== i))}
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

                                <div className="form-group">
                                    <label>Assigned To</label>
                                    <select name="assignedTo" value={newTask.assignedTo} onChange={handleTaskChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                                        <option value="" style={{ color: 'black' }}>Select Member</option>
                                        <option value={project.ownerId} style={{ color: 'black' }}>{project.ownerName} (Owner)</option>
                                        {project.memberDetails?.map(m => (
                                            <option key={m.uid} value={m.uid} style={{ color: 'black' }}>{m.name || m.email}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Priority</label>
                                    <select name="priority" value={newTask.priority} onChange={handleTaskChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                                        <option value="Low" style={{ color: 'black' }}>Low</option>
                                        <option value="Medium" style={{ color: 'black' }}>Medium</option>
                                        <option value="High" style={{ color: 'black' }}>High</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select name="status" value={newTask.status} onChange={handleTaskChange} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                                        <option value="Pending" style={{ color: 'black' }}>Pending</option>
                                        <option value="In Progress" style={{ color: 'black' }}>In Progress</option>
                                        <option value="Completed" style={{ color: 'black' }}>Completed</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Start Date</label>
                                    <input type="date" name="startDate" value={newTask.startDate} onChange={handleTaskChange} />
                                </div>
                                <div className="form-group">
                                    <label>Due Date</label>
                                    <input
                                        type="date"
                                        name="dueDate"
                                        value={newTask.dueDate}
                                        onChange={handleTaskChange}
                                        min={newTask.startDate} // Ensure Due Date is not before Start Date
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Description</label>
                                <textarea name="description" value={newTask.description} onChange={handleTaskChange} rows="2" style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>% Done</label>
                                    <input type="number" name="percentDone" value={newTask.percentDone} onChange={handleTaskChange} min="0" max="100" />
                                </div>
                                <div className="form-group">
                                    <label>Comments</label>
                                    <input name="comments" value={newTask.comments} onChange={handleTaskChange} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowTaskModal(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Add Task</button>
                            </div>
                        </form>
                    </div>
                </div >
            )}

            {/* Add Member Modal */}
            {
                showAddMemberModal && (
                    <div className="modal-overlay">
                        <div className="auth-card modal-content animate-fade-up" style={{ minWidth: '400px' }}>
                            <h2>Add New Member</h2>
                            <form onSubmit={handleAddMemberToProject} className="auth-form" style={{ marginTop: '1rem' }}>
                                <div className="form-group">
                                    <label>Member Email</label>
                                    <input
                                        type="email"
                                        value={newMemberEmail}
                                        onChange={(e) => setNewMemberEmail(e.target.value)}
                                        placeholder="Enter user email..."
                                        required
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddMemberModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary" style={{ flex: 1 }}>Add Member</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Chat Box */}
            {
                showChat && (
                    <ChatBox
                        projectId={projectId}
                        currentUser={user}
                        onClose={() => setShowChat(false)}
                    />
                )
            }
        </div >
    );
};

export default ProjectWorkspace;
