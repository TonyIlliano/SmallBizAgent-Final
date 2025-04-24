// Production server entry point for Heroku
// Using CommonJS syntax for better compatibility
const express = require('express');
const { Pool } = require('@neondatabase/serverless');
const path = require('path');
const { WebSocketServer } = require('ws');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Parse JSON bodies
app.use(express.json());

// Log basic information
console.log('Starting SmallBizAgent server...');

// Serve static files
app.use(express.static(path.join(__dirname, 'dist/client')));

// Simple health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple route to test database connection
app.get('/api/db-status', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'DATABASE_URL not set' });
    }
    
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    res.json({ 
      status: 'connected', 
      timestamp: result.rows[0].now,
      message: 'Database connection successful'
    });
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ 
      error: 'Database connection failed', 
      message: err.message 
    });
  }
});

// For all other routes, serve the main app
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'dist/client/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`SmallBizAgent server running on port ${PORT}`);
});

// Export server for testing
module.exports = server;