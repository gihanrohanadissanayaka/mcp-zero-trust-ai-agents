#!/bin/bash
# Run MCP Hub Server Docker container

set -e

echo "🚀 Running MCP Hub Docker Container"
echo "====================================="

# Add Docker to PATH if needed (for macOS)
if [[ "$OSTYPE" == "darwin"* ]] && [ ! -x "$(command -v docker)" ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

# Check if Docker image exists
if ! docker images | grep -q "mcp-hub"; then
    echo "❌ Docker image 'mcp-hub' not found"
    echo "Build it first with: ./build-container.sh"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo "Create it from .env.example and configure your settings"
    exit 1
fi

# Stop existing container if running
CONTAINER_NAME="mcp-hub-server"
if docker ps | grep -q $CONTAINER_NAME; then
    echo "🔄 Stopping existing container..."
    docker stop $CONTAINER_NAME
fi

# Remove existing container if exists
if docker ps -a | grep -q $CONTAINER_NAME; then
    echo "🗑️  Removing existing container..."
    docker rm $CONTAINER_NAME
fi

# Run the container
echo "🐳 Starting MCP Hub container..."
docker run -d \
    --name $CONTAINER_NAME \
    --env-file .env \
    -p 3001:3001 \
    --restart unless-stopped \
    mcp-hub:latest

# Check if container started successfully
sleep 3
if docker ps | grep -q $CONTAINER_NAME; then
    echo "✅ Container started successfully!"
    echo ""
    echo "📊 Container Status:"
    docker ps | grep $CONTAINER_NAME
    echo ""
    echo "🌐 Application URLs:"
    echo "   API Server: http://localhost:3001"
    echo "   Health Check: http://localhost:3001/health"
    echo ""
    echo "📋 Useful Commands:"
    echo "   docker logs $CONTAINER_NAME              # View logs"
    echo "   docker logs -f $CONTAINER_NAME           # Follow logs"
    echo "   docker exec -it $CONTAINER_NAME sh       # Shell access"
    echo "   docker stop $CONTAINER_NAME              # Stop container"
    echo "   docker restart $CONTAINER_NAME           # Restart container"
    echo ""
    
    # Wait a moment for the server to start and test health endpoint
    echo "🏥 Testing health endpoint..."
    sleep 5
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Health check passed!"
    else
        echo "⚠️  Health check failed - container may still be starting"
        echo "Check logs with: docker logs $CONTAINER_NAME"
    fi
else
    echo "❌ Failed to start container"
    echo "Check logs with: docker logs $CONTAINER_NAME"
    exit 1
fi