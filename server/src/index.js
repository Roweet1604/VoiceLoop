import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import healthRouter from "./routes/health.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

app.use("/api/health", healthRouter);

connectDB(process.env.MONGODB_URI)
  .catch((err) => console.error("MongoDB connection failed:", err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
