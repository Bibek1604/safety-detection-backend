const express = require("express");
const router = express.Router();
const authService = require("../services/authService");

router.post("/signup", async (req, res) => {
  try {
    const result = await authService.signup(req.body);
    // Return token + user so the client can auto-login after signup
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

module.exports = router;
