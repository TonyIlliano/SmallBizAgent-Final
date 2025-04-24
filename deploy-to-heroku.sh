#!/bin/bash
# SmallBizAgent Heroku Deployment Script

echo "=== SmallBizAgent Heroku Deployment Script ==="
echo "This script will help you prepare and deploy your application to Heroku."
echo ""

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "Error: Heroku CLI is not installed. Please install it first:"
    echo "https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if user is logged in to Heroku
heroku whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "Please log in to Heroku:"
    heroku login
fi

# Ask for app name
read -p "Enter a name for your Heroku app (lowercase letters, numbers, and dashes only): " APP_NAME

# Create Heroku app
echo "Creating Heroku app: $APP_NAME"
heroku create $APP_NAME

# Add PostgreSQL
echo "Adding PostgreSQL database..."
heroku addons:create heroku-postgresql:hobby-dev --app $APP_NAME

# Add environment variables
echo "Setting up environment variables..."

# Core database connection is auto-configured by PostgreSQL add-on

# Stripe integration
read -p "Enter your STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
read -p "Enter your VITE_STRIPE_PUBLIC_KEY: " VITE_STRIPE_PUBLIC_KEY
heroku config:set STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY --app $APP_NAME
heroku config:set VITE_STRIPE_PUBLIC_KEY=$VITE_STRIPE_PUBLIC_KEY --app $APP_NAME

# QuickBooks integration
read -p "Enter your QUICKBOOKS_CLIENT_ID: " QUICKBOOKS_CLIENT_ID
read -p "Enter your QUICKBOOKS_CLIENT_SECRET: " QUICKBOOKS_CLIENT_SECRET
heroku config:set QUICKBOOKS_CLIENT_ID=$QUICKBOOKS_CLIENT_ID --app $APP_NAME
heroku config:set QUICKBOOKS_CLIENT_SECRET=$QUICKBOOKS_CLIENT_SECRET --app $APP_NAME

# Virtual Receptionist (AWS Lex & Twilio)
read -p "Enter your AWS_ACCESS_KEY_ID: " AWS_ACCESS_KEY_ID
read -p "Enter your AWS_SECRET_ACCESS_KEY: " AWS_SECRET_ACCESS_KEY
read -p "Enter your AWS_REGION: " AWS_REGION
read -p "Enter your AWS_LEX_BOT_NAME: " AWS_LEX_BOT_NAME
read -p "Enter your AWS_LEX_BOT_ALIAS: " AWS_LEX_BOT_ALIAS
heroku config:set AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID --app $APP_NAME
heroku config:set AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY --app $APP_NAME
heroku config:set AWS_REGION=$AWS_REGION --app $APP_NAME
heroku config:set AWS_LEX_BOT_NAME=$AWS_LEX_BOT_NAME --app $APP_NAME
heroku config:set AWS_LEX_BOT_ALIAS=$AWS_LEX_BOT_ALIAS --app $APP_NAME

read -p "Enter your TWILIO_ACCOUNT_SID: " TWILIO_ACCOUNT_SID
read -p "Enter your TWILIO_AUTH_TOKEN: " TWILIO_AUTH_TOKEN
read -p "Enter your TWILIO_PHONE_NUMBER: " TWILIO_PHONE_NUMBER
heroku config:set TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID --app $APP_NAME
heroku config:set TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN --app $APP_NAME
heroku config:set TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER --app $APP_NAME

# Session secret
SESSION_SECRET=$(openssl rand -hex 32)
heroku config:set SESSION_SECRET=$SESSION_SECRET --app $APP_NAME

echo ""
echo "=== Environment variables configured ==="
echo ""

echo "=== IMPORTANT STEPS BEFORE DEPLOYMENT ==="
echo "1. Edit your package.json file to add these fields:"
echo '   "engines": {'
echo '     "node": "20.x"'
echo '   },'
echo '   Add this to scripts:'
echo '   "heroku-postbuild": "npm run build"'
echo ""
echo "2. Make sure you have a Procfile with:"
echo '   web: npm start'
echo ""
echo "3. Make sure you have a .gitignore file to exclude node_modules/ and attached_assets/"
echo ""

read -p "Have you completed these steps? (yes/no): " COMPLETED

if [ "$COMPLETED" != "yes" ]; then
    echo "Please complete these steps and run this script again."
    exit 1
fi

echo "=== Ready to deploy ==="
echo "Run these commands to deploy:"
echo ""
echo "git init"
echo "git add ."
echo "git commit -m 'Initial deployment to Heroku'"
echo "git push heroku main"
echo ""
echo "Then run database migrations:"
echo "heroku run npm run db:push --app $APP_NAME"
echo ""
echo "Open your app:"
echo "heroku open --app $APP_NAME"
echo ""
echo "Monitor logs:"
echo "heroku logs --tail --app $APP_NAME"