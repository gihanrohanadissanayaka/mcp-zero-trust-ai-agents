#!/bin/bash
# Test the MCP Hub Docker container

set -e

echo "🧪 Testing MCP Hub Docker Container"
echo "======================================"

# Add Docker to PATH if needed (for macOS)
if [[ "$OSTYPE" == "darwin"* ]] && [ ! -x "$(command -v docker)" ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

CONTAINER_NAME="mcp-hub-server"

# Check if container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "❌ Container '$CONTAINER_NAME' is not running"
    echo "Start it first with: ./run-container.sh"
    exit 1
fi

echo "✅ Container is running"
echo ""

# Test health endpoints
echo "🏥 Testing health endpoints..."
echo ""

# Test main health endpoint
echo "1. Testing /health endpoint:"
health_response=$(curl -s http://localhost:3001/health 2>/dev/null || echo "FAILED")
if [ "$health_response" != "FAILED" ]; then
    echo "✅ Health endpoint: OK"
    echo "   Response: $health_response"
else
    echo "❌ Health endpoint: FAILED"
fi

echo ""

# Test API health endpoint
echo "2. Testing /api/health endpoint:"
api_health_response=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo "FAILED")
if [ "$api_health_response" != "FAILED" ]; then
    echo "✅ API health endpoint: OK"
    echo "   Response: $api_health_response"
else
    echo "❌ API health endpoint: FAILED"
fi

echo ""

# Show container stats
echo "📊 Container Statistics:"
docker stats $CONTAINER_NAME --no-stream

echo ""

# Show recent logs
echo "📋 Recent Container Logs:"
echo "========================"
docker logs --tail=20 $CONTAINER_NAME

echo ""
echo "✅ Container test completed!"
echo ""
echo "🔧 MCP Client Configuration:"
echo "   Set environment variable: MCP_API_KEY=<your-api-key-from-.env>"
echo "   Connect to stdio interface of the running container"
echo ""
echo "📋 Available MCP Tools:"
echo "   - usecases_search: Search use cases"
echo "   - usecases_get: Get specific use case"
echo "   - usecases_upsert: Create/update use cases"
echo "   - analysis_impact: Analyze feature impact"
echo "   - scaffold_generate: Generate code scaffolds"
echo "   - api_document_link: Document API endpoints"
echo "   And more..."