FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc || true

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app ./
RUN mkdir -p data policies
EXPOSE 4200
ENV PORT=4200
ENV DB_PATH=/data/duadp.db
VOLUME /data

# Seed on first run if no DB exists, then start
CMD ["sh", "-c", "[ -f /data/duadp.db ] || npx tsx src/seed.ts; npx tsx src/index.ts"]
