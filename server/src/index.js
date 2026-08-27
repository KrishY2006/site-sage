const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
const { apiLimiter } = require('./middleware/rateLimit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Fire up the database connection
connectDB();

// Enable CORS so the Vite frontend can talk to this backend
app.use(cors());

// Middleware to allow our app to read JSON data from requests
app.use(express.json());

// Connect our auth routes to the main app
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Connect our project routes (protected by JWT + API rate limit)
const projectsRoutes = require('./routes/projects');
app.use('/api/projects', apiLimiter, projectsRoutes);

// Mount the ingestion router (inherits apiLimiter from the /api/projects mount above)
app.use('/api/projects', require('./routes/ingest'));

// Start the server listening
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});