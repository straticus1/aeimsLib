# AeimsLib WebSocket Server Dockerfile
# Creates a containerized server supporting both PHP and Node.js components

FROM php:8.2-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    git \
    nginx \
    supervisor \
    curl \
    wget

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set the working directory
WORKDIR /app

# Copy PHP composer files first
COPY composer.json composer.lock* ./

# Install PHP dependencies if composer.json exists
RUN if [ -f "composer.json" ]; then composer install --no-dev --optimize-autoloader; fi

# Copy Node.js package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy all source code
COPY . .

# Build TypeScript if build script exists
RUN if grep -q '"build"' package.json 2>/dev/null; then npm run build; fi

# Create non-root user
RUN addgroup -g 1001 -S aeims \
    && adduser -S aeims -u 1001 -G aeims

# Create necessary directories
RUN mkdir -p /app/logs /app/data /var/run/php \
    && chown -R aeims:aeims /app \
    && chown -R aeims:aeims /var/run/php

# Copy supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf || echo "[supervisord]" > /etc/supervisor/conf.d/supervisord.conf

# Set proper permissions
RUN chmod +x /app/*.php 2>/dev/null || true

# Expose WebSocket port and HTTP port
EXPOSE 8080 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV WEBSOCKET_PORT=8080
ENV LOG_LEVEL=info

# Switch to non-root user
USER aeims

# Start the application - prefer Node.js server if available, fall back to PHP
CMD if [ -f "dist/server.js" ]; then node dist/server.js; elif [ -f "src/server.ts" ]; then npm start; else php websocket_server.php; fi