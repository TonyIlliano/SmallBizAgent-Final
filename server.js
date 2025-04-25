const express = require('express');
const path = require('path');
const { setupVite } = require('./server/vite');
const { registerRoutes } = require('./server/routes');

const app = express();
app.use(express.json());

// For production, serve the built files
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the dist directory
  app.use(express.static(path.join(__dirname, 'dist/public')));
  
  // Register API routes
  const server = registerRoutes(app);
  
  // For any other GET request, send the index.html file
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/public/index.html'));
  });
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} else {
  // For development, use Vite's dev server
  setupVite(app).then(server => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Development server running on port ${PORT}`);
    });
  });
}