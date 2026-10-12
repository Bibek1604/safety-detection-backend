const express = require('express');
const router = express.Router();
const adminService = require('../services/adminService');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

router.get('/results', async (req, res) => {
  try {
    const results = await adminService.getResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/employees', async (req, res) => {
  try {
    const employees = await adminService.getEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    await adminService.deleteEmployee(req.params.id);
    res.json({ message: 'Employee deleted' });
  } catch (error) {
    const status = error.message === 'Employee not found' ? 404
                 : error.message === 'Cannot delete an admin account' ? 403
                 : 500;
    res.status(status).json({ error: error.message });
  }
});

module.exports = router;
