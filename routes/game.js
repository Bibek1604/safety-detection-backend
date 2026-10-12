const express = require("express");
const router = express.Router();
const gameService = require("../services/gameService");
const { authenticate, requireRole } = require("../middleware/auth");
const Incident = require("../models/Incident");

router.use(authenticate, requireRole("employee"));

// Return incident scene data — correctOptionId fields stripped, options shuffled per request
router.get("/incident", async (req, res) => {
  try {
    const caseId = req.query.caseId || "case001";
    if (!["case001", "case002"].includes(caseId)) return res.status(400).json({ error: "Invalid caseId" });
    await gameService.assertCaseAccess(req.user.userId, caseId);
    const incident = await Incident.findOne({ caseId }, {
      "whyChain.correctOptionId": 0
    });
    if (!incident) return res.status(404).json({ error: `No incident found for caseId: ${caseId}` });

    // Convert to plain object so we can mutate without touching the DB document.
    // correctOptionId was already excluded by the projection above.
    const data = incident.toObject();

    // Fisher-Yates shuffle — applied independently to each step's options array,
    // fresh on every request so each new attempt sees a different order.
    const fisherYates = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    };
    if (data.whyChain) {
      for (const step of data.whyChain) {
        if (Array.isArray(step.options)) fisherYates(step.options);
      }
    }

    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// Start a new attempt
router.post("/start", async (req, res) => {
  try {
    const attemptId = await gameService.startAttempt(req.user.userId, req.body.incidentId);
    res.json({ attemptId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record a clue or decoy click
router.post("/clue-click", async (req, res) => {
  try {
    const { attemptId, hotspotId } = req.body;
    const result = await gameService.processClueClick(attemptId, hotspotId, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Submit one step of the 5-Why chain (whyOrder 1-5)
router.post("/submit-why", async (req, res) => {
  try {
    const { attemptId, whyOrder, optionId } = req.body;
    if (!Number.isInteger(whyOrder) || whyOrder < 1 || whyOrder > 5) {
      return res.status(400).json({ error: "whyOrder must be 1-5" });
    }
    const result = await gameService.submitWhyStep(attemptId, Number(whyOrder), optionId, req.user.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Finalise the attempt
router.post("/finish", async (req, res) => {
  try {
    const { attemptId, timeTakenSeconds, timedOut } = req.body;
    const result = await gameService.finishAttempt(attemptId, req.user.userId, timeTakenSeconds, timedOut);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
