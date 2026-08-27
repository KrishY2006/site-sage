const express = require('express');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Chunk = require('../models/Chunk');
const auth = require('../middleware/auth');
const { scrapeSite } = require('../services/mcpClient');
const { chunkText, estimateTokenCount } = require('../services/ingest');
const { createEmbeddings } = require('../services/embeddings');
const { checkIngestLimit, incrementPagesIngested } = require('../middleware/usageLimit');

const router = express.Router();

// POST /api/projects/:id/ingest - Scrape, chunk, embed, and store a URL's content
router.post('/:id/ingest', auth, checkIngestLimit, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const { url } = req.body;
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'A valid http(s) url is required in the request body' });
    }

    const project = await Project.findOne({ _id: req.params.id, userId: req.userId });
    if (!project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    project.status = 'ingesting';
    if (!project.sourceUrls.includes(url)) {
      project.sourceUrls.push(url);
    }
    await project.save();

    try {
      const pages = await scrapeSite(url);

      const chunkDocs = [];
      for (const page of pages) {
        for (const text of chunkText(page.text)) {
          chunkDocs.push({
            projectId: project._id,
            sourceUrl: page.sourceUrl,
            text,
            tokenCount: estimateTokenCount(text)
          });
        }
      }

      await Chunk.deleteMany({ projectId: project._id });

      let insertedCount = 0;
      if (chunkDocs.length > 0) {
        const embeddings = await createEmbeddings(chunkDocs.map(doc => doc.text));
        const withEmbeddings = chunkDocs.map((doc, index) => ({
          ...doc,
          embedding: embeddings[index]
        }));
        const inserted = await Chunk.insertMany(withEmbeddings);
        insertedCount = inserted.length;
      }

      console.log(`Ingested ${pages.length} pages (${insertedCount} chunks) for project ${project._id}`);

      project.status = 'ready';
      project.pageCount = pages.length;
      await project.save();

      await incrementPagesIngested(req.userId, pages.length);

      res.json({
        message: 'Ingestion complete',
        projectId: project._id,
        status: project.status,
        pageCount: pages.length,
        chunkCount: insertedCount
      });
    } catch (err) {
      project.status = 'error';
      await project.save();
      return res.status(502).json({ error: `Ingestion failed: ${err.message}` });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during ingestion' });
  }
});

module.exports = router;
