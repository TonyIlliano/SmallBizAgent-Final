# Deploying SmallBizAgent to Heroku

This guide will walk you through deploying the SmallBizAgent application to Heroku.

## Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
- Heroku account
- Git installed

## Steps to Deploy

### 1. Prepare Your Application

Your application is already configured for Heroku deployment with:
- PostgreSQL database integration
- Proper environment variable handling
- Node.js configuration

### 2. Login to Heroku

```bash
heroku login
```

### 3. Create a Heroku App

```bash
heroku create smallbizagent
```

### 4. Add PostgreSQL Add-on

```bash
heroku addons:create heroku-postgresql:mini
```

This will automatically create a DATABASE_URL environment variable.

### 5. Configure Environment Variables

Add any additional environment variables required by your app:

```bash
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your_session_secret
```

If you're using Stripe or other external services:

```bash
heroku config:set STRIPE_SECRET_KEY=your_stripe_secret_key
heroku config:set VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
```

### 6. Add Heroku Git Remote

```bash
heroku git:remote -a smallbizagent
```

### 7. Verify the Build Scripts

Your package.json already has the necessary scripts for Heroku:

```json
"scripts": {
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

Heroku will automatically run the `build` script during deployment and the `start` script to run your application.

### 8. Create a Procfile

Create a file named `Procfile` in the root directory with the following content:

```
web: npm start
```

### 9. Push to Heroku

```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

### 10. Run Database Migrations

```bash
heroku run npm run db:push
```

### 11. Seed Initial Data (if needed)

The application should automatically seed initial data on startup.

### 12. Open Your App

```bash
heroku open
```

## Maintenance

### Viewing Logs

```bash
heroku logs --tail
```

### Restarting the App

```bash
heroku restart
```

### Connecting to the Database

```bash
heroku pg:psql
```

## Database Backups

### Creating a Backup

```bash
heroku pg:backups:capture
```

### Downloading a Backup

```bash
heroku pg:backups:download
```

## Troubleshooting

If you encounter issues:

1. Check your logs: `heroku logs --tail`
2. Ensure all environment variables are set: `heroku config`
3. Verify the database connection: `heroku pg:info`
4. Check for app crashes: `heroku ps`

## Additional Resources

- [Heroku Node.js Support](https://devcenter.heroku.com/categories/nodejs-support)
- [Heroku PostgreSQL](https://devcenter.heroku.com/categories/heroku-postgres)
- [Deploying Node.js Apps on Heroku](https://devcenter.heroku.com/articles/deploying-nodejs)