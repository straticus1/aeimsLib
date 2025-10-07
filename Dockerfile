# AeimsLib WebSocket Server Dockerfile
# Ubuntu-compatible containerized server supporting both PHP and Node.js components
# Integrated with AEIMS VoIP telephony platform for interactive device control

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for Ubuntu compatibility
RUN apt-get update && apt-get install -y \
    software-properties-common \
    ca-certificates \
    lsb-release \
    apt-transport-https \
    && add-apt-repository ppa:ondrej/php \
    && apt-get update \
    && apt-get install -y \
    php8.1-fpm \
    php8.1-cli \
    php8.1-mysql \
    php8.1-pgsql \
    php8.1-redis \
    php8.1-mbstring \
    php8.1-xml \
    php8.1-curl \
    php8.1-zip \
    php8.1-gd \
    nodejs \
    npm \
    python3 \
    python3-pip \
    build-essential \
    git \
    nginx \
    supervisor \
    curl \
    wget \
    redis-server \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Composer for Ubuntu
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

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

# TypeScript build not needed - using pure Node.js server.js implementation
# The migration from TypeScript to Node.js is complete

# Create non-root user for Ubuntu
RUN groupadd -g 1001 aeims \
    && useradd -u 1001 -g aeims -m -s /bin/bash aeims

# Create necessary directories for Ubuntu compatibility
RUN mkdir -p /app/logs /app/data /var/run/php /var/log/nginx \
    && chown -R aeims:aeims /app \
    && chown -R aeims:aeims /var/run/php \
    && chown -R aeims:aeims /var/log/nginx

# Copy nginx configuration for Ubuntu
RUN mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
COPY docker/nginx.conf /etc/nginx/sites-available/aeims
RUN ln -sf /etc/nginx/sites-available/aeims /etc/nginx/sites-enabled/ \
    && rm -f /etc/nginx/sites-enabled/default

# Copy supervisor configuration for Ubuntu services
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set proper permissions for Ubuntu
RUN chmod +x /app/*.php 2>/dev/null || true \
    && chown -R www-data:www-data /var/www/html 2>/dev/null || true

# Expose WebSocket port and HTTP port for Ubuntu integration
EXPOSE 8080 80 443

# Enhanced health check for Ubuntu nginx integration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || \
        curl -f http://localhost/health || \
        wget --no-verbose --tries=1 --spider http://localhost:8080/health || \
        exit 1

# Set environment variables for Ubuntu AEIMS integration
ENV NODE_ENV=production
ENV WEBSOCKET_PORT=8080
ENV LOG_LEVEL=info
ENV AEIMS_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

# Create health endpoint for Ubuntu load balancers
RUN mkdir -p /var/www/html && \
    echo '{"status":"healthy","service":"aeimsLib","timestamp":"'$(date -Iseconds)'","version":"1.0.0"}' > /var/www/html/health

# Use supervisor to manage multiple services in Ubuntu
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
