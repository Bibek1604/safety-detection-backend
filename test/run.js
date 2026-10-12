const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function loadService(file, mocks, env = { JWT_SECRET: "test-secret" }) {
  const source = await fs.readFile(path.join(__dirname, '../', file), 'utf8');
  const sandbox = { module: { exports: {} }, require: name => {
    if (!(name in mocks)) throw new Error('Unexpected dependency: ' + name);
    return mocks[name];
  }, Buffer, Date, Math, console, process: { env } };
  vm.runInNewContext(source, sandbox, { filename: file });
  return sandbox.module.exports;
}

async function run() {
  let passed = 0;
  const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
  const { getConfig } = require('../config');
  const secret = 'a'.repeat(32);
  await check('production requires remote database configuration', () => assert.throws(() => getConfig({ NODE_ENV: 'production', JWT_SECRET: secret }), /MONGO_URI/));
  await check('reject placeholder secrets', () => assert.throws(() => getConfig({ JWT_SECRET: 'your_jwt_secret_here' }), /JWT_SECRET/));
  await check('reject invalid ports', () => assert.throws(() => getConfig({ JWT_SECRET: secret, PORT: 'bad' }), /PORT/));
  await check('honor Render port and seed flag', () => {
    const c = getConfig({ NODE_ENV: 'production', MONGO_URI: 'mongodb+srv://example.invalid/app', JWT_SECRET: secret, PORT: '10000', SEED_ON_START: 'true' });
    assert.equal(c.port, 10000); assert.equal(c.seedOnStart, true);
  });

  await check('standalone backend can disable frontend serving', () => assert.equal(getConfig({ NODE_ENV: 'production', MONGO_URI: 'mongodb+srv://example.invalid/app', JWT_SECRET: secret, SERVE_FRONTEND: 'false' }).serveFrontend, false));

  let queriedEmail;
  const auth = await loadService('services/authService.js', {
    bcryptjs: { compare: async () => true }, jsonwebtoken: { sign: () => 'token' },
    '../models/User': { findOne: query => {
      queriedEmail = query.email;
      return { select: async () => ({ _id: 'user', role: 'employee', passwordHash: 'hash', toJSON: () => ({ name: 'Employee' }) }) };
    } }
  });
  await check('login normalizes email', async () => { await auth.login({ email: ' Employee@Example.com ', password: 'password' }); assert.equal(queriedEmail, 'employee@example.com'); });
  await check('reject object email input', () => assert.rejects(auth.login({ email: { $ne: null }, password: 'password' }), /valid email/));
  await check('reject missing login password', () => assert.rejects(auth.login({ email: 'employee@example.com' }), /Invalid email or password/));
  await check('reject malformed signup input', () => assert.rejects(auth.signup(null), /valid email/));
  await check('reject oversized passwords', () => assert.rejects(auth.login({ email: 'employee@example.com', password: 'a'.repeat(73) }), /Invalid email or password/));

  const incident = { _id: 'incident', caseId: 'case001', clues: [{ _id: 'clue', points: 15, feedbackText: 'Evidence' }], decoys: [], endSummary: 'Summary',
    whyChain: Array.from({ length: 5 }, (_, i) => ({ order: i + 1, points: i === 4 ? 20 : 10, correctOptionId: 'A', question: 'Why?', options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Wrong' }] })) };
  let attempt;
  const game = await loadService('services/gameService.js', {
    mongoose: { isObjectIdOrHexString: id => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id) },
    '../models/Incident': { findById: async () => incident, findOne: async () => incident },
    '../models/Attempt': { findOne: async query => query.userId === 'employee' ? attempt : null, exists: async () => null }
  });
  const id = 'a'.repeat(24);
  const reset = () => { attempt = { cluesFound: [], decoyClicks: [], whyChainAnswers: [], incidentId: 'incident', status: 'in-progress', save: async () => {} }; };
  reset();
  await check('reject invalid incident ID before database access', () => assert.rejects(game.startAttempt('employee', 'bad'), /Invalid incidentId/));
  await check('enforce case002 prerequisite', () => assert.rejects(game.assertCaseAccess('employee', 'case002'), /Pass case001/));
  await check('reject invalid attempt IDs', () => assert.rejects(game.processClueClick('bad', 'clue', 'employee'), /Invalid attemptId/));
  await check('enforce attempt ownership', () => assert.rejects(game.processClueClick(id, 'clue', 'someone-else'), /Attempt not found/));
  await check('questions require all clues', () => assert.rejects(game.submitWhyStep(id, 1, 'A', 'employee'), /Find all clues/));
  await check('award configured clue points exactly once', async () => {
    const first = await game.processClueClick(id, 'clue', 'employee'); const repeat = await game.processClueClick(id, 'clue', 'employee');
    assert.equal(first.pointDelta, 15); assert.equal(first.score, 15); assert.equal(repeat.pointDelta, 0); assert.equal(attempt.cluesFound.length, 1);
  });
  await check('reject out-of-order questions', () => assert.rejects(game.submitWhyStep(id, 2, 'A', 'employee'), /in order/));
  await check('reject fractional question order', () => assert.rejects(game.submitWhyStep(id, 1.5, 'A', 'employee'), /whyOrder/));
  await check('reject unknown answer options', () => assert.rejects(game.submitWhyStep(id, 1, 'Z', 'employee'), /Invalid optionId/));
  await check('answer retries preserve score and next question', async () => {
    const first = await game.submitWhyStep(id, 1, 'A', 'employee'); const retry = await game.submitWhyStep(id, 1, 'A', 'employee');
    assert.equal(retry.score, first.score); assert.equal(retry.nextQuestion.order, 2); assert.equal(retry.alreadyAnswered, true); assert.equal(attempt.whyChainAnswers.length, 1);
  });
  await check('reject incomplete normal finishes', () => assert.rejects(game.finishAttempt(id, 'employee', 60, false), /Complete the questions/));
  await check('reject negative or nonfinite time', async () => {
    await assert.rejects(game.finishAttempt(id, 'employee', -1, false), /Time/); await assert.rejects(game.finishAttempt(id, 'employee', NaN, false), /Time/);
  });
  await check('reject nonboolean timeout flags', () => assert.rejects(game.finishAttempt(id, 'employee', 60, 'false'), /boolean/));
  await check('finish retries return the saved result', async () => {
    for (let order = 2; order <= 5; order++) await game.submitWhyStep(id, order, 'A', 'employee');
    const result = await game.finishAttempt(id, 'employee', 60, false); const retry = await game.finishAttempt(id, 'employee', 60, false);
    assert.equal(result.score, 85); assert.equal(result.passed, true); assert.equal(retry.score, result.score); assert.equal(attempt.status, 'completed');
  });
  await check('timeout finishes allow partial games and have no speed bonus', async () => {
    reset(); const result = await game.finishAttempt(id, 'employee', 10, true); assert.equal(result.timeTakenSeconds, 180); assert.equal(result.score, 0);
  });

  let admin = null, adminWrites = 0, caseWrites = 0;
  const seedMocks = {
    './config': {}, mongoose: {}, bcryptjs: { hash: async () => 'hashed-password' },
    './models/User': {
      findOne: async () => admin,
      findOneAndUpdate: async (query, update) => { adminWrites++; admin = update.$setOnInsert; }
    },
    './models/Incident': { findOneAndUpdate: async () => { caseWrites++; } }
  };
  const seed = await loadService('seed.js', seedMocks, { NODE_ENV: 'production', ADMIN_EMAIL: 'Admin@Example.com', ADMIN_PASSWORD: 'unique-password-123' });
  await check('production seed creates configured admin and both cases', async () => {
    await seed.seedData(); assert.equal(admin.email, 'admin@example.com'); assert.equal(admin.role, 'admin'); assert.equal(caseWrites, 2);
  });
  await check('redeploy seed preserves existing admin password', async () => {
    admin.passwordHash = 'changed-password'; await seed.seedData(); assert.equal(adminWrites, 1); assert.equal(admin.passwordHash, 'changed-password');
  });
  await check('production seed rejects missing admin credentials', async () => {
    const missing = await loadService('seed.js', seedMocks, { NODE_ENV: 'production' }); await assert.rejects(missing.seedData(), /ADMIN_EMAIL/);
  });
  await check('seed refuses to promote an employee email', async () => {
    admin.role = 'employee'; await assert.rejects(seed.seedData(), /belongs to an employee/);
  });

  const mongoose = require('mongoose');
  const oldReady = mongoose.connection.readyState;
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'safety-detective-test-'));
  await fs.writeFile(path.join(fixture, 'index.html'), '<html>SPA fixture</html>');
  const { createApp } = require('../app');
  const server = await new Promise(resolve => { const s = createApp({ dist: fixture }).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    mongoose.connection.readyState = 0;
    await check('health reflects database outage', async () => assert.equal((await fetch(base + '/api/health')).status, 503));
    await check('database outage returns a prompt API error', async () => assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503));
    mongoose.connection.readyState = 1;
    await check('health reports ready database', async () => assert.equal((await fetch(base + '/api/health')).status, 200));
    await check('SPA routes survive direct visits', async () => { const r = await fetch(base + '/dashboard/case/001'); assert.equal(r.status, 200); assert.match(await r.text(), /SPA fixture/); });
    await check('unknown APIs return JSON 404', async () => { const r = await fetch(base + '/api/missing'); assert.equal(r.status, 404); assert.equal((await r.json()).error, 'API endpoint not found'); });
    await check('missing assets return 404', async () => assert.equal((await fetch(base + '/assets/missing.glb')).status, 404));
    await check('employee API authentication enforced', async () => assert.equal((await fetch(base + '/api/employee/history')).status, 401));
    await check('malformed JSON returns 400', async () => assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400));
  } finally {
    mongoose.connection.readyState = oldReady;
    await new Promise(resolve => server.close(resolve));
    await fs.rm(fixture, { recursive: true, force: true });
  }
  console.log(passed + ' regression checks passed');
  return passed;
}
if (require.main === module) run().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { run };
