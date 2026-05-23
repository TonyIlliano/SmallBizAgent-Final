# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Build-time arguments for Vite client bundle.
# Vite reads these via import.meta.env.VITE_* at build time and bakes them
# into the JS bundle. Railway environment variables are NOT automatically
# available in docker build — they must be explicitly declared as ARG and
# promoted to ENV before `npm run build` runs.
#
# To make Railway pass these through, you ALSO have to configure the build
# args on the Railway service (Settings → Build → Build Args, or rely on
# Railway's RAILPACK_* automation). The safer path is to declare them here
# AND set them as service variables — the docker build will then receive
# them automatically because Railway forwards service vars as build args
# when an ARG with a matching name exists in the Dockerfile.
ARG VITE_STRIPE_PUBLIC_KEY
ARG VITE_GOOGLE_PLACES_API_KEY
ARG VITE_SENTRY_DSN
ARG VITE_TURNSTILE_SITE_KEY

# Promote build args to env vars so Vite (which reads process.env) can see them.
ENV VITE_STRIPE_PUBLIC_KEY=${VITE_STRIPE_PUBLIC_KEY}
ENV VITE_GOOGLE_PLACES_API_KEY=${VITE_GOOGLE_PLACES_API_KEY}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

# Copy package files
COPY package.json package-lock.json ./
COPY .npmrc* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build client + server
RUN npm run build

# Stage 2: Production
FROM node:20-slim

# Install Chromium and all required system libraries for Remotion
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libnspr4 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libx11-xcb1 \
    libgtk-3-0 \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for Remotion
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy built output + node_modules + remotion source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/remotion ./remotion
COPY --from=builder /app/public ./public
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server ./server

# Railway uses PORT env var
EXPOSE ${PORT:-5000}

CMD ["node", "dist/index.js"]
