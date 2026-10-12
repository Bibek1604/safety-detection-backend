const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { getRuntimeOptions } = require('./config');

function createApp({ dist = path.join(__dirname, '../frontend/dist') } = {}) {
  const { corsOrigins, serveFrontend } = getRuntimeOptions();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: 'Database temporarily unavailable' });
    next();
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/game', require('./routes/game'));
  app.use('/api/employee', require('./routes/employee'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

  if (serveFrontend && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    // Missing assets must return 404 rather than an HTML document.
    app.use('/assets', (req, res) => res.sendStatus(404));
    app.get('*', (req, res) => {
      if (path.extname(req.path)) return res.sendStatus(404);
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
  });
  return app;
}
module.exports = { createApp };
