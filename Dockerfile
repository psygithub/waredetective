# ---- Stage 1: Builder ----
# Use the full Node.js image to build our application and install dependencies.
FROM node:20-bullseye AS builder

WORKDIR /app

# Copy package files and install dependencies using npm ci for consistency.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the application source code.
# .dockerignore file will prevent unnecessary files from being copied.
COPY . .

# Ensure the entrypoint script is executable in a separate step for better caching.
RUN chmod +x /app/docker-entrypoint.sh


# ---- Stage 2: Production ----
# Use a fresh, clean image for the final artifact to keep it small.
FROM node:20-bullseye

# Install ONLY necessary runtime OS dependencies.
# Playwright/Chromium and related font packages have been removed to reduce size.
RUN apt-get update && apt-get install -y \
    sqlite3 \
    ca-certificates \
    gosu \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set the timezone to Asia/Shanghai.
RUN apt-get update && apt-get install -y tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# Create a non-root user for security purposes.
RUN addgroup --system nodejs && \
    adduser --system --ingroup nodejs nextjs

# Copy application files from the 'builder' stage with correct permissions.
# We copy node_modules and package files first, then the rest of the app.
# This improves caching, as code changes won't invalidate the node_modules layer.
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/config ./config

# Copy the entrypoint script separately. It was made executable in the builder stage.
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh .

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_UNBUFFERED=1

# Healthcheck to verify that the server is running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:3000/ || exit 1

# Set the entrypoint and default command.
# The entrypoint script will execute the CMD as the 'nextjs' user.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/app.js"]
