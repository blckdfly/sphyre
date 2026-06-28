FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmjs.org/ && \
  for i in 1 2 3 4 5; do \
  echo "Attempt $i: Running npm ci..." && \
  npm ci --prefer-offline --no-audit --frozen-lockfile && break || \
  echo "Attempt $i failed. Waiting before retry..." && \
  sleep 15; \
  done

COPY . .

ENV NODE_ENV=production

RUN npm run build

FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]