FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate \
  && npm run build \
  && cp -r public .next/standalone/ \
  && mkdir -p .next/standalone/.next \
  && cp -r .next/static .next/standalone/.next/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && HOSTNAME=0.0.0.0 node .next/standalone/server.js"]
