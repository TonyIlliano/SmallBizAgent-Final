// Production server entry point for Heroku
// Using CommonJS syntax for better compatibility
const express = require('express');
const { Pool } = require('@neondatabase/serverless');
const path = require('path');
const { WebSocketServer } = require('ws');
const fs = require('fs');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Parse JSON bodies
app.use(express.json());

// Log basic information
console.log('Starting SmallBizAgent server...');

// Determine the correct client directory path
let staticPath = 'dist/client';
// Check if the directory exists, if not try alternative paths
if (!fs.existsSync(path.join(__dirname, staticPath))) {
  console.log(`Warning: ${staticPath} not found, checking alternatives...`);
  
  // Try alternative paths
  const alternatives = ['dist/public', 'client/dist', 'public'];
  for (const alt of alternatives) {
    if (fs.existsSync(path.join(__dirname, alt))) {
      staticPath = alt;
      console.log(`Using alternative static path: ${staticPath}`);
      break;
    }
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, staticPath)));

// Version info
app.get('/api/version', (req, res) => {
  res.json({
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    serverTime: new Date().toISOString()
  });
});

// Simple health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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
    // Try to find index.html in the static directory
    const indexPath = path.join(__dirname, staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.error(`Error: index.html not found at ${indexPath}`);
      res.status(500).send(`
        <html>
          <body>
            <h1>SmallBizAgent</h1>
            <p>Application is running but the frontend files could not be located.</p>
            <p>Server time: ${new Date().toISOString()}</p>
            <p>Please check the build configuration.</p>
            <h2>API Status:</h2>
            <ul>
              <li><a href="/api/health">Health Check</a></li>
              <li><a href="/api/version">Version Info</a></li>
              <li><a href="/api/db-status">Database Status</a></li>
            </ul>
          </body>
        </html>
      `);
    }
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to view the application`);
  console.log('API endpoints available at:');
  console.log(`- http://localhost:${PORT}/api/health`);
  console.log(`- http://localhost:${PORT}/api/version`);
});

// Export server for testing
module.exports = server;