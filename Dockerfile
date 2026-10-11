FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/app/data/campus.sqlite TZ=Europe/Moscow
COPY . .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "app.js"]
