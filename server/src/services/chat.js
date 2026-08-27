const { createEmbeddings } = require('./embeddings');
const Chunk = require('../models/Chunk');
const mongoose = require('mongoose');

async function askQuestion(projectId, question) {
  const queryVector = await createEmbeddings(question);
  const vectorToSearch = Array.isArray(queryVector[0]) ? queryVector[0] : queryVector;

  const relevantChunks = await Chunk.aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embedding',
        queryVector: vectorToSearch,
        numCandidates: 50,
        limit: 5
      }
    },
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId)
      }
    },
    {
      $project: {
        text: 1,
        sourceUrl: 1,
        score: { $meta: 'vectorSearchScore' }
      }
    }
  ]);

  if (relevantChunks.length === 0) {
    return { answer: "I couldn't find any relevant information in this project.", sources: [] };
  }

  const contextText = relevantChunks.map(chunk => chunk.text).join('\n\n---\n\n');
  const sources = [...new Set(relevantChunks.map(c => c.sourceUrl))];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant. Answer the user's question based ONLY on the provided Context. If the answer is not in the context, say 'I cannot find the answer in the provided documents.'"
        },
        {
          role: "user",
          content: `Context:\n${contextText}\n\nQuestion: ${question}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Chat API error: ${errText}`);
  }

  return { stream: response.body, sources };
}

module.exports = { askQuestion };
