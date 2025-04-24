# SmallBizAgent Heroku Deployment Guide

This guide will help you successfully deploy SmallBizAgent to Heroku.

## Prerequisites

- [Heroku Account](https://signup.heroku.com/)
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
- [Git](https://git-scm.com/downloads)

## Step 1: Export Your Project from Replit

1. Download a ZIP of your project from Replit
2. Extract it on your local machine
3. Open the project folder in a terminal

## Step 2: Prepare Your Project for Heroku

### 1. Edit package.json

Add these important configurations to your package.json:

```json
{
  "engines": {
    "node": "20.x"
  },
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node server.js",
    "check": "tsc",
    "db:push": "drizzle-kit push",
    "heroku-postbuild": "npm run build"
  }
}
```

The critical changes are:
- Adding the `"engines"` field
- Changing the `"start"` script to use server.js
- Adding the `"heroku-postbuild"` script

### 2. Create a .gitignore file

```
node_modules/
.DS_Store
.env
dist/
```

## Step 3: Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit for Heroku deployment"
```

## Step 4: Create and Configure Heroku App

### 1. Log in to Heroku

```bash
heroku login
```

### 2. Create a Heroku app

```bash
heroku create smallbizagent-your-name
```

### 3. Add PostgreSQL database

```bash
heroku addons:create heroku-postgresql:hobby-dev
```

### 4. Set environment variables

Replace placeholders with your actual values:

```bash
# Set session secret
heroku config:set SESSION_SECRET=$(openssl rand -hex 32)

# Set Stripe variables
heroku config:set STRIPE_SECRET_KEY=your_stripe_secret_key
heroku config:set VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key

# Set QuickBooks variables
heroku config:set QUICKBOOKS_CLIENT_ID=your_quickbooks_client_id
heroku config:set QUICKBOOKS_CLIENT_SECRET=your_quickbooks_client_secret

# Set AWS Lex variables
heroku config:set AWS_ACCESS_KEY_ID=your_aws_access_key
heroku config:set AWS_SECRET_ACCESS_KEY=your_aws_secret_key
heroku config:set AWS_REGION=your_aws_region
heroku config:set AWS_LEX_BOT_NAME=your_lex_bot_name
heroku config:set AWS_LEX_BOT_ALIAS=your_lex_bot_alias

# Set Twilio variables
heroku config:set TWILIO_ACCOUNT_SID=your_twilio_account_sid
heroku config:set TWILIO_AUTH_TOKEN=your_twilio_auth_token
heroku config:set TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

## Step 5: Deploy to Heroku

```bash
git push heroku main
```

If your Heroku app was created with a different branch than main, use:

```bash
git push heroku master:main
```

## Step 6: Run Database Migrations

After deployment, run migrations to set up your database:

```bash
heroku run npm run db:push
```

## Step 7: Open Your App

```bash
heroku open
```

## Troubleshooting Build Failures

### 1. Check build logs

```bash
heroku builds:info
```

### 2. View detailed build logs

```bash
heroku builds:output
```

### 3. Common issues and solutions:

#### TypeScript errors during build
- Check for type errors in your code
- Make sure all dependencies are properly imported

#### Node.js version issues
- Ensure your engines field in package.json specifies a version that Heroku supports

#### Package not found errors
- Make sure all dependencies are in package.json, not devDependencies

#### Environment variable issues
- Double-check that all required environment variables are set

### 4. If all else fails, try this simplified build approach:

Edit your package.json:
```json
"build": "vite build",
"heroku-postbuild": "npm run build"
```

And modify server.js to use CommonJS syntax if ESM is causing issues.

## Monitoring Your App

```bash
# View logs in real-time
heroku logs --tail

# Check app status
heroku ps

# View environment variables
heroku config
```

## Updating Your App

Make changes locally, commit them, and then:

```bash
git push heroku main
```

## Backing Up Your Database

```bash
# Create a backup
heroku pg:backups:capture

# Download the latest backup
heroku pg:backups:download
```