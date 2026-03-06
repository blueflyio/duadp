FROM node:22-slim AS builder
WORKDIR /app

# Copy SDK first (local dependency)
COPY sdk/typescript/ /app/sdk/typescript/
WORKDIR /app/sdk/typescript
RUN npm ci && npm run build

# Copy reference node
WORKDIR /app/reference-node
COPY reference-node/package*.json ./
RUN npm ci
COPY reference-node/ ./

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/sdk/typescript /app/sdk/typescript
COPY --from=builder /app/reference-node /app/reference-node
WORKDIR /app/reference-node

# Express must be resolvable from SDK's server.js (createRequire resolves from there)
RUN cd /app/sdk/typescript && npm install --no-save express

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 4200

# Seed on first run if no DB exists, then start
CMD ["sh", "-c", "[ -f data/uadp.db ] || npx tsx src/seed.ts; npx tsx src/index.ts"]
