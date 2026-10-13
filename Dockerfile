# Rebuild the React/TypeScript frontend on every BotHost Docker deployment.
# The previous Dockerfile copied an outdated /web bundle without compiling /app.
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build && npm run verify:build

# Runtime needs only the generated static site and Node.js server.
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/campus.sqlite TZ=Europe/Moscow
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/app.js ./app.js
COPY --from=builder /app/server ./server
COPY --from=builder /app/seed ./seed
COPY --from=builder /app/web ./web
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "app.js"]
