const { getConfig } = require('./config');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { seedData } = require('./seed');

async function start() {
  const config = getConfig();
  const fs = require('fs');
  const path = require('path');
  if (config.production && config.serveFrontend && !fs.existsSync(path.join(__dirname, '../frontend/dist/index.html'))) {
    throw new Error('Frontend build missing. Run npm run build from the repository root.');
  }
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log('MongoDB connected');
  if (config.seedOnStart) await seedData();
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => console.log('Server listening on port ' + config.port));
  server.on('error', async () => {
    console.error('HTTP server failed to start');
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  const shutdown = () => {
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
      await mongoose.disconnect();
      clearTimeout(deadline);
      process.exit(0);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}
if (require.main === module) start().catch(async () => {
  console.error('Startup failed. Check database access, MONGO_URI, JWT_SECRET, admin credentials and build output.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
module.exports = { start };
