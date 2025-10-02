# Dockerfile for Next.js application
# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
# Use shell-based retry logic for npm installation with frozen lockfile
RUN npm config set registry https://registry.npmjs.org/ && \
    for i in 1 2 3 4 5; do \
      echo "Attempt $i: Running npm ci..." && \
      npm ci --prefer-offline --no-audit --frozen-lockfile && break || \
      echo "Attempt $i failed. Waiting before retry..." && \
      sleep 15; \
    done

# Copy the rest of the application code
COPY . .

# Set environment to production
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Stage 2: Run the application
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only necessary files from the builder stage
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Set the correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose the port the app will run on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]