# SmallBizAgent Heroku Fix Guide

This guide provides step-by-step instructions to fix the build error you're experiencing with your Heroku deployment.

## The Problem

Your build is failing with the error:
```
Could not resolve entry module "client/index.html".
```

This happens because Vite's build process on Heroku can't locate the client/index.html file properly.

## The Solution: Fixed Files

I've created several files to fix this issue:

1. **vite.config.heroku.js** - A simplified Vite configuration for Heroku
2. **heroku-build.js** - A custom build script that handles the Vite build process properly
3. **server.js** - An updated server with better path handling for static files
4. **package.json.heroku** - A modified package.json with the correct build settings

## Step-by-Step Instructions

### 1. Download your project from Replit

First, download your entire project from Replit.

### 2. Replace the files

In your downloaded project:

1. Replace the original files with the new versions:
   - Rename `package.json.heroku` to `package.json`
   - Keep `vite.config.heroku.js` as a separate file
   - Keep `heroku-build.js` as a new file
   - Replace the existing `server.js` with the new one

### 3. Update your Git repository

```bash
git add .
git commit -m "Fix Heroku build configuration"
```

### 4. Deploy to Heroku

```bash
git push heroku main
```

## What These Changes Do

1. **Uses a custom build script** that handles Vite's peculiarities on Heroku
2. **Creates fallback files** so even if the build partially fails, you still have a working site
3. **Simplifies the Vite configuration** by removing Replit-specific plugins
4. **Adds smart path detection** to the server.js file to find static files regardless of build structure

## Testing Locally Before Deploying

You can test these changes locally before deploying to Heroku:

```bash
# Install dependencies
npm install

# Run the custom build script
node heroku-build.js

# Start the server
NODE_ENV=production node server.js
```

## If You Still Have Issues

If you still encounter build failures after these changes:

1. **Check Heroku logs**:
   ```bash
   heroku logs --tail
   ```

2. **Try a minimal deployment**:
   - Create a new branch with only the essential files
   - Deploy that minimal version first

3. **Contact Heroku support**: 
   - Share your application log output
   - Reference the specific error: "Could not resolve entry module client/index.html"