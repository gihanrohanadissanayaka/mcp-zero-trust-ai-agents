import express from 'express';
import authController, { registerDeveloperService } from '../controllers/authController.js';

const router = express.Router();

// =====================================================
// DEVELOPER REGISTRATION & API KEY MANAGEMENT ROUTES
// =====================================================

// Register a new developer
// Developer registration (simplified - no projects)
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, company, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required'
      });
    }

    const result = await registerDeveloperService({
      name,
      email,
      company: company || '',
      password
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Login with email + password → returns API key
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authController.loginDeveloperService(email, password);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Refresh API key
router.post('/auth/refresh-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Current API key is required'
      });
    }

    const result = await authController.refreshApiKeyService(apiKey);
    res.json({
      success: true,
      message: 'API key refreshed successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get developer info by API key
router.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required'
      });
    }

    const apiKey = authHeader.substring(7);
    const result = await authController.getDeveloperInfoService(apiKey);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
});

// List all developers (admin only)
router.get('/auth/developers', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required'
      });
    }

    const apiKey = authHeader.substring(7);
    const adminKey = process.env.MCP_ADMIN_KEY;
    
    if (apiKey !== adminKey) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const result = await authController.listDevelopersService();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Deactivate API key (admin only)
router.post('/auth/deactivate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header with Bearer token required'
      });
    }

    const adminApiKey = authHeader.substring(7);
    const adminKey = process.env.MCP_ADMIN_KEY;
    
    if (adminApiKey !== adminKey) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'API key to deactivate is required'
      });
    }

    const result = await authController.deactivateApiKeyService(apiKey);
    res.json({
      success: true,
      message: 'API key deactivated successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'MCP Hub API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export { router as apiRoutes };