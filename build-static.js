// build-static.js - A minimal build script that creates static files
const fs = require('fs');
const path = require('path');

console.log('Starting minimal static build process...');

// Ensure the dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('Created dist directory');
}

// Ensure the client directory exists
if (!fs.existsSync('dist/client')) {
  fs.mkdirSync('dist/client');
  console.log('Created dist/client directory');
}

// Create a minimal index.html file
const indexHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SmallBizAgent - Business Management Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        font-family: 'Inter', sans-serif;
        margin: 0;
        padding: 40px 20px;
        line-height: 1.6;
        color: #333;
        background: #f7f9fc;
      }
      .container {
        max-width: 800px;
        margin: 0 auto;
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      }
      h1 {
        margin-top: 0;
        color: #2563eb;
      }
      .status {
        background: #ecfdf5;
        border-left: 4px solid #10b981;
        padding: 15px;
        margin: 20px 0;
        border-radius: 4px;
      }
      .api-link {
        display: inline-block;
        background: #f1f5f9;
        padding: 8px 15px;
        margin: 5px 0;
        border-radius: 4px;
        text-decoration: none;
        color: #0f172a;
        font-family: monospace;
      }
      .api-link:hover {
        background: #e2e8f0;
      }
      footer {
        margin-top: 40px;
        font-size: 0.9rem;
        color: #64748b;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>SmallBizAgent</h1>
      
      <div class="status">
        <p><strong>Status:</strong> Server is operational</p>
        <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'production'}</p>
        <p><strong>Build Date:</strong> ${new Date().toISOString()}</p>
      </div>
      
      <h2>API Endpoints</h2>
      <p>The following API endpoints are available:</p>
      
      <div>
        <a class="api-link" href="/api/health">/api/health</a>
        <a class="api-link" href="/api/version">/api/version</a>
        <a class="api-link" href="/api/db-status">/api/db-status</a>
      </div>
      
      <h2>Access the Application</h2>
      <p>To use the SmallBizAgent dashboard, please access it through the desktop or mobile application.</p>
      
      <footer>
        &copy; ${new Date().getFullYear()} SmallBizAgent. All rights reserved.
      </footer>
    </div>
  </body>
</html>
`;

// Write the index.html file
fs.writeFileSync('dist/client/index.html', indexHtml);
console.log('Created index.html');

console.log('Static build completed successfully!');