# MCP Hub Developer Guide

## Quick Start for New Developers

### 1. Register as a Developer

Run the developer setup script to register and get your unique API key:

```bash
npm run setup:developer
```

This will:
- Register you as a developer
- Generate your unique API key
- Create your MCP configuration
- Save the configuration file locally

### 2. Configure Claude Desktop

Copy the generated MCP configuration to your Claude Desktop settings:

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Configuration Format:**
```json
{
  "servers": {
    "mcp-hub": {
      "command": "/path/to/node",
      "args": ["server.js"],
      "cwd": "/path/to/mcp-hub",
      "env": {
        "MCP_API_KEY": "your_unique_api_key_here"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After updating the configuration, restart Claude Desktop to load the new settings.

## API Key Management

### List Your API Keys
```bash
npm run keys:list
```

### Refresh Your API Key
```bash
npm run keys:refresh
```

### Deactivate Your API Key
```bash
npm run keys:deactivate
```

## Available MCP Tools

1. **usecases_search** - Search for use cases
2. **usecases_get** - Get specific use case details
3. **usecases_upsert** - Create or update use cases
4. **analysis_impact** - Analyze impact of changes
5. **scaffold_create** - Create project scaffolding
6. **api_document_link** - Link APIs to use cases
7. **project_bootstrap** - Bootstrap new projects
8. **automation_workflow** - Create automation workflows
9. **deployment_orchestration** - Manage deployments
10. **developer_register** - Register new developers
11. **monitoring_alerts** - Set up monitoring

## Security Features

- **Individual API Keys**: Each developer gets a unique API key
- **Permission-based Access**: Different permission levels (read, write, admin)
- **Usage Tracking**: All API calls are logged with developer information
- **Key Rotation**: Easily refresh API keys when needed
- **Deactivation**: Instantly revoke access by deactivating keys

## Troubleshooting

### Authentication Failed
- Verify your API key is correct in the MCP configuration
- Check if your key is active: `npm run keys:list`
- Refresh your key if needed: `npm run keys:refresh`

### Tools Not Working
- Ensure Claude Desktop is restarted after configuration changes
- Check the MCP server logs for authentication messages
- Verify the server is running with authentication enabled

### Permission Denied
- Check your permission level: `npm run keys:list`
- Contact admin if you need additional permissions

## Admin Commands

### List All Developers (Admin Only)
```bash
npm run admin:developers
```

### Manage Permissions (Admin Only)
```bash
npm run admin:permissions
```

### View Usage Statistics (Admin Only)
```bash
npm run admin:usage
```

## Development Workflow

1. **Plan Features**: Use `usecases_upsert` to plan new features
2. **Implement APIs**: Build actual endpoints
3. **Document APIs**: Use `api_document_link` to connect working APIs to use cases
4. **Test & Validate**: Ensure everything works as expected

## Best Practices

- **Keep API Keys Secret**: Never commit API keys to version control
- **Use Meaningful Descriptions**: When creating use cases, be descriptive
- **Document After Implementation**: Only document APIs after they're working
- **Regular Key Rotation**: Refresh API keys periodically for security

## Support

For issues or questions:
- Check the troubleshooting section above
- Contact your system administrator
- Review the server logs for detailed error information