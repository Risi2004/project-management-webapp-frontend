import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc, where } from "firebase/firestore";
import { db } from '../firebase';
import '../App.css';

const NotificationCenter = ({ user }) => {
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Fetch Notifications
    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "users", user.uid, "notifications"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setNotifications(notifs);
            setUnreadCount(notifs.filter(n => !n.read).length);
        });

        return () => unsubscribe();
    }, [user]);

    const handleMarkAsRead = async (id) => {
        try {
            const notifRef = doc(db, "users", user.uid, "notifications", id);
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    };

    const handleMarkAllRead = async () => {
        const unread = notifications.filter(n => !n.read);
        unread.forEach(async (n) => {
            try {
                const notifRef = doc(db, "users", user.uid, "notifications", n.id);
                await updateDoc(notifRef, { read: true });
            } catch (error) {
                console.error("Error updating notification:", error);
            }
        });
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation(); // Prevent closing dropdown or checking item
        try {
            await deleteDoc(doc(db, "users", user.uid, "notifications", id));
        } catch (error) {
            console.error("Error deleting notification:", error);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        const now = new Date();
        const diff = (now - date) / 1000; // seconds

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="notification-center" ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                className="btn-icon"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '0.5rem',
                    transition: 'color 0.3s'
                }}
            >
                🔔
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
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
                        border: '2px solid rgba(17, 24, 39, 1)'
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown animate-fade-up">
                    <div className="notif-header">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && (
                            <button className="text-btn" onClick={handleMarkAllRead}>Mark all read</button>
                        )}
                    </div>

                    <div className="notif-list">
                        {notifications.length === 0 ? (
                            <div className="empty-state">No notifications yet</div>
                        ) : (
                            notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    className={`notif-item ${!notif.read ? 'unread' : ''}`}
                                    onClick={() => handleMarkAsRead(notif.id)}
                                >
                                    <div className="notif-content">
                                        <p>{notif.message}</p>
                                        <span className="notif-time">{formatTime(notif.createdAt)}</span>
                                    </div>
                                    <button
                                        className="delete-notif"
                                        onClick={(e) => handleDelete(e, notif.id)}
                                        title="Delete"
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
