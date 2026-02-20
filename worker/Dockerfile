FROM node:20-alpine

# FFmpeg will be installed in Task 2 — skeleton only
# RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

CMD ["node", "src/index.js"]
