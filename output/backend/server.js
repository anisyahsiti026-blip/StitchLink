const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Store online users
let onlineUsers = new Map();
// Store active conversations
let activeConversations = new Map();

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // User connected
    socket.on('user_connected', (userData) => {
        onlineUsers.set(socket.id, {
            userId: userData.userId,
            userName: userData.userName,
            userPhoto: userData.userPhoto,
            socketId: socket.id
        });

        // Broadcast online count
        io.emit('online_users', onlineUsers.size);

        // Notify others
        socket.broadcast.emit('user_joined', userData.userName);

        console.log(`${userData.userName} connected. Total users: ${onlineUsers.size}`);
    });

    // ==========================================
    // GROUP CHAT (Public Chat Room)
    // ==========================================

    // Send message to group chat
    socket.on('send_message', (messageData) => {
        // Broadcast to all other clients
        socket.broadcast.emit('receive_message', messageData);
        console.log('Group message from', messageData.userName, ':', messageData.message);
    });

    // ==========================================
    // DIRECT MESSAGING (DM)
    // ==========================================

    // Join conversation room
    socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`Socket ${socket.id} joined conversation: ${conversationId}`);
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        console.log(`Socket ${socket.id} left conversation: ${conversationId}`);
    });

    // Send direct message
    socket.on('send_dm', (messageData) => {
        const { conversationId, recipientId, ...message } = messageData;
        
        // Emit to everyone in the conversation room
        io.to(conversationId).emit('receive_dm', messageData);
        
        // Also send to recipient's socket if online
        const recipientSocket = findUserSocket(recipientId);
        if (recipientSocket) {
            io.to(recipientSocket).emit('new_dm_notification', {
                conversationId,
                from: message.senderName,
                preview: message.message
            });
        }
        
        console.log(`DM in conversation ${conversationId}:`, message.message);
    });

    // Typing indicator for DM
    socket.on('typing_dm', (data) => {
        io.to(data.conversationId).emit('user_typing_dm', data);
    });

    socket.on('stop_typing_dm', (data) => {
        io.to(data.conversationId).emit('user_stop_typing_dm', data);
    });

    // ==========================================
    // NOTIFICATIONS
    // ==========================================

    // Send notification to specific user
    socket.on('send_notification', (notificationData) => {
        const { userId, ...notification } = notificationData;
        const userSocket = findUserSocket(userId);
        
        if (userSocket) {
            io.to(userSocket).emit('receive_notification', notification);
        }
    });

    // ==========================================
    // TYPING INDICATORS (Group Chat)
    // ==========================================

    socket.on('typing', (userData) => {
        socket.broadcast.emit('user_typing', userData);
    });

    socket.on('stop_typing', (userData) => {
        socket.broadcast.emit('user_stop_typing', userData);
    });

    // ==========================================
    // USER STATUS
    // ==========================================

    // Update user status (online/offline/away)
    socket.on('update_status', (statusData) => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            user.status = statusData.status;
            io.emit('user_status_changed', {
                userId: user.userId,
                status: statusData.status
            });
        }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        
        if (user) {
            onlineUsers.delete(socket.id);
            io.emit('online_users', onlineUsers.size);
            socket.broadcast.emit('user_left', user.userName);
            
            // Broadcast user offline status
            io.emit('user_status_changed', {
                userId: user.userId,
                status: 'offline'
            });
            
            console.log(`${user.userName} disconnected. Total users: ${onlineUsers.size}`);
        }
    });
});

// Helper function to find user socket by userId
function findUserSocket(userId) {
    for (const [socketId, userData] of onlineUsers.entries()) {
        if (userData.userId === userId) {
            return socketId;
        }
    }
    return null;
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

app.get('/', (req, res) => {
    res.json({
        message: 'Tailor Community API - Enhanced Version',
        version: '2.0.0',
        features: [
            'Group chat (real-time)',
            'Direct messaging (DM)',
            'Typing indicators',
            'Online status',
            'Notifications'
        ],
        endpoints: {
            socket: 'ws://localhost:3000',
            health: '/health',
            online_users: '/api/online-users',
            conversations: '/api/conversations'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        onlineUsers: onlineUsers.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/online-users', (req, res) => {
    const users = Array.from(onlineUsers.values()).map(user => ({
        userId: user.userId,
        userName: user.userName,
        userPhoto: user.userPhoto,
        status: user.status || 'online'
    }));
    
    res.json({
        count: onlineUsers.size,
        users: users
    });
});

app.get('/api/conversations', (req, res) => {
    const userId = req.query.userId;
    
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    
    // In production, fetch from database
    // For now, return empty array
    res.json({
        userId: userId,
        conversations: []
    });
});

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   🚀 Tailor Community Server (Enhanced)           ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║   Port: ${PORT}                                      ║`);
    console.log('║   Socket.IO: Ready ✅                               ║');
    console.log('║   Features:                                        ║');
    console.log('║   - Group Chat ✅                                   ║');
    console.log('║   - Direct Messaging ✅                             ║');
    console.log('║   - Typing Indicators ✅                            ║');
    console.log('║   - Online Status ✅                                ║');
    console.log('║   - Notifications ✅                                ║');
    console.log('║   Status: Running 🟢                                ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📡 Server endpoints:');
    console.log(`   - HTTP: http://localhost:${PORT}`);
    console.log(`   - WebSocket: ws://localhost:${PORT}`);
    console.log(`   - Health: http://localhost:${PORT}/health`);
    console.log(`   - Online Users: http://localhost:${PORT}/api/online-users`);
    console.log('');
    console.log('🎯 Socket.IO Events:');
    console.log('   Group Chat:');
    console.log('     - send_message / receive_message');
    console.log('     - typing / stop_typing');
    console.log('   Direct Messaging:');
    console.log('     - send_dm / receive_dm');
    console.log('     - typing_dm / stop_typing_dm');
    console.log('     - join_conversation / leave_conversation');
    console.log('   Status:');
    console.log('     - user_connected / user_joined / user_left');
    console.log('     - update_status / user_status_changed');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('');
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed gracefully');
        process.exit(0);
    });
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.makeAdmin = functions.https.onCall(async (data, context) => {
  // Only existing admins can promote others
  const callerUid = context.auth.uid;
  const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
  
  if (callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can promote users');
  }

  // Set target user as admin
  const { userId } = data;
  await admin.firestore().collection('users').doc(userId).update({
    role: 'admin'
  });

  return { success: true };
});

// setup-first-admin.js
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

async function setupFirstAdmin(userId) {
  const db = getFirestore();
  await updateDoc(doc(db, 'users', userId), {
    role: 'admin'
  });
  console.log('First admin setup complete!');
}

// Ganti dengan UID user Anda
setupFirstAdmin('WxFKJkca3WebJCEZxu0ceCcecLH2');