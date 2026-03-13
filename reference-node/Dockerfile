FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc || true

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app ./
RUN mkdir -p /data policies && chown -R node:node /app /data
EXPOSE 4200
ENV PORT=4200
ENV DB_PATH=/data/duadp.db
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4200}/api/v1/health`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
USER node

# Seed on first run if no DB exists, then start
CMD ["sh", "-c", "[ -f /data/duadp.db ] || npx tsx src/seed.ts; npx tsx src/index.ts"]
