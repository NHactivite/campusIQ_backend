"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config"); // must stay the very first line, so env vars exist before anything else loads
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_2 = require("@clerk/express");
const features_1 = require("./src/utils/features");
const rateLimitMiddleware_1 = require("./src/middleware/rateLimitMiddleware");
const eventRoutes_1 = __importDefault(require("./src/routes/eventRoutes"));
const featureRoutes_1 = __importDefault(require("./src/routes/featureRoutes"));
const glanceRoutes_1 = __importDefault(require("./src/routes/glanceRoutes"));
const linkageRoutes_1 = __importDefault(require("./src/routes/linkageRoutes"));
const errorHandler_1 = require("./src/middleware/errorHandler");
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
(0, features_1.connectDB)(process.env.MONGO_URI || "");
const app = (0, express_1.default)();
// Render sits behind a proxy: needed so req.ip is the real visitor, which the rate limiter relies on
app.set("trust proxy", 1);
// security headers; "cross-origin" lets your frontend load responses from this API
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// CORS: localhost only outside production
const allowedOrigins = [
    "https://iic-sibsagar-frontend.vercel.app",
    process.env.FRONTEND_URL,
    ...(isProd ? [] : ["http://localhost:3000", "http://localhost:3001"]),
].filter((o) => Boolean(o));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
}));
// health check: before the rate limiter, so uptime pings never count against the limit
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
// Redis rate limit for every /api request: after CORS (a 429 still carries CORS headers), before body parsing and auth
app.use("/api", rateLimitMiddleware_1.rateLimitMiddleware);
app.use(express_1.default.json({ limit: "100kb" })); // JSON bodies are small; file uploads go through multer, not here
app.use((0, express_2.clerkMiddleware)());
app.get("/", (_req, res) => {
    res.send("IIC & RDC API");
});
app.use("/api/events", eventRoutes_1.default);
app.use("/api/features", featureRoutes_1.default);
app.use("/api/glance", glanceRoutes_1.default);
app.use("/api/linkages", linkageRoutes_1.default);
app.use(errorHandler_1.notFound); // after all routes
app.use(errorHandler_1.errorHandler); // last
app.listen(port, () => {
    console.log("server working on", port);
});
