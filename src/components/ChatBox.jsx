import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from '../firebase';
import '../App.css'; // Assuming we can reuse some styles or add new ones here

const ChatBox = ({ projectId, currentUser, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    // Scroll to bottom on new message
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Listen for real-time messages
    useEffect(() => {
        if (!projectId) return;

        const q = query(
            collection(db, "projects", projectId, "messages"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [projectId]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            await addDoc(collection(db, "projects", projectId, "messages"), {
                text: newMessage,
                senderId: currentUser.uid,
                senderName: currentUser.displayName || currentUser.email,
                createdAt: serverTimestamp(), // Use server timestamp
            });
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    // Helper to format time
    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="chat-box-container animate-fade-up">
            <div className="chat-header">
                <h3>💬 Team Chat</h3>
                <button onClick={onClose} className="close-chat-btn">&times;</button>
            </div>

            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="no-messages">No messages yet. Start the conversation!</div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderId === currentUser.uid;
                        return (
                            <div key={msg.id} className={`message-bubble ${isMe ? 'my-message' : 'other-message'}`}>
                                <div className="message-sender">{isMe ? 'You' : msg.senderName}</div>
                                <div className="message-text">{msg.text}</div>
                                <div className="message-time">{formatTime(msg.createdAt)}</div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="chat-input-area">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                />
                <button type="submit" className="btn-primary send-btn">➤</button>
            </form>
        </div>
    );
};

export default ChatBox;
