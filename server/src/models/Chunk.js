const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  sourceUrl: { type: String, required: true },
  text: { type: String, required: true },
  embedding: [{ type: Number }],
  tokenCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chunk', chunkSchema);
