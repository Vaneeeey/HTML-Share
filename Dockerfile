FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate && npm run build

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && npm run start"]
