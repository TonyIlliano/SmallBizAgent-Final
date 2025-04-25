# Minimal Heroku Deployment Guide for SmallBizAgent

This guide will help you deploy a minimal API-only version of SmallBizAgent to Heroku. Once this is working, you can gradually add more features.

## Step 1: Download and Prepare Your Project

1. Download your project from Replit to your local machine
2. Open a terminal and navigate to the project folder

## Step 2: Replace Key Files

1. Replace your `package.json` with the content from `package.json.heroku`
   ```bash
   mv package.json.heroku package.json
   ```

2. Make sure you have the simplified server.js and build-static.js files

## Step 3: Commit Changes to Git

```bash
# Initialize git if needed
git init

# Add all files
git add .

# Commit changes
git commit -m "Prepare for Heroku deployment"
```

## Step 4: Create and Configure Heroku App

```bash
# Login to Heroku
heroku login

# Create a new Heroku app
heroku create your-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:hobby-dev

# Set up environment variables
heroku config:set SESSION_SECRET=$(openssl rand -hex 32)
heroku config:set STRIPE_SECRET_KEY=your_stripe_secret_key
heroku config:set VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
# Add other environment variables as needed
```

## Step 5: Deploy to Heroku

```bash
# Push to Heroku
git push heroku main
```

## Step 6: Set Up the Database

```bash
# Run migrations
heroku run npm run db:push
```

## Step 7: Verify Your Deployment

Visit your app at the URL provided by Heroku. You should see a simple landing page with API status information. Test the API endpoints:

- https://your-app-name.herokuapp.com/api/health
- https://your-app-name.herokuapp.com/api/version
- https://your-app-name.herokuapp.com/api/db-status

## What This Minimal Deployment Includes

- Server.js that provides API endpoints but doesn't try to build the full frontend
- A static landing page that works without Vite build complexities
- Database connectivity through your PostgreSQL add-on
- All API routes from your original application

## Next Steps After Successful Deployment

Once this minimal version is deployed successfully:

1. **Add backend API endpoints** one by one, testing each
2. **Build the frontend locally** and upload the built files to Heroku
3. **Implement auth** to test user logins and sessions

## Troubleshooting

If you encounter errors during deployment:

1. Check logs with `heroku logs --tail`
2. Make sure all environment variables are set correctly
3. Verify that your database migrations have run successfully