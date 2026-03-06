FROM node:22-slim
WORKDIR /app/reference-node

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci

# Copy reference node source code
COPY . ./

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 4200

# Seed on first run if no DB exists, then start
CMD ["sh", "-c", "[ -f data/duadp.db ] || npx tsx src/seed.ts; npx tsx src/index.ts"]
