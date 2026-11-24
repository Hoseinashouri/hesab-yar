FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package.json package-lock.json* ./
RUN npm ci --only=production 2>&1 || npm install --only=production

# Copy the rest of the app
COPY . .

EXPOSE 8080

CMD ["node", "server/bot.js"]
