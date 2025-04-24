# SmallBizAgent Heroku Troubleshooting Guide

If you're encountering build failures when deploying to Heroku, here are specific steps to identify and resolve the issues.

## Understanding Heroku Build Failures

When a build fails, Heroku provides a link to the build logs. These logs contain valuable information about what went wrong during the build process.

## Common Issues and Solutions

### 1. JavaScript Module System Conflicts

**Problem:** ES Modules vs. CommonJS conflicts

**Solution:**
1. Change your package.json:
   ```json
   "type": "commonjs",
   ```

2. Use the simplified server.js that uses CommonJS syntax (already provided)

### 2. Build Process Breaking

**Problem:** The complex build process involving both frontend and backend is failing

**Solution:**
1. Simplify your build script:
   ```json
   "build": "vite build",
   ```

2. Move dependencies from devDependencies:
   ```json
   "dependencies": {
     // Move all development dependencies here
   }
   ```

### 3. Node.js Version Issues

**Problem:** Heroku is using a different Node.js version than expected

**Solution:**
1. Specify the exact version in your package.json:
   ```json
   "engines": {
     "node": "20.16.1"
   },
   ```

### 4. File System Case Sensitivity Issues

**Problem:** Some imports might use different casing than the actual files

**Solution:**
1. Check all import statements and ensure they match the exact case of the files
2. Look for errors in the build logs that mention "cannot find module"

## Step-by-Step Recovery Plan

1. **Copy the simplified files:**
   - Use the simplified server.js
   - Use package.json.heroku as your package.json

2. **Make sure your Procfile is correct:**
   ```
   web: npm start
   ```

3. **Set up a clean repository:**
   ```bash
   mkdir smallbizagent-heroku
   cd smallbizagent-heroku
   # Copy only essential files
   git init
   git add .
   git commit -m "Simplified for Heroku deployment"
   ```

4. **Deploy with a fresh app:**
   ```bash
   heroku create smallbizagent-new
   heroku addons:create heroku-postgresql:hobby-dev
   # Set all environment variables
   git push heroku main
   ```

5. **Check the logs:**
   ```bash
   heroku logs --tail
   ```

## Minimal Deployment to Verify Setup

You can test a minimal deployment with just the server.js file to confirm your Heroku setup works:

1. Create a new directory with only:
   - server.js (the simplified version)
   - package.json.heroku (renamed to package.json)
   - Procfile
   - A simplified client/index.html file

2. Deploy this minimal version to verify your Heroku configuration works.

3. Once this minimal version works, gradually add more functionality back in.

## Getting Help

If you continue to experience issues, you can:

1. Check your build logs with: `heroku builds:output`
2. Get support from Heroku: https://help.heroku.com
3. Post in Heroku's Dev Center: https://devcenter.heroku.com
4. Check for similar issues on Stack Overflow

Remember, deployment issues are often related to environment differences between development and production. Start simple and add complexity gradually.