import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDB } from "./config/db.js";
import healthRouter from "./routes/health.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
// Rate limit before parsing bodies so malformed or oversized payloads still count.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { message: "Too many requests, please try again later", code: "RATE_LIMITED" } },
  })
);
app.use(express.json({ limit: "100kb" }));

app.use("/api/health", healthRouter);

app.use(notFound);
app.use(errorHandler);

connectDB(process.env.MONGODB_URI)
  .catch((err) => console.error("MongoDB connection failed:", err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
