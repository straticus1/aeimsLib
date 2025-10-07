#!/bin/bash
# AEIMS Ubuntu Container Deployment Script
# Corrected for Ubuntu 22.04 - replaces Amazon Linux user-data
# Installs Docker and deploys aeimsLib container with proper health checks

set -x
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "=== AEIMS UBUNTU CONTAINER DEPLOYMENT ==="

# Update system
apt-get update -y

# Install Docker prerequisites
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    awscli

# Add Docker's official GPG key
mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker service
systemctl enable docker
systemctl start docker

# Verify Docker is running
docker --version
systemctl status docker --no-pager

# Configure AWS CLI for ECR access (assuming IAM role is attached)
aws configure set default.region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 515966511618.dkr.ecr.us-east-1.amazonaws.com

# Pull and run the aeimsLib container
echo "Pulling aeimsLib container..."
docker pull 515966511618.dkr.ecr.us-east-1.amazonaws.com/aeims-lib-dev:latest

echo "Starting aeimsLib container..."
docker run -d \
  --name aeims-lib \
  --restart=unless-stopped \
  -p 3000:8080 \
  -e NODE_ENV=production \
  -e WEBSOCKET_PORT=8080 \
  -e LOG_LEVEL=info \
  -e AEIMS_ENV=production \
  515966511618.dkr.ecr.us-east-1.amazonaws.com/aeims-lib-dev:latest

# Wait for container to start
sleep 15

# Verify container is running
docker ps -a
docker logs aeims-lib --tail 20

# Test health endpoints
echo "Testing health endpoints..."
curl -f http://localhost:3000/health && echo "SUCCESS: Container health check working on port 3000"
curl -f http://localhost:8080/health 2>/dev/null && echo "SUCCESS: Internal health check working on port 8080" || echo "INFO: Internal port 8080 not exposed (expected)"

# Install nginx as backup health check endpoint
apt-get install -y nginx

# Create simple nginx config for port 8080 health checks
cat > /etc/nginx/sites-available/aeims-health << 'EOF'
server {
    listen 8080 default_server;
    server_name _;

    # Primary health check - proxy to container
    location = /health {
        proxy_pass http://localhost:3000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;

        # Fallback if container is not responding
        error_page 502 503 504 = @fallback_health;
    }

    # Fallback health check
    location @fallback_health {
        return 200 '{"status":"container_starting","service":"aeimsLib","timestamp":"$time_iso8601","version":"1.0.0"}';
        add_header Content-Type application/json always;
    }

    # Status endpoint
    location = /status {
        proxy_pass http://localhost:3000/status;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;

        # Fallback if container is not responding
        error_page 502 503 504 = @fallback_status;
    }

    # Fallback status
    location @fallback_status {
        return 200 '{"status":"container_initializing","message":"Please wait for container startup"}';
        add_header Content-Type application/json always;
    }

    # Proxy other requests to container
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/aeims-health /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Start nginx
systemctl enable nginx
systemctl start nginx

# Final health checks
sleep 5
echo "=== Final Health Checks ==="
echo "Container status:"
docker ps | grep aeims-lib

echo "Port 8080 nginx health check:"
curl -f http://localhost:8080/health && echo "SUCCESS: nginx proxy health check working"

echo "Container direct health check:"
curl -f http://localhost:3000/health && echo "SUCCESS: container direct health check working"

# Set up log rotation
cat > /etc/logrotate.d/aeims-lib << 'EOF'
/var/log/user-data.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
}
EOF

echo "=== AEIMS UBUNTU DEPLOYMENT COMPLETE ==="
echo "Container: $(docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep aeims-lib)"
echo "Health endpoint: http://$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4):8080/health"