import { Router } from "express";

const router = Router();

// Liveness check for hosts and uptime monitors: answers as soon as the
// process is up, without touching the database.
router.get("/", (req, res) => {
  res.json({ ok: true });
});

export default router;
