FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN set -eux; \
  npm config set registry https://registry.npmjs.org/; \
  for i in 1 2 3 4 5; do \
  echo "Attempt $i: Running npm ci..."; \
  if npm ci --no-audit --prefer-offline; then \
  echo "npm ci succeeded on attempt $i"; \
  break; \
  fi; \
  echo "npm ci failed on attempt $i/5"; \
  if [ "$i" -eq 5 ]; then \
  echo "All npm ci attempts failed. Exiting."; \
  exit 1; \
  fi; \
  echo "Retrying in 15 seconds..."; \
  sleep 15; \
  done

COPY . .

ENV NODE_ENV=production

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]