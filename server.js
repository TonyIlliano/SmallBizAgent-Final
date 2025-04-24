// This file can be used as a simpler entry point for Heroku
import('./dist/index.js').catch(err => {
  console.error('Error starting server:', err);
  process.exit(1);
});