const express = require("express");
const mongoose = require("mongoose");
const Idea = require("../models/Idea");
const { requireAuth, optionalAuth, requireAdmin } = require("../middleware/auth");
const { domains, validateIdea } = require("../validation");

const router = express.Router();
const statuses = ["Submitted", "Under review", "Approved", "Prototype", "Implemented"];
const sorts = ["newest", "oldest", "votes", "highest"];
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const makePublicIdea = (idea, userId) => {
    const { voterIds, ...publicIdea } = idea;
    if (userId) publicIdea.hasVoted = voterIds?.some((voterId) => voterId.toString() === userId.toString()) || false;
    return publicIdea;
};

router.get("/", optionalAuth, async (req, res, next) => {
    try {
        const { search = "", domain, status, sort = "newest", page = "1", limit = "9" } = req.query;
        if (typeof search !== "string" || search.length > 100) return res.status(400).json({ message: "Search must be 100 characters or fewer" });
        if (domain && (typeof domain !== "string" || !domains.includes(domain))) return res.status(400).json({ message: "Invalid domain filter" });
        if (status && (typeof status !== "string" || !statuses.includes(status))) return res.status(400).json({ message: "Invalid status filter" });
        if (typeof sort !== "string" || !sorts.includes(sort)) return res.status(400).json({ message: "Invalid sort order" });

        const pageNumber = Number(page);
        const pageSize = Number(limit);
        if (!Number.isInteger(pageNumber) || pageNumber < 1) return res.status(400).json({ message: "Page must be a positive integer" });
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return res.status(400).json({ message: "Limit must be between 1 and 50" });

        const filter = {};
        const term = search.trim();
        if (term) {
            const safeTerm = escapeRegex(term);
            filter.$or = ["title", "problemStatement", "technologies"].map((field) => ({ [field]: { $regex: safeTerm, $options: "i" } }));
        }
        if (domain) filter.domain = domain;
        if (status) filter.status = status;

        const sortBy = sort === "oldest" ? { createdAt: 1 } : ["votes", "highest"].includes(sort) ? { votes: -1, createdAt: -1 } : { createdAt: -1 };
        let query = Idea.find(filter).sort(sortBy).skip((pageNumber - 1) * pageSize).limit(pageSize);
        if (req.user) query = query.select("+voterIds");
        const [ideas, total] = await Promise.all([query.lean(), Idea.countDocuments(filter)]);
        const data = ideas.map((idea) => makePublicIdea(idea, req.user?._id));
        return res.json({ data, pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) } });
    } catch (error) {
        return next(error);
    }
});

router.get("/stats", async (req, res, next) => {
    try {
        const [totalIdeas, voteTotals, byStatus, byDomain] = await Promise.all([
            Idea.countDocuments(),
            Idea.aggregate([{ $group: { _id: null, total: { $sum: "$votes" } } }]),
            Idea.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            Idea.aggregate([{ $group: { _id: "$domain", count: { $sum: 1 } } }])
        ]);
        return res.json({ totalIdeas, totalVotes: voteTotals[0]?.total || 0, byStatus, byDomain });
    } catch (error) {
        return next(error);
    }
});

router.get("/:id", optionalAuth, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid idea id" });
    try {
        let query = Idea.findById(req.params.id);
        if (req.user) query = query.select("+voterIds");
        const idea = await query.lean();
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        return res.json(makePublicIdea(idea, req.user?._id));
    } catch (error) {
        return next(error);
    }
});

router.post("/", requireAuth, async (req, res, next) => {
    const { data, errors } = validateIdea(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the idea details", errors });
    try {
        const duplicate = await Idea.findOne({ domain: data.domain, $or: [{ title: data.title }, { problemStatement: data.problemStatement }] });
        if (duplicate) return res.status(409).json({ message: "A similar idea already exists in this domain" });
        const idea = await Idea.create({
            ...data,
            author: req.user.name,
            authorRole: req.user.role === "admin" ? "Administrator" : "Student",
            owner: req.user._id
        });
        return res.status(201).json(idea);
    } catch (error) {
        return next(error);
    }
});

router.put("/:id", requireAuth, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid idea id" });
    const { data, errors } = validateIdea(req.body, { partial: true });
    if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the idea details", errors });
    try {
        const idea = await Idea.findById(req.params.id);
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        const isOwner = idea.owner?.toString() === req.user._id.toString();
        if (!isOwner && req.user.role !== "admin") return res.status(403).json({ message: "You can only edit your own ideas" });
        const updated = await Idea.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true });
        return res.json(updated);
    } catch (error) {
        return next(error);
    }
});

router.patch("/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid idea id" });
    if (!statuses.includes(req.body?.status)) return res.status(400).json({ message: `Status must be one of: ${statuses.join(", ")}` });
    try {
        const idea = await Idea.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true, runValidators: true });
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        return res.json(idea);
    } catch (error) {
        return next(error);
    }
});

router.post("/:id/vote", requireAuth, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid idea id" });
    try {
        const voterId = req.user._id;
        const idea = await Idea.findOneAndUpdate(
            { _id: req.params.id, owner: { $ne: voterId }, voterIds: { $ne: voterId } },
            { $addToSet: { voterIds: voterId }, $inc: { votes: 1 } },
            { new: true }
        );
        if (idea) return res.json({ id: idea._id, votes: idea.votes, hasVoted: true });
        const existing = await Idea.findById(req.params.id).select("owner");
        if (!existing) return res.status(404).json({ message: "Idea not found" });
        if (existing.owner?.toString() === voterId.toString()) return res.status(403).json({ message: "You cannot vote for your own idea" });
        return res.status(409).json({ message: "You have already voted for this idea" });
    } catch (error) {
        return next(error);
    }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid idea id" });
    try {
        const idea = await Idea.findById(req.params.id);
        if (!idea) return res.status(404).json({ message: "Idea not found" });
        const isOwner = idea.owner?.toString() === req.user._id.toString();
        if (!isOwner && req.user.role !== "admin") return res.status(403).json({ message: "You can only delete your own ideas" });
        await idea.deleteOne();
        return res.json({ message: "Idea deleted" });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;