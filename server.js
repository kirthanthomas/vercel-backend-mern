const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { randomBytes } = require("node:crypto");
const { rateLimit } = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const ideaRoutes = require("./routes/ideas");

const app = express();
const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port number");
if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required to start the API");
if (!process.env.JWT_SECRET) {
    if (isProduction) throw new Error("JWT_SECRET must be configured in production");
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    console.warn("JWT_SECRET is not set; a temporary development-only secret is being used.");
}
if (Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) throw new Error("JWT_SECRET must be at least 32 bytes long");

// Maintain cached MongoDB connection for serverless cold-starts
// MongoDB connection
let isConnected = false;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000
        });

        isConnected = true;
        console.log("MongoDB Atlas connected successfully!");
    } catch (error) {
        isConnected = false;
        console.error("MongoDB connection failed:", error.message);
    }
};

connectDB();

app.disable("x-powered-by");
app.use(helmet());

const configuredOrigins = (process.env.CLIENT_ORIGIN || (isProduction ? "" : "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"))
    .split(",").map((origin) => origin.trim()).filter(Boolean);

const createRateLimiter = (limit) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ message: "Too many requests. Please try again later." })
});

app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json({ limit: "32kb" }));
app.use(createRateLimiter(300));

// Root route
app.get("/", (req, res) => {
    res.json({
        status: "ok",
        message: "Server is running",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
});

// API Routes
app.use("/api/auth", createRateLimiter(12));
app.use("/api/auth", authRoutes);
app.use("/api/ideas", ideaRoutes);
app.get("/api/health", (req, res) => res.json({ 
    status: "ok", 
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" 
}));

// 404 Handler
app.use((req, res) => res.status(404).json({ message: "API route not found" }));

// Error handling middleware
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) return res.status(400).json({ message: "Request body contains invalid JSON" });
    if (error.type === "entity.too.large") return res.status(413).json({ message: "Request body is too large" });
    if (error.message === "Origin is not allowed by CORS") return res.status(403).json({ message: "This website origin is not allowed" });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Request validation failed", errors: Object.values(error.errors).map((item) => item.message) });
    if (error.name === "CastError") return res.status(400).json({ message: "Invalid value provided" });
    if (error.code === 11000) return res.status(409).json({ message: "A record with these details already exists" });
    console.error("Unhandled API error:", error);
    return res.status(500).json({ message: "An unexpected server error occurred" });
});

// Run app.listen only when running locally (not in serverless/Vercel)
if (process.env.NODE_ENV !== "production") {
    app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;