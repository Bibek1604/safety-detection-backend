const express = require('express');
const router = express.Router();
const employeeService = require('../services/employeeService');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('employee'));

router.get('/history', async (req, res) => {
  try {
    const history = await employeeService.getHistory(req.user.userId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
