const Usage = require('../models/Usage');

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getOrCreateUsage(userId) {
  const date = today();
  const usage = await Usage.findOneAndUpdate(
    { userId, date },
    { $setOnInsert: { userId, date } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return usage;
}

async function checkIngestLimit(req, res, next) {
  try {
    const usage = await getOrCreateUsage(req.userId);
    if (usage.pagesIngested >= 50) {
      return res.status(429).json({ error: 'Daily ingestion limit reached (50 pages/day)' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error checking usage limits' });
  }
}

async function checkChatLimit(req, res, next) {
  try {
    const usage = await getOrCreateUsage(req.userId);
    if (usage.questionsCount >= 100) {
      return res.status(429).json({ error: 'Daily question limit reached (100 questions/day)' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Server error checking usage limits' });
  }
}

async function incrementPagesIngested(userId, count) {
  const date = today();
  await Usage.findOneAndUpdate(
    { userId, date },
    { $inc: { pagesIngested: count } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function incrementQuestionsCount(userId) {
  const date = today();
  await Usage.findOneAndUpdate(
    { userId, date },
    { $inc: { questionsCount: 1 } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

module.exports = {
  checkIngestLimit,
  checkChatLimit,
  incrementPagesIngested,
  incrementQuestionsCount
};
