// 'npm run devStart' in console to run the file.
const http = require('http');
const { Server } = require('socket.io');

const express = require('express');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(logger);

app.get("/", (req, res) => {
    res.render('index');
});

const userRouter = require('./routes/users');
app.use('/users', userRouter);

function logger(req, res, next) {
    console.log(req.originalUrl);
    next();
}

// WebSocket connection...
io.on('connection', (socket) => {
    console.log('A user has connected:', socket.id);

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} has disconnected`);
    });

    // Real-time event example
    socket.on('task update', (taskData) => {
        console.log('Task updated:', taskData);
        io.emit('task update', taskData); // Broadcast
    });
});

const port = 3000;

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});