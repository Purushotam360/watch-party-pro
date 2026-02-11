const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const { roomId, username } = data;
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { users: [], playlist: [], host: username };
        }
        
        rooms[roomId].users.push(username);

        io.to(roomId).emit('update-users', { 
            users: rooms[roomId].users, 
            host: rooms[roomId].host 
        });
        
        socket.emit('update-playlist', rooms[roomId].playlist);
        socket.to(roomId).emit('receive-chat', { username: 'SYSTEM', msg: `${username} joined!` });
    });

    socket.on('add-to-playlist', (data) => {
        const { roomId, videoId } = data;
        if (rooms[roomId]) {
            rooms[roomId].playlist.push(videoId);
            io.to(roomId).emit('update-playlist', rooms[roomId].playlist);
        }
    });

    socket.on('remove-first-item', (data) => {
        const { roomId } = data;
        // Optimization: Only allow the host to remove items if you want stricter control
        if (rooms[roomId] && rooms[roomId].playlist.length > 0) {
            rooms[roomId].playlist.shift();
            io.to(roomId).emit('update-playlist', rooms[roomId].playlist);
        }
    });

    socket.on('sync-action', (data) => {
        if (!rooms[data.roomId]) return;

        // Better UI: Show who did what in the chat
        if (data.action !== 'load') {
            const actionText = data.action === 'play' ? 'resumed' : 'paused';
            io.to(data.roomId).emit('receive-chat', { 
                username: 'SYSTEM', 
                msg: `${socket.username} ${actionText} the video.` 
            });
        }
        socket.to(data.roomId).emit('apply-sync', data);
    });

    socket.on('send-emoji', (data) => {
        io.to(data.roomId).emit('show-emoji', data.emoji);
    });

    socket.on('send-chat', (data) => {
        socket.to(data.roomId).emit('receive-chat', data);
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            // Filter out the user
            rooms[socket.roomId].users = rooms[socket.roomId].users.filter(u => u !== socket.username);
            
            // If the person who left was the host
            if (rooms[socket.roomId].host === socket.username) {
                if (rooms[socket.roomId].users.length > 0) {
                    // Instantly promote the next available person
                    rooms[socket.roomId].host = rooms[socket.roomId].users[0];
                    io.to(socket.roomId).emit('receive-chat', { 
                        username: 'SYSTEM', 
                        msg: `The host left. ${rooms[socket.roomId].host} is now the host!` 
                    });
                } else {
                    // Delete empty room to save memory
                    delete rooms[socket.roomId];
                }
            }
            
            // Force a refresh for everyone left in the room
            if (rooms[socket.roomId]) {
                io.to(socket.roomId).emit('update-users', { 
                    users: rooms[socket.roomId].users, 
                    host: rooms[socket.roomId].host 
                });
            }
        }
    });
});

server.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));