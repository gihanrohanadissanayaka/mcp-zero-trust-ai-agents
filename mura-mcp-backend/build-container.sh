#!/bin/bash
# Build and run MCP Hub Server in a single Docker container

set -e

echo "🐳 Building MCP Hub Docker Container"
echo "======================================"

# Add Docker to PATH if needed (for macOS)
if [[ "$OSTYPE" == "darwin"* ]] && [ ! -x "$(command -v docker)" ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not running"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    echo "Or start Docker Desktop if it's already installed"
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env from .env.example"
        echo "📝 Please edit .env file with your MongoDB connection and API keys"
        echo ""
    else
        echo "❌ No .env.example template found"
        exit 1
    fi
fi

# Build the Docker image
echo "📦 Building Docker image..."
docker build -t mcp-hub:latest .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo ""
    echo "🚀 To run the container:"
    echo "   ./scripts/run-container.sh"
    echo ""
    echo "🔧 To run with custom environment:"
    echo "   docker run --env-file .env -p 3001:3001 mcp-hub:latest"
    echo ""
    echo "📊 Image details:"
    docker images | grep mcp-hub
else
    echo "❌ Failed to build Docker image"
    exit 1
fi