const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const MongoStore = require('connect-mongo');
require('dotenv').config();
const openaiApiKey = process.env.OPENAI_API_KEY;
const { OpenAI } = require('openai');
const openai = new OpenAI({
    apiKey: openaiApiKey, // Hidden API Key
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const User = require('./models/User');
const Group = require('./models/Group');
const Project = require('./models/Project');
const Discussion = require('./models/Discussion');

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/my_database')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// Session Middleware
app.use(session({
    secret: 'my_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb://127.0.0.1:27017/my_database' }), // Store session in MongoDB
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Local strategy
passport.use(new LocalStrategy(
    async (username, password, done) => {
        const user = await User.findOne({ username });
        if (!user) return done(null, false);
        const isMatch = await bcrypt.compare(password, user.password); // Use bcrypt.compare
        return isMatch ? done(null, user) : done(null, false);
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);  // user.id is the unique identifier of the user
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Middleware to set isAuthenticated for all views
app.use((req, res, next) => {
    res.locals.isAuthenticated = !!req.session.userId; // true if user is logged in, false otherwise
    next();
});

// Mongoose User Schema
const UserSchema = new mongoose.Schema({
    name: String,
    username: { type: String, unique: true, required: true, match: [/^\S+$/, 'Username cannot contain spaces'] },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}, { timestamps: true });

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.user || req.session.userId) { // Check if user is authenticated through session or Passport
        return next();
    }
    res.redirect('/login');
}

// Routes
app.get("/", (req, res) => {
    res.render('index');
});

// Route for rendering users
app.get('/users', async (req, res) => {
    try {
        const users = await User.find(); // Fetch users from the database
        res.render('users', { 
            users, 
            successMessage: '' // Ensure successMessage is always defined
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Error fetching users');
    }
});

// Signup Route
app.get('/signup', (req, res) => {
    res.render('signup', { errorMessage: '' }); // Ensure errorMessage is always defined
});

app.post('/signup', async (req, res) => {
    const { name, username, email, password } = req.body;

    if (/\s/.test(username)) {
        return res.render('signup', { errorMessage: 'Username cannot contain spaces' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            name,
            username,
            email,
            password: hashedPassword,
            profilePicture: '/images/default-profile.png', // Set default profile picture
            bio: '',
            role: 'User',
            location: 'Unknown',
            onlineStatus: false,
            lastLogin: Date.now(),
            accountCreated: Date.now(),
            preferences: { theme: 'light', notifications: true },
            isBanned: false
        });

        await newUser.save();
        res.render('signup', { errorMessage: 'User successfully registered!' }); // Success message
    } catch (error) {
        console.error('Error signing up user:', error);
        res.render('signup', { errorMessage: 'Error signing up user' }); // Pass error message on failure
    }
});

// Login Route
app.get('/login', (req, res) => {
    res.render('login', { errorMessage: '' });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.render('login', { errorMessage: 'Invalid username or password' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('login', { errorMessage: 'Invalid username or password' });
        }

        // Update lastLogin and onlineStatus
        user.lastLogin = Date.now();
        user.onlineStatus = true;
        await user.save();

        req.session.userId = user._id; // Make sure session is set correctly
        req.user = user; // Attach user to the request object

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Error logging in user');
    }
});

// Dashboard Route (Protected)
app.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        const groups = await Group.find({ members: { $in: [user._id] } });
        const projects = await Project.find({ collaborators: { $in: [user._id] } });

        res.render('dashboard', {
            user: {
                name: user.name,
                username: user.username,
                email: user.email,
                uuid: user._id,
                profilePicture: user.profilePicture,
                bio: user.bio,
                role: user.role,
                location: user.location,
                onlineStatus: user.onlineStatus,
                lastLogin: user.lastLogin,
                preferences: user.preferences,
                isBanned: user.isBanned,
            },
            groups: groups,
            projects: projects
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.redirect('/login');
    }
});

app.get('/edit-profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        res.render('edit-profile', { user, errorMessage: '', successMessage: '' });
    } catch (error) {
        console.error('Error loading edit profile page:', error);
        res.redirect('/dashboard');
    }
});

app.post('/edit-profile', isAuthenticated, async (req, res) => {
    const { name, email, bio, location, theme, notifications } = req.body;

    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        // Update user fields
        user.name = name;
        user.email = email;
        user.bio = bio;
        user.location = location;
        user.preferences.theme = theme;
        user.preferences.notifications = notifications === 'on';

        await user.save();
        res.render('edit-profile', { user, successMessage: 'Profile updated successfully!', errorMessage: '' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.render('edit-profile', { user: req.body, successMessage: '', errorMessage: 'Error updating profile' });
    }
});

app.get('/profile/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).send('User not found');

        res.render('profile', { user });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Error fetching profile');
    }
});

// Groups page
app.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find().populate('owner').populate('members');
        const user = await User.findById(req.session.userId);
        console.log('Current User:', user);  // Debug line to check if user is set
        res.render('groups', { groups, currentUser: user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading groups");
    }
});


// Protect the route for creating a new group
app.get('/groups/new', isAuthenticated, (req, res) => {
    res.render('groups/new');
});

// Group creation route
app.post('/groups', isAuthenticated, async (req, res) => {
    const { name, description } = req.body;

    try {
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        // Create new group
        const newGroup = new Group({
            name,
            description,
            owner: user._id,
            members: [user._id],
        });

        await newGroup.save(); // Save the new group to the database

        // Fetch the updated list of groups to render the page with the new group
        const groups = await Group.find().populate('owner').populate('members');
        
        // Render the updated groups page
        res.render('groups', { groups, currentUser: req.user });

    } catch (error) {
        console.error('Error creating group:', error);
        res.redirect('/groups');
    }
});

// View specific group
app.get('/groups/:groupId', isAuthenticated, async (req, res) => {
    // const group = await Group.findById(req.params.groupId);
    // if (!group) return res.status(404).send('Group not found');
    // res.render('groups/show', { group });
    try {
        const group = await Group.findById(req.params.groupId).populate('members', 'name username');

        res.render('groups/show', { 
            group: group
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.redirect('/login');
    }
});

// Group Joining
app.post('/groups/:groupId/join', isAuthenticated, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login'); // Ensure user is logged in

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).send('Group not found');
        }

        // Check if the user is already a member of the group
        if (group.members.some(member => member._id.toString() === user._id.toString())) {
            return res.redirect('/groups'); // Redirect back if already a member
        }

        // Add the user to the group's members array
        group.members.push(user._id);
        await group.save();

        res.redirect('/groups'); // Redirect back to groups page
    } catch (error) {
        console.error(error);
        res.status(500).send('Error joining group');
    }
});


// Group Leaving
app.post('/groups/:groupId/leave', isAuthenticated, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        //const userId = req.user._id;
        const user = await User.findById(req.session.userId);
        if (!user) return res.redirect('/login');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).send('Group not found');
        }

        group.members = group.members.filter(member => member._id.toString() !== user._id.toString());
        await group.save();

        res.redirect('/groups');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error leaving group');
    }
});

// Projects Page
app.get('/projects', isAuthenticated, async (req, res) => {
    try {
        const projects = await Project.find().populate('owner');
        res.render('projects', { projects });
    } catch (err) {
        console.error('Error loading projects:', err);
        res.status(500).send('Error loading projects');
    }
});

// New Project Form
app.get('/projects/new', isAuthenticated, async (req, res) => {
    try {
        const userGroups = await Group.find({ members: req.session.userId });
        res.render('projects/new', { groups: userGroups }); // ✅ pass groups
    } catch (err) {
        console.error('Error loading groups for project creation:', err);
        res.status(500).send('Error loading project creation form');
    }
});

// Create Project
app.post('/projects', isAuthenticated, async (req, res) => {
    try {
        const { name, description, status, deadline, notes, group } = req.body;
        const owner = req.session.userId;

        let collaborators = [owner]; // Default: owner only

        // If a group is selected, use its members
        if (group) {
            const groupData = await Group.findById(group).populate('members');
            if (groupData) {
                collaborators = groupData.members.map(member => member._id);
            } else {
                // If group doesn't exist, handle the error
                return res.status(400).send('Invalid group selected.');
            }
        }

        const project = new Project({
            name,
            description,
            status: status || 'Planning',
            deadline: deadline ? new Date(deadline) : undefined,
            notes,
            owner,
            collaborators,
            activity: [{ message: 'Project created', timestamp: new Date() }]
        });

        await project.save();
        res.redirect('/projects'); // Redirect to projects page after saving
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).send('Error creating project');
    }
});

// View specific project
app.get('/projects/:projectId', isAuthenticated, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId)
            .populate('owner', 'username')
            .populate('collaborators', 'username')
            .populate('tasks.assignedTo', 'username');

        if (!project) return res.status(404).send('Project not found');

        res.render('projects/show', { project });
    } catch (err) {
        console.error('Error loading project:', err);
        res.status(500).send('Error loading project');
    }
});

// Project POST function
app.post('/projects/:id', async (req, res) => {
    const { status, deadline } = req.body;
    const updateData = { status, updatedAt: new Date() };
    if (deadline) updateData.deadline = new Date(deadline);

    await Project.findByIdAndUpdate(req.params.id, updateData);
    res.redirect(`/projects/${req.params.id}`);
});

app.post('/projects/:projectId/tasks', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, description, dueDate, assignedTo } = req.body;

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).send('Project not found');
        }

        // Create a new task object
        const newTask = {
            title,
            description,
            dueDate,
            assignedTo: assignedTo || null // in case no one is assigned
        };

        // Push the new task into the project's tasks array
        project.tasks.push(newTask);

        // Update updatedAt field
        project.updatedAt = Date.now();

        // Save the project
        await project.save();

        res.redirect(`/projects/${projectId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error creating task');
    }
});

// Show form to create new task
app.get('/projects/:projectId/tasks/new', isAuthenticated, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId).populate('collaborators');
        if (!project) return res.status(404).send('Project not found');

        res.render('tasks/new', {
            projectId: project._id,
            collaborators: project.collaborators
        });
    } catch (err) {
        console.error('Error showing new task form:', err);
        res.status(500).send('Server error');
    }
});

// Task detail page
app.get('/projects/:projectId/tasks/:taskId', async (req, res) => {
    const { projectId, taskId } = req.params;
    try {
        const project = await Project.findById(projectId)
            .populate('owner')
            .populate('collaborators')
            .populate('tasks.assignedTo');

        if (!project) {
            return res.status(404).send('Project not found.');
        }

        const task = project.tasks.id(taskId);

        if (!task) {
            return res.status(404).send('Task not found.');
        }

        res.render('tasks/show', { project, task });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Edit Task
app.post('/projects/:projectId/tasks/:taskId/edit', async (req, res) => {
    try {
        const { title, description, dueDate, status } = req.body;
        const { projectId, taskId } = req.params;

        // Find the project and update the task in the tasks array
        const project = await Project.findById(projectId);
        const task = project.tasks.id(taskId);

        // Update task details
        task.title = title || task.title;
        task.description = description || task.description;
        task.dueDate = dueDate ? new Date(dueDate) : task.dueDate;
        task.status = status || task.status;

        await project.save();  // Save the updated project

        // Redirect to the project page or task details page
        res.redirect(`/projects/${projectId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delete Task
app.post('/projects/:projectId/tasks/:taskId/delete', async (req, res) => {
    try {
        const { projectId, taskId } = req.params;

        // Find the project and pull the task from the tasks array
        const project = await Project.findById(projectId);
        project.tasks.pull({ _id: taskId });  // Use pull to remove the task by its ID

        await project.save();  // Save the updated project

        // Redirect back to the project page
        res.redirect(`/projects/${projectId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Discussions
app.get('/discussions', async (req, res) => {
    try {
        const discussions = await Discussion.find().populate('author');
        res.render('discussions/index', { discussions });
    } catch (error) {
        console.error('Error fetching discussions:', error);
        res.status(500).send('Error loading discussions');
    }
});

app.get('/discussions/new', isAuthenticated, (req, res) => {
    res.render('discussions/new', { errorMessage: '' });
});

// Create Discussion
app.post('/discussions', isAuthenticated, async (req, res) => {
    const { title, content } = req.body;
    try {
        const newDiscussion = new Discussion({
            title,
            content,
            author: req.session.userId
        });

        await newDiscussion.save();
        res.redirect('/discussions');
    } catch (err) {
        console.error('Error creating discussion:', err);
        res.render('discussions/new', { errorMessage: 'Failed to create discussion' });
    }
});

// View Discussion
app.get('/discussions/:id', async (req, res) => {
    try {
        const discussion = await Discussion.findById(req.params.id)
            .populate('author')
            .populate('comments.author');

        if (!discussion) return res.status(404).send('Discussion not found');
        res.render('discussions/show', { discussion });
    } catch (error) {
        console.error('Error fetching discussion:', error);
        res.status(500).send('Error loading discussion');
    }
});

// Comment Route
app.post('/discussions/:id/comments', isAuthenticated, async (req, res) => {
    const { comment } = req.body;

    try {
        const discussion = await Discussion.findById(req.params.id);
        if (!discussion) return res.status(404).send('Discussion not found');

        discussion.comments.push({
            content: comment,
            author: req.session.userId
        });

        await discussion.save();
        res.redirect(`/discussions/${discussion._id}`);
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).send('Failed to add comment');
    }
});

// OpenAI Text Generation Route
app.post('/openai/generate', async (req, res) => {
    const { prompt, maxTokens, temperature, model } = req.body; // Allow these inputs from the client

    if (!prompt) {
        return res.status(400).json({ error: 'No prompt provided' });
    }

    // Set default values for parameters if they're not provided
    const modelToUse = model || 'davinci-002';  // Use GPT-3.5-turbo by default
    const maxTokensToUse = maxTokens || 150; // Set a default max token limit
    const temperatureToUse = temperature || 0.7; // Default temperature (for randomness)

    try {
        // Call the OpenAI API with the dynamic values
        const response = await openai.completions.create({
            model: modelToUse,
            prompt: prompt,
            max_tokens: maxTokensToUse, 
            temperature: temperatureToUse,
            messages: [{ role: "user", content: prompt }],
        });

        // Send the response from OpenAI
        res.json({ response: response.choices[0].text.trim() });
    } catch (error) {
        console.error('Error interacting with OpenAI:', error);
        res.status(500).json({ error: 'Error generating response' });
    }
});

// Logout Route
app.get('/logout', async (req, res) => {
    if (req.session.userId) {
        await User.findByIdAndUpdate(req.session.userId, { onlineStatus: false });
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Server Start
const port = 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
