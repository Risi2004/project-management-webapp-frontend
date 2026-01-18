import { useState, useRef, useEffect } from 'react';

const ProfileMenu = ({ user, onLogout, onDeleteAccount }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

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

    return (
        <div className="profile-menu-container" ref={menuRef}>
            <div
                className="profile-avatar"
                onClick={() => setIsOpen(!isOpen)}
                title="Profile"
            >
                {user?.displayName?.[0] || user?.email?.[0] || 'U'}
            </div>

            {isOpen && (
                <div className="profile-dropdown animate-fade-up">
                    <div className="dropdown-header">
                        <p className="welcome-text">Welcome,</p>
                        <p className="user-name">{user?.displayName || user?.email}</p>
                    </div>

                    <div className="dropdown-divider"></div>

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
