const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/safety_detective';
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

// Options that never throw, so the app and scripts can read them without full validation.
function getRuntimeOptions(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    production,
    mongoUri: env.MONGO_URI || (production ? '' : DEFAULT_MONGO_URI),
    corsOrigins: (env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN).split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean),
    serveFrontend: env.SERVE_FRONTEND !== 'false'
  };
}

function getConfig(env = process.env) {
  const options = getRuntimeOptions(env);
  const { mongoUri } = options;
  if (!mongoUri) throw new Error('MONGO_URI is required in production');
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGO_URI must be a MongoDB connection string');
  if (!env.JWT_SECRET || /^(your_jwt_secret_here|changeme)$/i.test(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters and must not be a placeholder');
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  return { ...options, port, seedOnStart: env.SEED_ON_START === 'true' };
}
module.exports = { getConfig, getRuntimeOptions };
