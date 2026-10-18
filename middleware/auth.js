const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next, optional = false) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token && optional) return next();
    if (!token) return res.status(401).json({ message: "Authentication token required" });

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: "Invalid or expired authentication token" });
    }

    try {
        const user = await User.findById(payload.id).select("name email role");
        if (!user) return res.status(401).json({ message: "Account no longer exists" });
        req.user = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

function requireAuth(req, res, next) {
    return authenticate(req, res, next);
}

function optionalAuth(req, res, next) {
    return authenticate(req, res, next, true);
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Administrator access required" });
    next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
