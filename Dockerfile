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


# ---- Stage 2: Production ----
# Use a fresh, clean image for the final artifact to keep it small.
FROM node:20-bullseye

# Install necessary runtime OS dependencies and set timezone in a single layer.
RUN apt-get update && apt-get install -y \
    sqlite3 \
    ca-certificates \
    gosu \
    tzdata \
    --no-install-recommends && \
    # Set timezone
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    # Clean up APT cache
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user for security purposes.
RUN addgroup --system nodejs && \
    adduser --system --ingroup nodejs nextjs

# Copy dependencies from the 'builder' stage, setting ownership simultaneously.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy application code from the 'builder' stage, setting ownership simultaneously.
COPY --from=builder --chown=nextjs:nodejs /app .

# Copy and set up the entrypoint script from the 'builder' stage.
# The entrypoint script handles volume permissions at runtime.
COPY --from=builder /app/docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
# Flush stdout directly to the console, disabling buffering.
ENV NODE_STDOUT_FLUSH=1

# Healthcheck to verify that the server is running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:3000/ || exit 1

# Set the entrypoint and default command.
# The entrypoint script will execute the CMD as the 'nextjs' user.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/app.js"]
