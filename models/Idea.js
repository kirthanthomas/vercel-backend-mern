const mongoose = require("mongoose");

const ideaSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
        problemStatement: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
        domain: {
            type: String,
            required: true,
            enum: ["Campus life", "Sustainability", "Learning", "Wellbeing", "Technology"]
        },
        technologies: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
        expectedImpact: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
        author: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
        authorRole: { type: String, default: "Student", trim: true, maxlength: 60 },
        status: { type: String, enum: ["Submitted", "Under review", "Approved", "Prototype", "Implemented"], default: "Submitted" },
        votes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        voterIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [], select: false }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Idea", ideaSchema);