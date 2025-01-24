const mongoose = require('mongoose');
const User = require('../models/User'); // Adjust this path based on your actual User model location

const seedUsers = async () => {
    try {
        const users = [
            { name: 'John Doe', email: 'john@example.com', password: 'password123' },
            { name: 'Jane Doe', email: 'jane@example.com', password: 'securepassword' },
            { name: 'Test User', email: 'test@example.com', password: 'testpassword' },
        ];

        await User.deleteMany({}); // Clear existing users (optional)
        const createdUsers = await User.insertMany(users);
        console.log('Test users inserted:', createdUsers);
    } catch (error) {
        console.error('Error seeding users:', error);
    }
};

seedUsers();