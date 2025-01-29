const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Default fields
    name: { type: String, required: true },
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        match: [/^\S+$/, 'Usernames cannot contain spaces'] // Ensures no spaces
    },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Additional fields
    profilePicture: { type: String, default: '/images/default-profile.png' }, // Path to profile image
    bio: { type: String, default: '' },
    role: { type: String, enum: ['User', 'Admin', 'Moderator'], default: 'User' },
    location: { type: String, default: 'Unknown' },
    onlineStatus: { type: Boolean, default: false },
    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }], // References to groups they are part of
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Friend' }], // Friend list
    lastLogin: { type: Date, default: Date.now }, // Last login timestamp
    accountCreated: { type: Date, default: Date.now }, // Account creation date
    preferences: {
        theme: { type: String, enum: ['light', 'dark'], default: 'light' },
        notifications: { type: Boolean, default: true },
    },
    isBanned: { type: Boolean, default: false }, // Ban status
    }, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
