// heroku-build.js - Special build script for Heroku deployment
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Starting SmallBizAgent Heroku build process...');

// Ensure the dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('Created dist directory');
}

try {
  // Build the client
  console.log('Building client application...');
  execSync('npx vite build --config vite.config.heroku.js', {
    stdio: 'inherit' 
  });
  console.log('Client build completed successfully');
  
  // Create a simplified fallback index.html just in case
  const fallbackHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SmallBizAgent - Business Management Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script>
      // Basic fallback
      if (!document.querySelector('script[src*="assets/"]')) {
        document.getElementById('root').innerHTML = '<h1>SmallBizAgent</h1><p>Application assets could not be loaded. Please check build configuration.</p>';
      }
    </script>
  </body>
</html>
  `;
  
  // Ensure target directory exists
  if (!fs.existsSync('dist/client')) {
    fs.mkdirSync('dist/client', { recursive: true });
  }
  
  // Write fallback file
  fs.writeFileSync('dist/client/index.html', fallbackHtml);
  console.log('Created fallback index.html');
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build error:', error.message);
  
  // Create minimal index.html if build fails
  if (!fs.existsSync('dist/client')) {
    fs.mkdirSync('dist/client', { recursive: true });
  }
  
  const errorHtml = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SmallBizAgent</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
      .error { background: #f8d7da; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      h1 { color: #333; }
      pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>SmallBizAgent</h1>
    <div class="error">
      <p>The build process encountered errors.</p>
      <p>Please check server logs for details.</p>
    </div>
    <h2>API Endpoints</h2>
    <ul>
      <li><a href="/api/health">Health Check</a></li>
      <li><a href="/api/version">Version Information</a></li>
      <li><a href="/api/db-status">Database Status</a></li>
    </ul>
  </body>
</html>
  `;
  
  fs.writeFileSync('dist/client/index.html', errorHtml);
  console.log('Created error index.html');
  
  process.exit(1); // Exit with error code
}