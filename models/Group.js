const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // List of user IDs
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Group creator
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', GroupSchema);
