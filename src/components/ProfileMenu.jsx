import { useState, useRef, useEffect } from 'react';
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from '../firebase';

const ProfileMenu = ({ user, onLogout, onDeleteAccount }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [currentPhoto, setCurrentPhoto] = useState(user?.photoURL);
    const menuRef = useRef(null);
    const fileInputRef = useRef(null);

    // Update local state if user prop changes
    useEffect(() => {
        setCurrentPhoto(user?.photoURL);
    }, [user]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            // 1. Upload to Backend (S3)
            // Using backend hostname from environment or default to localhost:3001
            const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
            const response = await fetch(`${backendUrl}/api/upload-file`, {
                method: 'POST',
                body: formData
                // Note: fetch automatically sets Content-Type to multipart/form-data with boundary when body is FormData
            });

            const data = await response.json();

            if (data.success) {
                const photoURL = data.fileUrl;

                // 2. Update Firebase Auth Profile
                await updateProfile(user, { photoURL });

                // 3. Update Firestore User Document
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, { photoURL });

                setCurrentPhoto(photoURL); // Update local state immediately
                alert("Profile picture updated!");
            } else {
                alert("Failed to upload image.");
            }
        } catch (error) {
            console.error("Error uploading profile picture:", error);
            alert("Error uploading profile picture.");
        } finally {
            setUploading(false);
            setIsOpen(false);
        }
    };

    return (
        <div className="profile-menu-container" ref={menuRef}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileChange}
            />
            <div
                className="profile-avatar"
                onClick={() => setIsOpen(!isOpen)}
                title="Profile"
                style={{
                    backgroundColor: currentPhoto ? 'transparent' : 'var(--color-secondary)',
                    overflow: 'hidden', // Ensure image stays within circle
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                {currentPhoto ? (
                    <img
                        src={currentPhoto}
                        alt="Profile"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '50%'
                        }}
                    />
                ) : (
                    user?.displayName?.[0] || user?.email?.[0] || 'U'
                )}
            </div>

            {isOpen && (
                <div className="profile-dropdown animate-fade-up">
                    <div className="dropdown-header">
                        <p className="welcome-text">Welcome,</p>
                        <p className="user-name">{user?.displayName || user?.email}</p>
                    </div>

                    <div className="dropdown-divider"></div>

                    <button
                        className="dropdown-item"
                        onClick={() => fileInputRef.current.click()}
                        disabled={uploading}
                    >
                        {uploading ? 'Uploading...' : 'Change Profile Picture'}
                    </button>

                    <button
                        className="dropdown-item delete-account"
                        onClick={() => {
                            if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                                onDeleteAccount();
                            }
                        }}
                    >
                        Delete Account
                    </button>

                    <button
                        className="dropdown-item logout"
                        onClick={onLogout}
                    >
                        Logout
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProfileMenu;
