# 🐳 MCP Hub Server - Single Container Deployment

A streamlined Docker deployment of the MCP Hub Model Context Protocol (MCP) server in a single, self-contained container.

## 🚀 Quick Start

### Prerequisites
- Docker installed and running
- MongoDB Atlas connection string (or local MongoDB)

### 1. Build the Container
```bash
# Option 1: Using npm script
npm run docker:build

# Option 2: Direct script
./build-container.sh

# Option 3: Manual build
docker build -t mcp-hub:latest .
```

### 2. Configure Environment
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration
# Update MONGO_URL with your MongoDB connection string
# Set secure API keys and JWT secret
```

### 3. Run the Container
```bash
# Option 1: Using npm script
npm run docker:run

# Option 2: Direct script
./run-container.sh

# Option 3: Manual run
docker run -d --name mcp-hub-server --env-file .env -p 3001:3001 mcp-hub:latest
```

### 4. Test the Deployment
```bash
# Option 1: Using npm script
npm run docker:test

# Option 2: Direct script
./test-container.sh

# Option 3: Manual test
curl http://localhost:3001/health
```

## 📋 Environment Configuration

Required environment variables in `.env`:

```bash
# Database (Required)
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/mcphub?retryWrites=true&w=majority
DB_NAME=mcphub

# API Keys (Required)
MCP_API_KEY=your_secure_api_key_here
MCP_ADMIN_KEY=your_admin_key_here

# JWT Secret (Required - min 64 characters)
JWT_SECRET=your_super_secure_jwt_secret_minimum_64_characters

# Optional Settings
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=3600
ENABLE_AUDIT_LOG=true
RATE_LIMIT_PER_MINUTE=100
```

## 🔧 Container Management

### Basic Operations
```bash
# Start container
docker start mcp-hub-server

# Stop container
docker stop mcp-hub-server

# Restart container
docker restart mcp-hub-server

# Remove container
docker rm mcp-hub-server

# View logs
docker logs mcp-hub-server

# Follow logs
docker logs -f mcp-hub-server

# Shell access
docker exec -it mcp-hub-server sh
```

### Health Monitoring
```bash
# Check container status
docker ps | grep mcp-hub

# Health check endpoint
curl http://localhost:3001/health

# API health endpoint
curl http://localhost:3001/api/health

# Container stats
docker stats mcp-hub-server
```

## 🌐 Application Endpoints

- **Main Health Check**: `GET /health`
- **API Health Check**: `GET /api/health`
- **Developer Registration**: `POST /api/auth/register`
- **MCP Protocol**: stdio interface for MCP clients

## 🔐 Security Features

- ✅ Non-root container execution
- ✅ Multi-stage Docker build
- ✅ Minimal attack surface
- ✅ Environment-based configuration
- ✅ Health checks and monitoring
- ✅ JWT authentication
- ✅ API key validation
- ✅ Rate limiting

## 📊 MCP Tools Available

The container provides these MCP tools:

1. **usecases_search** - Search for use cases
2. **usecases_get** - Get specific use case details
3. **usecases_upsert** - Create or update use cases
4. **analysis_impact** - Analyze feature impact
5. **scaffold_generate** - Generate code scaffolds
6. **api_document_link** - Document API endpoints
7. **project_setup** - Project setup assistance
8. **repo_analyze** - Repository analysis
9. **feature_suggest** - Feature suggestions
10. **code_optimize** - Code optimization suggestions
11. **sync_automation** - Use case sync automation

## 🧪 Testing with MCP Client

1. **Set API Key**:
   ```bash
   export MCP_API_KEY=your_api_key_from_env_file
   ```

2. **Connect MCP Client** to the running container's stdio interface

3. **Test Tools**:
   ```javascript
   // Example: Search use cases
   {
     "method": "tools/call",
     "params": {
       "name": "usecases_search",
       "arguments": {
         "query": "authentication",
         "limit": 5
       }
     }
   }
   ```

## 🔧 Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs mcp-hub-server

# Common issues:
# 1. Invalid MongoDB connection string
# 2. Missing required environment variables
# 3. Port 3001 already in use
```

### Health Check Fails
```bash
# Check if container is running
docker ps | grep mcp-hub

# Check application logs
docker logs -f mcp-hub-server

# Test from inside container
docker exec -it mcp-hub-server wget -qO- http://localhost:3001/health
```

### Database Connection Issues
```bash
# Verify MongoDB URL in .env
# Test connection from container
docker exec -it mcp-hub-server node -e "
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGO_URL);
client.connect().then(() => console.log('Connected')).catch(console.error);
"
```

## 🚀 Production Deployment

### Environment Hardening
```bash
# Generate secure secrets
openssl rand -hex 32  # For API keys
openssl rand -hex 64  # For JWT secret

# Use Docker secrets in production
docker swarm init
echo "your_jwt_secret" | docker secret create jwt_secret -
```

### Resource Limits
```bash
# Run with resource limits
docker run -d \
  --name mcp-hub-server \
  --env-file .env \
  -p 3001:3001 \
  --memory=512m \
  --cpus=1.0 \
  --restart=unless-stopped \
  mcp-hub:latest
```

### Backup Strategy
```bash
# Regular MongoDB backups
# Container logs backup
# Environment configuration backup
```

## 📝 Development

### Building from Source
```bash
git clone <repository>
cd mcp-hub
npm install
./build-container.sh
```

### Local Testing
```bash
# Test without Docker first
npm start

# Then test with Docker
npm run docker:build
npm run docker:run
npm run docker:test
```

## 📞 Support

- Check logs: `docker logs mcp-hub-server`
- Health status: `curl http://localhost:3001/health`
- Container stats: `docker stats mcp-hub-server`

For issues, provide:
1. Container logs
2. Environment configuration (without secrets)
3. Docker version and system info