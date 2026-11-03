import "dotenv/config"; // must stay the very first line, so env vars exist before anything else loads

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { clerkMiddleware } from "@clerk/express";
import noticeRoutes from "./src/routes/noticeRoutes";
import { connectDB } from "./src/utils/features";
import { rateLimitMiddleware } from "./src/middleware/rateLimitMiddleware";
import eventRoutes from "./src/routes/eventRoutes";
import indexRoutes from "./src/routes/indexRouetes";
import featureRoutes from "./src/routes/featureRoutes";
import glanceRoutes from "./src/routes/glanceRoutes";
import linkageRoutes from "./src/routes/linkageRoutes";
import { errorHandler, notFound } from "./src/middleware/errorHandler";
import chatRoutes from "./src/routes/chatRoutes";
import facilityRoutes from "./src/routes/facilityRoutes";
import programmeRoutes from "./src/routes/programmeRoutes";

const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

connectDB(process.env.MONGO_URI || "");

const app = express();

// Render: Cloudflare -> Render proxy -> app (3 hops), so req.ip is the real visitor
app.set("trust proxy", 3);

// security headers; "cross-origin" lets your frontend load responses from this API
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS: localhost only outside production
const allowedOrigins = [
  "https://iic-sibsagar-frontend.vercel.app",
  process.env.FRONTEND_URL,
  ...(isProd ? [] : ["http://localhost:3000", "http://localhost:3001"]),
].filter((o): o is string => Boolean(o));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// health check: before the rate limiter, so uptime pings never count against the limit
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Redis rate limit for every /api request: after CORS (a 429 still carries CORS headers), before body parsing and auth
app.use("/api", rateLimitMiddleware);

app.use(express.json({ limit: "100kb" })); // JSON bodies are small; file uploads go through multer, not here
app.use(clerkMiddleware());

app.get("/", (_req, res) => {
  res.send("IIC & RDC API");
});
// app.get("/debug-ip", (req, res) => {
//   res.json({
//     ip: req.ip,
//     ips: req.ips,
//     xff: req.headers["x-forwarded-for"],
//     trueClient: req.headers["true-client-ip"],
//     cf: req.headers["cf-connecting-ip"],
//   });
// });
app.use("/api/events", eventRoutes);
app.use("/api/features", featureRoutes);
app.use("/api/glance", glanceRoutes);
app.use("/api/linkages", linkageRoutes);
app.use("/api/notices", noticeRoutes)
app.use("/api/index", indexRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/facilities", facilityRoutes);
app.use("/api/programmes", programmeRoutes);
app.use(notFound); // after all routes
app.use(errorHandler); // last

app.listen(port, () => {
  console.log("server working on", port);
});