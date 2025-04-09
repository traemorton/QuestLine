const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const MongoStore = require('connect-mongo');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

const User = require('./models/User');

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
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

        res.render('dashboard', { 
            user: {
                name: user.name,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture,
                bio: user.bio,
                role: user.role,
                location: user.location,
                onlineStatus: user.onlineStatus,
                lastLogin: user.lastLogin,
                preferences: user.preferences,
                isBanned: user.isBanned
            }
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
const Group = require('./models/Group');
app.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find().populate('owner');
        res.render('groups', { groups });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading groups");
    }
});

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Protect the route for creating a new group
app.get('/groups/new', isAuthenticated, (req, res) => {
    res.render('groups/new');
});

// Group creation route
app.post('/groups', isAuthenticated, async (req, res) => {
    const { name, description } = req.body;

    try {
        const newGroup = new Group({
            name,
            description,
            owner: req.user._id,  // Use req.user, which is set after login
            members: [req.user._id],
        });

        await newGroup.save();
        res.redirect('/groups');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
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
