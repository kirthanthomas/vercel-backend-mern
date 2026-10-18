const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ["Workshop", "Hackathon", "Seminar", "Masterclass", "Competition"]
    },
    resourcePerson: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    venue: {
        type: String,
        required: true
    },
    maxParticipants: {
        type: Number,
        required: true
    },
    registrationStatus: {
        type: String,
        required: true,
        enum: ["Open", "Closed"]
    }
});

module.exports = mongoose.model("Event", eventSchema);