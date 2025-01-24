const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose'); // MongoDB library
const express = require('express');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const userRouter = require('./routes/users');
const seedUsers = require('./utils/seedUsers'); // Import the seed function

app.set('view engine', 'ejs');
app.use(express.json()); // Middleware for parsing JSON
app.use(express.urlencoded({ extended: true })); // Middleware for parsing URL-encoded data
app.use(logger);

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/my_database')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));


// Mongoose Schema and Model
const TaskSchema = new mongoose.Schema({
    title: String,
    status: String, // Example: 'pending', 'in progress', 'complete'
}, { timestamps: true });

const Task = mongoose.model('Task', TaskSchema);

// Routes
app.get("/", (req, res) => {
    res.render('index');
});

// Example RESTful API for tasks
//app.use('/users', userRouter);

// Define the User schema and model
const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,  // In production, never store plaintext passwords
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);  // This line fixes the overwriting issue

// Route for rendering users
app.get("/users", async (req, res) => {
    try {
        const users = await User.find(); // Fetch all users from the database
        res.render('users', { users });  // Pass the users to the 'users' view
    } catch (error) {
        console.error('Error fetching users:', error);  // Log the detailed error
        res.status(500).send('Error fetching users');
    }
});


app.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.status(200).json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch tasks', error });
    }
});

app.post('/tasks', async (req, res) => {
    const { title, status } = req.body;

    const newTask = new Task({ title, status });
    try {
        const savedTask = await newTask.save();
        res.status(201).json(savedTask);
    } catch (error) {
        res.status(400).json({ message: 'Failed to create task', error });
    }
});

function logger(req, res, next) {
    console.log(req.originalUrl);
    next();
}

// WebSocket connection
io.on('connection', (socket) => {
    console.log('A user has connected:', socket.id);

    socket.on('disconnect', () => {
        console.log(`User ${socket.id} has disconnected`);
    });

    // Real-time task update
    socket.on('task update', async (taskData) => {
        console.log('Task updated:', taskData);

        // Update task in the database
        try {
            const updatedTask = await Task.findByIdAndUpdate(taskData.id, { status: taskData.status }, { new: true });
            io.emit('task update', updatedTask); // Broadcast the updated task
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    });
});

const port = 3000;

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});