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

# Install ONLY necessary runtime OS dependencies.
RUN apt-get update && apt-get install -y \
    sqlite3 \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set the timezone to Asia/Shanghai.
RUN apt-get update && apt-get install -y tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy application files from the builder stage.
COPY --from=builder /app .

# Create directories for volume mounts.
# This is done as root, so no permission issues.
RUN mkdir -p /app/data /app/output /app/config

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_UNBUFFERED=1

# Healthcheck to verify that the server is running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:3000/ || exit 1

# Run the application directly as root.
CMD ["node", "src/app.js"]
