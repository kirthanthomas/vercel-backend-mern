const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const { validateRegistration } = require("../validation");

const router = express.Router();
const createToken = (user) => jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: "7d" });
const publicUser = (user) => ({ id: user._id.toString(), name: user.name, email: user.email, role: user.role });

router.post("/register", async (req, res) => {
    try {
        const { errors, data } = validateRegistration(req.body);
        if (Object.keys(errors).length) return res.status(400).json({ message: "Please correct the highlighted fields", errors });
        const user = await User.create({ name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 12) });
        return res.status(201).json({ token: createToken(user), user: publicUser(user) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists" });
        if (error.name === "ValidationError") return res.status(400).json({ message: "Invalid account details" });
        return res.status(500).json({ message: "Could not register user" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).some((key) => !["email", "password"].includes(key))) return res.status(400).json({ message: "Request must contain only an email and password" });
        if (!email || email.length > 254 || !password || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ message: "Enter a valid email and password" });
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: "Invalid email or password" });
        return res.json({ token: createToken(user), user: publicUser(user) });
    } catch {
        return res.status(500).json({ message: "Could not log in" });
    }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
