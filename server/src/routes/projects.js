const express = require('express');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const auth = require('../middleware/auth');
const { askQuestion } = require('../services/chat');
const { chatLimiter } = require('../middleware/rateLimit');
const { checkChatLimit, incrementQuestionsCount } = require('../middleware/usageLimit');

const router = express.Router();

router.use(auth);

// GET /api/projects - List all projects for the logged-in user
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching projects' });
  }
});

// POST /api/projects - Create a new empty project
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const project = new Project({
      userId: req.userId,
      name: name.trim()
    });
    await project.save();

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: 'Server error creating project' });
  }
});

// DELETE /api/projects/:id - Delete a project owned by the user
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deleted = await Project.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error deleting project' });
  }
});

// POST /api/projects/:id/chat - Ask a question (SSE streaming)
router.post('/:id/chat', chatLimiter, checkChatLimit, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const project = await Project.findOne({ _id: req.params.id, userId: req.userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const { stream, sources } = await askQuestion(project._id, question);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const chunk = JSON.parse(payload);
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Stream read error:', err);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
    res.end();

    incrementQuestionsCount(req.userId).catch(err => {
      console.error('Failed to increment questions count:', err);
    });
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: `Chat failed: ${error.message}` });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
