#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import express from 'express';
import { connectToMongoDB, getDatabase, getClient, setupGracefulShutdown } from './src/config/database/connection.js';
import { withZeroTrust } from './src/auth/zeroTrustMiddleware.js';
import {
  getPolicyDocument,
  addPolicyRule,
  removePolicyRule,
  replacePolicyRules,
  simulatePolicy
} from './src/auth/policyEngine.js';

dotenv.config();

async function validateApiKey(providedKey) {
  if (!providedKey) {
    return { 
      valid: false, 
      error: 'API key is required. Please provide MCP_API_KEY in your client configuration. Register at /api/auth/register to get a key.' 
    };
  }

  try {
    const db = getDatabase();

    const apiKeyRecord = await db.collection('api_keys').findOne({
      key: providedKey,
      active: true
    });

    if (apiKeyRecord) {
      await db.collection('api_keys').updateOne(
        { key: providedKey },
        { $set: { lastUsed: new Date() } }
      );
      
      return { 
        valid: true, 
        mode: 'authenticated', 
        user: apiKeyRecord.email || apiKeyRecord.name || 'developer',
        developerId: apiKeyRecord.developerId
      };
    }

    return { 
      valid: false, 
      error: 'Invalid API key. Please register at /api/auth/register to get a valid key.' 
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return { valid: false, error: 'Authentication service error' };
  }
}

async function ensureUseCaseIndexes() {
  const db = getDatabase();
  const c = db.collection("use_cases");

  try {
    await c.createIndex(
      { title: "text", description: "text" },
      { name: "use_cases_text_idx" }
    );

    await c.createIndex(
      { tags: 1 },
      { name: "use_cases_tags_idx" }
    );

    await c.createIndex(
      { projectId: 1 },
      { name: "use_cases_project_idx" }
    );

    console.log("✅ Use case indexes ensured");
  } catch (error) {
    console.log("ℹ️ Index creation note:", error.message);
  }
}

function toSlug(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function upsertUseCase(useCase, developerContext = null) {
  const db = getDatabase();
  if (!useCase?.projectId) throw new Error("projectId required");
  if (!useCase?._id) throw new Error("_id required");

  const now = new Date();
  const developer = developerContext || { user: "mcp-automation", developerId: null };
  
  const existingDoc = await db.collection("use_cases").findOne({ _id: useCase._id });
  
  if (!existingDoc) {
    const newDoc = {
      _id: useCase._id,
      title: useCase.title,
      description: useCase.description ?? "",
      userStory: useCase.userStory ?? "",
      acceptanceCriteria: useCase.acceptanceCriteria || [],
      businessValue: useCase.businessValue ?? "",
      projectId: useCase.projectId,
      tags: useCase.tags || [],
      backend: {
        repos: useCase.backend?.repos || [],
        endpoints: useCase.backend?.endpoints || [],
        collections: useCase.backend?.collections || [],
        filesToModify: useCase.backend?.filesToModify || []
      },
      frontend: {
        repos: useCase.frontend?.repos || [],
        routes: useCase.frontend?.routes || [],
        components: useCase.frontend?.components || [],
        userFlows: useCase.frontend?.userFlows || []
      },
      createdAt: now,
      createdBy: developer.user,
      createdByDeveloperId: developer.developerId,
      updatedAt: now,
      updatedBy: developer.user,
      updatedByDeveloperId: developer.developerId,
      contributingDevelopers: developer.developerId ? [
        {
          developerId: developer.developerId,
          developerName: developer.user,
          firstContribution: now,
          lastContribution: now,
          contributionCount: 1
        }
      ] : [],
      updateHistory: [
        {
          timestamp: now,
          action: "created",
          updatedBy: developer.user,
          updatedByDeveloperId: developer.developerId,
          changes: "Initial creation"
        }
      ]
    };
    
    const res = await db.collection("use_cases").insertOne(newDoc);
    return {
      id: useCase._id,
      matched: 0,
      modified: 0,
      upsertedId: res.insertedId,
      action: "created"
    };
  } else {
    const updates = [];
    
    const changes = [];
    if (useCase.title && useCase.title !== existingDoc.title) changes.push(`title: "${existingDoc.title}" → "${useCase.title}"`);
    if (useCase.description && useCase.description !== existingDoc.description) changes.push("description updated");
    if (useCase.userStory && useCase.userStory !== existingDoc.userStory) changes.push("user story updated");
    if (useCase.businessValue && useCase.businessValue !== existingDoc.businessValue) changes.push("business value updated");
    
    const contributingDevelopers = existingDoc.contributingDevelopers || [];
    let existingContributor = null;
    
    if (developer.developerId) {
      existingContributor = contributingDevelopers.find(c => c.developerId?.toString() === developer.developerId?.toString());
      
      if (existingContributor) {
        existingContributor.lastContribution = now;
        existingContributor.contributionCount = (existingContributor.contributionCount || 0) + 1;
      } else {
        contributingDevelopers.push({
          developerId: developer.developerId,
          developerName: developer.user,
          firstContribution: now,
          lastContribution: now,
          contributionCount: 1
        });
      }
    }
    
    const updateHistory = existingDoc.updateHistory || [];
    updateHistory.push({
      timestamp: now,
      action: "updated",
      updatedBy: developer.user,
      updatedByDeveloperId: developer.developerId,
      changes: changes.length > 0 ? changes.join(", ") : "general update"
    });
    
    const scalarUpdate = {
      title: useCase.title,
      description: useCase.description ?? existingDoc.description,
      projectId: useCase.projectId,
      updatedAt: now,
      updatedBy: developer.user,
      updatedByDeveloperId: developer.developerId,
      contributingDevelopers: contributingDevelopers,
      updateHistory: updateHistory
    };

    if (useCase.userStory) scalarUpdate.userStory = useCase.userStory;
    if (useCase.businessValue) scalarUpdate.businessValue = useCase.businessValue;
    
    updates.push(
      db.collection("use_cases").updateOne(
        { _id: useCase._id },
        { $set: scalarUpdate }
      )
    );

    const arrayUpdates = [];
    
    if (useCase.tags?.length) {
      arrayUpdates.push({
        operation: { $addToSet: { tags: { $each: useCase.tags } } }
      });
    }
    
    if (useCase.acceptanceCriteria?.length) {
      arrayUpdates.push({
        operation: { $addToSet: { acceptanceCriteria: { $each: useCase.acceptanceCriteria } } }
      });
    }
    
    if (useCase.backend) {
      arrayUpdates.push({
        operation: { 
          $set: { 
            "backend.repos": existingDoc.backend?.repos || [],
            "backend.endpoints": existingDoc.backend?.endpoints || [],
            "backend.collections": existingDoc.backend?.collections || [],
            "backend.filesToModify": existingDoc.backend?.filesToModify || []
          }
        }
      });
      
      if (useCase.backend.filesToModify?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "backend.filesToModify": { $each: useCase.backend.filesToModify } } }
        });
      }
      if (useCase.backend.endpoints?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "backend.endpoints": { $each: useCase.backend.endpoints } } }
        });
      }
      if (useCase.backend.collections?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "backend.collections": { $each: useCase.backend.collections } } }
        });
      }
      if (useCase.backend.repos?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "backend.repos": { $each: useCase.backend.repos } } }
        });
      }
    }
    
    if (useCase.frontend) {
      arrayUpdates.push({
        operation: { 
          $set: { 
            "frontend.repos": existingDoc.frontend?.repos || [],
            "frontend.routes": existingDoc.frontend?.routes || [],
            "frontend.components": existingDoc.frontend?.components || [],
            "frontend.userFlows": existingDoc.frontend?.userFlows || []
          }
        }
      });
      
      if (useCase.frontend.components?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "frontend.components": { $each: useCase.frontend.components } } }
        });
      }
      if (useCase.frontend.routes?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "frontend.routes": { $each: useCase.frontend.routes } } }
        });
      }
      if (useCase.frontend.repos?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "frontend.repos": { $each: useCase.frontend.repos } } }
        });
      }
      if (useCase.frontend.userFlows?.length) {
        arrayUpdates.push({
          operation: { $addToSet: { "frontend.userFlows": { $each: useCase.frontend.userFlows } } }
        });
      }
    }

    for (const arrayUpdate of arrayUpdates) {
      updates.push(
        db.collection("use_cases").updateOne(
          { _id: useCase._id },
          arrayUpdate.operation
        )
      );
    }

    const results = await Promise.all(updates);
    const totalModified = results.reduce((sum, res) => sum + res.modifiedCount, 0);

    return {
      id: useCase._id,
      matched: 1,
      modified: totalModified,
      upsertedId: null,
      action: "updated"
    };
  }
}

async function searchUseCases(query, projectId = null, limit = 20) {
  const db = getDatabase();

  try {
    const collection = db.collection("use_cases");
    let searchQuery = {};
    
    if (projectId) {
      searchQuery.projectId = projectId;
    }

    let results = [];

    try {
      const textSearchQuery = {
        ...searchQuery,
        $text: { $search: query }
      };
      
      results = await collection.find(textSearchQuery, {
        projection: { _id: 1, title: 1, tags: 1, score: { $meta: "textScore" } }
      })
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .toArray();
      
      console.log(`Text search found ${results.length} results`);
    } catch (textSearchError) {
      console.log("Text search failed, falling back to regex:", textSearchError.message);
      
      const searchRegex = new RegExp(query, 'i');
      const regexSearchQuery = {
        ...searchQuery,
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { tags: { $in: [searchRegex] } }
        ]
      };
      
      results = await collection.find(regexSearchQuery, {
        projection: { _id: 1, title: 1, tags: 1 }
      })
      .limit(limit)
      .toArray();
      
      console.log(`Regex search found ${results.length} results`);
    }

    return results.map(doc => ({
      id: doc._id,
      title: doc.title,
      tags: doc.tags || []
    }));
  } catch (error) {
    console.error("Error searching use cases:", error.message);
    throw new Error(`Failed to search use cases: ${error.message}`);
  }
}

async function getUseCase(id) {
  const db = getDatabase();

  try {
    const collection = db.collection("use_cases");
    
    const result = await collection.findOne({ _id: id });
    
    if (!result) {
      throw new Error(`Use case with ID ${id} not found`);
    }

    const { _id, ...rest } = result;
    return {
      id: _id,
      ...rest
    };
  } catch (error) {
    console.error("Error getting use case:", error.message);
    throw new Error(`Failed to get use case: ${error.message}`);
  }
}

async function analyzeImpact(featureSpec, projectId = null) {
  const db = getDatabase();

  try {
    const matchingUseCases = await searchUseCases(featureSpec, projectId, 10);
    
    if (matchingUseCases.length === 0) {
      return { impacted: [] };
    }

    const collection = db.collection("use_cases");
    const useCaseIds = matchingUseCases.map(uc => uc.id);
    const fullUseCases = await collection.find({ _id: { $in: useCaseIds } }).toArray();

    const impactedFiles = new Set();
    const impactedArray = [];

    for (const useCase of fullUseCases) {
      const reason = `from use_case ${useCase.title}`;
      
      if (useCase.backend && useCase.backend.filesToModify) {
        for (const file of useCase.backend.filesToModify) {
          if (!impactedFiles.has(file)) {
            impactedFiles.add(file);
            impactedArray.push({ file, reason });
          }
        }
      }

      if (useCase.frontend && useCase.frontend.components) {
        for (const file of useCase.frontend.components) {
          if (!impactedFiles.has(file)) {
            impactedFiles.add(file);
            impactedArray.push({ file, reason });
          }
        }
      }

      if (useCase.backend && useCase.backend.endpoints) {
        for (const file of useCase.backend.endpoints) {
          if (!impactedFiles.has(file)) {
            impactedFiles.add(file);
            impactedArray.push({ file, reason });
          }
        }
      }
    }

    return { impacted: impactedArray };
  } catch (error) {
    console.error("Error analyzing impact:", error.message);
    throw new Error(`Failed to analyze impact: ${error.message}`);
  }
}

function createScaffold(filesSpec) {
  // For now, just echo back the created paths
  const created = filesSpec.files.map(file => ({
    path: file.path
  }));

  return { created };
}

async function automateFeature(featureRequest, projectId = null) {
  const db = getDatabase();

  try {
    const automationResult = {
      featureRequest,
      steps: [],
      relatedUseCases: [],
      impactedFiles: [],
      scaffoldSuggestions: []
    };

    // Step 1: Extract keywords and search for related use cases
    automationResult.steps.push("Step 1: Searching for related use cases...");
    
    // Extract potential keywords from the feature request
    const keywords = extractFeatureKeywords(featureRequest);
    let allRelatedUseCases = [];
    
    const primaryResults = await searchUseCases(featureRequest, projectId, 5);
    allRelatedUseCases.push(...primaryResults);
    
    for (const keyword of keywords) {
      const keywordResults = await searchUseCases(keyword, projectId, 3);
      allRelatedUseCases.push(...keywordResults);
    }
    
    // Deduplicate use cases
    const uniqueUseCases = Array.from(
      new Map(allRelatedUseCases.map(uc => [uc.id, uc])).values()
    );
    
    automationResult.relatedUseCases = uniqueUseCases;
    automationResult.steps.push(`Found ${uniqueUseCases.length} related use cases: ${uniqueUseCases.map(uc => uc.title).join(', ')}`);

    // Step 2: Perform impact analysis
    automationResult.steps.push("Step 2: Analyzing impact on files...");
    
    const impactAnalysis = await analyzeImpact(featureRequest, projectId);
    automationResult.impactedFiles = impactAnalysis.impacted;
    automationResult.steps.push(`Identified ${impactAnalysis.impacted.length} potentially impacted files`);

    // Step 3: Generate scaffold suggestions
    automationResult.steps.push("Step 3: Generating scaffold suggestions...");
    
    const scaffoldSuggestions = generateScaffoldSuggestions(featureRequest, impactAnalysis.impacted, uniqueUseCases);
    automationResult.scaffoldSuggestions = scaffoldSuggestions;
    automationResult.steps.push(`Generated ${scaffoldSuggestions.length} scaffold suggestions`);

    return automationResult;
  } catch (error) {
    console.error("Error in feature automation:", error.message);
    throw new Error(`Failed to automate feature: ${error.message}`);
  }
}

function extractFeatureKeywords(featureRequest) {
  // Extract meaningful keywords from the feature request
  const commonWords = ['add', 'create', 'update', 'delete', 'implement', 'to', 'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'by'];
  const words = featureRequest.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.includes(word));
  
  return [...new Set(words)];
}

function generateScaffoldSuggestions(featureRequest, impactedFiles, relatedUseCases) {
  const suggestions = [];
  
  // Group files by type
  const backendFiles = impactedFiles.filter(file => 
    file.file.includes('controller') || 
    file.file.includes('route') || 
    file.file.includes('service') || 
    file.file.includes('model') ||
    file.file.includes('middleware')
  );
  
  const frontendFiles = impactedFiles.filter(file => 
    file.file.includes('component') || 
    file.file.includes('page') || 
    file.file.includes('.js') && file.file.includes('src/')
  );

  // Generate backend suggestions
  if (backendFiles.length > 0) {
    suggestions.push({
      category: "Backend Changes",
      files: backendFiles.map(file => ({
        path: file.file,
        suggestion: generateCodeSuggestion(featureRequest, file.file, 'backend'),
        reason: file.reason
      }))
    });
  }

  // Generate frontend suggestions
  if (frontendFiles.length > 0) {
    suggestions.push({
      category: "Frontend Changes", 
      files: frontendFiles.map(file => ({
        path: file.file,
        suggestion: generateCodeSuggestion(featureRequest, file.file, 'frontend'),
        reason: file.reason
      }))
    });
  }

  if (featureRequest.toLowerCase().includes('auth') || 
      featureRequest.toLowerCase().includes('security') ||
      featureRequest.toLowerCase().includes('config')) {
    suggestions.push({
      category: "Configuration Changes",
      files: [{
        path: "src/config/auth.js",
        suggestion: "Update authentication configuration and middleware settings",
        reason: "Configuration changes typically required for auth features"
      }]
    });
  }

  return suggestions;
}

function generateCodeSuggestion(featureRequest, filePath, type) {
  const fileName = filePath.split('/').pop();
  const fileType = fileName.split('.')[0];
  
  if (type === 'backend') {
    if (filePath.includes('controller')) {
      return `Add new method in ${fileName} to handle ${featureRequest}. Consider input validation, business logic, and error handling.`;
    } else if (filePath.includes('route')) {
      return `Add new route endpoint in ${fileName} for ${featureRequest}. Include proper HTTP method, middleware, and controller binding.`;
    } else if (filePath.includes('model')) {
      return `Update ${fileName} schema/model to support ${featureRequest}. Add necessary fields, validations, and relationships.`;
    } else if (filePath.includes('service')) {
      return `Implement business logic in ${fileName} for ${featureRequest}. Focus on reusable service methods and data processing.`;
    } else if (filePath.includes('middleware')) {
      return `Update ${fileName} to support ${featureRequest}. Add validation, authentication, or authorization logic as needed.`;
    }
  } else if (type === 'frontend') {
    if (filePath.includes('component')) {
      return `Update ${fileName} component to support ${featureRequest}. Add necessary UI elements, state management, and event handlers.`;
    } else if (filePath.includes('page')) {
      return `Modify ${fileName} page to integrate ${featureRequest}. Update layout, add forms/buttons, and handle user interactions.`;
    }
  }
  
  return `Update ${fileName} to support: ${featureRequest}`;
}

function generateFeatureScaffoldFiles(featureRequest, impactedFiles, relatedUseCases, projectId = null) {
  const scaffoldFiles = [];
  const request = featureRequest.toLowerCase();
  
  // Dynamic feature categorization and resource identification
  const featureAnalysis = analyzeFeatureRequest(featureRequest);
  const resourceContext = extractResourceContext(featureRequest, relatedUseCases);
  const projectContext = determineProjectContext(projectId, relatedUseCases);
  
  console.log(`Feature Analysis: ${JSON.stringify(featureAnalysis)}`);
  console.log(`Resource Context: ${JSON.stringify(resourceContext)}`);
  
  // Generate backend scaffold files based on feature type
  const backendFiles = generateBackendScaffolds(featureAnalysis, resourceContext, projectContext);
  scaffoldFiles.push(...backendFiles);
  
  // Generate frontend scaffold files based on feature type
  const frontendFiles = generateFrontendScaffolds(featureAnalysis, resourceContext, projectContext);
  scaffoldFiles.push(...frontendFiles);
  
  // Generate configuration files if needed
  const configFiles = generateConfigurationScaffolds(featureAnalysis, resourceContext, projectContext);
  scaffoldFiles.push(...configFiles);
  
  return scaffoldFiles;
}

function analyzeFeatureRequest(featureRequest) {
  const request = featureRequest.toLowerCase();
  const analysis = {
    primaryCategory: 'generic',
    secondaryCategories: [],
    operations: [],
    entities: [],
    technologies: [],
    complexity: 'medium'
  };
  
  // Feature categorization mapping
  const categoryMappings = {
    authentication: ['auth', 'login', 'signup', 'signin', 'jwt', 'token', 'password', 'oauth', 'session'],
    userManagement: ['user', 'profile', 'account', 'member', 'admin', 'role', 'permission'],
    email: ['email', 'notification', 'mail', 'message', 'alert', 'reminder'],
    dashboard: ['dashboard', 'analytics', 'report', 'chart', 'metric', 'kpi', 'stats'],
    crud: ['create', 'add', 'update', 'edit', 'delete', 'remove', 'manage'],
    api: ['api', 'endpoint', 'route', 'service', 'microservice'],
    fileManagement: ['upload', 'download', 'file', 'document', 'attachment', 'media'],
    payment: ['payment', 'billing', 'subscription', 'credit', 'invoice', 'stripe'],
    search: ['search', 'filter', 'query', 'find', 'lookup'],
    integration: ['integrate', 'connect', 'sync', 'webhook', 'third-party']
  };
  
  // Determine primary category
  for (const [category, keywords] of Object.entries(categoryMappings)) {
    const matchCount = keywords.filter(keyword => request.includes(keyword)).length;
    if (matchCount > 0) {
      if (analysis.primaryCategory === 'generic' || matchCount > 1) {
        analysis.primaryCategory = category;
      }
      if (matchCount > 0) {
        analysis.secondaryCategories.push({ category, strength: matchCount });
      }
    }
  }
  
  // Extract operations
  const operationKeywords = ['create', 'add', 'update', 'edit', 'delete', 'remove', 'list', 'view', 'manage'];
  analysis.operations = operationKeywords.filter(op => request.includes(op));
  
  // Extract entities (nouns that could be resources)
  const words = featureRequest.split(' ');
  const stopWords = ['add', 'create', 'update', 'delete', 'to', 'the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on'];
  analysis.entities = words
    .filter(word => word.length > 2 && !stopWords.includes(word.toLowerCase()))
    .filter(word => /^[a-zA-Z]+$/.test(word))
    .slice(0, 3); // Limit to first 3 potential entities
  
  // Determine complexity
  if (request.includes('dashboard') || request.includes('analytics') || request.includes('integration')) {
    analysis.complexity = 'high';
  } else if (request.includes('crud') || request.includes('simple') || request.includes('basic')) {
    analysis.complexity = 'low';
  }
  
  return analysis;
}

function extractResourceContext(featureRequest, relatedUseCases) {
  const context = {
    primaryResource: null,
    relatedResources: [],
    suggestedNaming: {},
    templateContext: {}
  };
  
  // Extract primary resource from use cases
  if (relatedUseCases && relatedUseCases.length > 0) {
    const topUseCase = relatedUseCases[0];
    
    // Extract resource hints from use case title
    const titleWords = topUseCase.title?.toLowerCase().split(' ') || [];
    const resourceHints = titleWords.filter(word => 
      !['and', 'the', 'of', 'for', 'with', 'to', 'in', 'on', 'management', 'system'].includes(word)
    );
    
    if (resourceHints.length > 0) {
      context.primaryResource = resourceHints[0];
    }
  }
  
  // Fallback: extract from feature request
  if (!context.primaryResource) {
    const featureAnalysis = analyzeFeatureRequest(featureRequest);
    if (featureAnalysis.entities.length > 0) {
      context.primaryResource = featureAnalysis.entities[0].toLowerCase();
    } else {
      // Final fallback based on category
      const categoryResourceMap = {
        authentication: 'auth',
        userManagement: 'user',
        email: 'email',
        dashboard: 'dashboard',
        payment: 'payment',
        fileManagement: 'file'
      };
      context.primaryResource = categoryResourceMap[featureAnalysis.primaryCategory] || 'feature';
    }
  }
  
  // Generate naming conventions
  context.suggestedNaming = {
    singular: context.primaryResource,
    plural: context.primaryResource + 's',
    capitalized: context.primaryResource.charAt(0).toUpperCase() + context.primaryResource.slice(1),
    camelCase: context.primaryResource,
    pascalCase: context.primaryResource.charAt(0).toUpperCase() + context.primaryResource.slice(1)
  };
  
  return context;
}

function determineProjectContext(projectId, relatedUseCases) {
  const context = {
    projectId: projectId || 'default',
    basePath: '',
    backendPath: 'src',
    frontendPath: 'src',
    structure: 'standard'
  };
  
  // If project ID is provided, use it to determine paths
  if (projectId) {
    // For enterprise projects, use project-specific paths
    context.basePath = `projects/${projectId}`;
    context.backendPath = `projects/${projectId}/backend/src`;
    context.frontendPath = `projects/${projectId}/frontend/src`;
  } else if (relatedUseCases && relatedUseCases.length > 0) {
    // Try to infer project from use cases
    const useCase = relatedUseCases[0];
    if (useCase.projectId) {
      context.projectId = useCase.projectId;
      context.basePath = `projects/${useCase.projectId}`;
      context.backendPath = `projects/${useCase.projectId}/backend/src`;
      context.frontendPath = `projects/${useCase.projectId}/frontend/src`;
    }
  }
  
  return context;
}

function generateBackendScaffolds(featureAnalysis, resourceContext, projectContext) {
  const files = [];
  const { primaryCategory } = featureAnalysis;
  const { suggestedNaming } = resourceContext;
  const { backendPath } = projectContext;
  
  // Template mapping based on feature category
  const templateMappings = {
    authentication: {
      controller: 'auth-controller',
      service: 'auth-service',
      middleware: 'auth-middleware',
      model: 'auth-model'
    },
    userManagement: {
      controller: 'user-controller',
      service: 'user-service',
      middleware: 'user-middleware',
      model: 'user-model'
    },
    email: {
      controller: 'email-controller',
      service: 'email-service',
      template: 'email-template'
    },
    dashboard: {
      controller: 'dashboard-controller',
      service: 'analytics-service'
    },
    crud: {
      controller: 'crud-controller',
      service: 'crud-service',
      model: 'crud-model'
    },
    api: {
      controller: 'api-controller',
      routes: 'api-routes'
    },
    payment: {
      controller: 'payment-controller',
      service: 'payment-service',
      model: 'subscription-model'
    }
  };
  
  const templates = templateMappings[primaryCategory] || templateMappings.crud;
  
  // Generate controller
  if (templates.controller) {
    files.push({
      path: `${backendPath}/controllers/${suggestedNaming.camelCase}Controller.js`,
      template: templates.controller,
      purpose: `Controller for ${suggestedNaming.singular} operations`,
      vars: { 
        resourceName: suggestedNaming.singular,
        ResourceName: suggestedNaming.pascalCase,
        category: primaryCategory
      }
    });
  }
  
  // Generate service
  if (templates.service) {
    files.push({
      path: `${backendPath}/services/${suggestedNaming.camelCase}Service.js`,
      template: templates.service,
      purpose: `Business logic service for ${suggestedNaming.singular}`,
      vars: { 
        resourceName: suggestedNaming.singular,
        ResourceName: suggestedNaming.pascalCase,
        category: primaryCategory
      }
    });
  }
  
  // Generate routes
  files.push({
    path: `${backendPath}/routes/${suggestedNaming.camelCase}Routes.js`,
    template: templates.routes || 'resource-routes',
    purpose: `API routes for ${suggestedNaming.singular} endpoints`,
    vars: { 
      resourceName: suggestedNaming.singular,
      ResourceName: suggestedNaming.pascalCase,
      plural: suggestedNaming.plural
    }
  });
  
  // Generate model if needed
  if (templates.model && ['authentication', 'userManagement', 'crud', 'payment'].includes(primaryCategory)) {
    files.push({
      path: `${backendPath}/models/${suggestedNaming.pascalCase}.js`,
      template: templates.model,
      purpose: `Data model for ${suggestedNaming.singular}`,
      vars: { 
        resourceName: suggestedNaming.singular,
        ResourceName: suggestedNaming.pascalCase
      }
    });
  }
  
  // Generate middleware if needed
  if (templates.middleware && ['authentication', 'userManagement'].includes(primaryCategory)) {
    files.push({
      path: `${backendPath}/middleware/${suggestedNaming.camelCase}Middleware.js`,
      template: templates.middleware,
      purpose: `Middleware for ${suggestedNaming.singular} validation and processing`,
      vars: { 
        resourceName: suggestedNaming.singular,
        ResourceName: suggestedNaming.pascalCase
      }
    });
  }
  
  return files;
}

function generateFrontendScaffolds(featureAnalysis, resourceContext, projectContext) {
  const files = [];
  const { primaryCategory } = featureAnalysis;
  const { suggestedNaming } = resourceContext;
  const { frontendPath } = projectContext;
  
  // Frontend template mapping
  const frontendTemplates = {
    authentication: ['login-page', 'signup-page', 'auth-guard'],
    userManagement: ['user-profile', 'user-list', 'user-form'],
    email: ['email-composer', 'email-template-editor'],
    dashboard: ['dashboard-page', 'analytics-chart', 'metrics-card'],
    crud: ['list-page', 'form-page', 'details-page'],
    api: ['api-client'],
    payment: ['billing-page', 'subscription-card'],
    fileManagement: ['file-upload', 'file-manager']
  };
  
  const templates = frontendTemplates[primaryCategory] || frontendTemplates.crud;
  
  templates.forEach((template, index) => {
    const componentNames = {
      'login-page': 'LoginPage',
      'signup-page': 'SignupPage',
      'auth-guard': 'AuthGuard',
      'user-profile': 'UserProfile',
      'user-list': 'UserList',
      'user-form': 'UserForm',
      'dashboard-page': 'DashboardPage',
      'list-page': `${suggestedNaming.pascalCase}List`,
      'form-page': `${suggestedNaming.pascalCase}Form`,
      'details-page': `${suggestedNaming.pascalCase}Details`
    };
    
    const componentName = componentNames[template] || `${suggestedNaming.pascalCase}Component`;
    
    files.push({
      path: `${frontendPath}/components/${componentName}.js`,
      template: template,
      purpose: `Frontend component for ${suggestedNaming.singular} ${template.replace('-', ' ')}`,
      vars: { 
        resourceName: suggestedNaming.singular,
        ResourceName: suggestedNaming.pascalCase,
        componentName: componentName
      }
    });
  });
  
  return files;
}

function generateConfigurationScaffolds(featureAnalysis, resourceContext, projectContext) {
  const files = [];
  const { primaryCategory } = featureAnalysis;
  const { suggestedNaming } = resourceContext;
  const { basePath } = projectContext;
  
  // Configuration files based on feature type
  if (primaryCategory === 'authentication') {
    files.push({
      path: `${basePath}/config/auth.config.js`,
      template: 'auth-config',
      purpose: 'Authentication configuration and JWT settings',
      vars: { resourceName: suggestedNaming.singular }
    });
  }
  
  if (primaryCategory === 'email') {
    files.push({
      path: `${basePath}/config/email.config.js`,
      template: 'email-config',
      purpose: 'Email service configuration and templates',
      vars: { resourceName: suggestedNaming.singular }
    });
  }
  
  if (primaryCategory === 'payment') {
    files.push({
      path: `${basePath}/config/payment.config.js`,
      template: 'payment-config',
      purpose: 'Payment processing and subscription configuration',
      vars: { resourceName: suggestedNaming.singular }
    });
  }
  
  return files;
}

function categorizeFile(filePath) {
  if (filePath.includes('controller')) return 'Controller';
  if (filePath.includes('route')) return 'Route';
  if (filePath.includes('service')) return 'Service';
  if (filePath.includes('model')) return 'Model';
  if (filePath.includes('middleware')) return 'Middleware';
  if (filePath.includes('component')) return 'Component';
  if (filePath.includes('page')) return 'Page';
  if (filePath.includes('config')) return 'Configuration';
  return 'Other';
}

function generateModificationSuggestions(featureRequest, impactedFiles) {
  return impactedFiles.map(file => ({
    file: file.file,
    category: categorizeFile(file.file),
    suggestion: generateCodeSuggestion(featureRequest, file.file, 
      file.file.includes('src/components') || file.file.includes('src/pages') ? 'frontend' : 'backend'),
    priority: determinePriority(featureRequest, file.file),
    estimatedEffort: estimateEffort(featureRequest, file.file)
  }));
}

function determinePriority(featureRequest, filePath) {
  // Core auth/security files get high priority
  if (filePath.includes('auth') || filePath.includes('security')) return 'High';
  
  // Controllers and routes get medium-high priority
  if (filePath.includes('controller') || filePath.includes('route')) return 'Medium-High';
  
  // Models and services get medium priority
  if (filePath.includes('model') || filePath.includes('service')) return 'Medium';
  
  // Frontend components get medium-low priority  
  if (filePath.includes('component') || filePath.includes('page')) return 'Medium-Low';
  
  return 'Low';
}

function estimateEffort(featureRequest, filePath) {
  const request = featureRequest.toLowerCase();
  
  // Complex features require more effort
  if (request.includes('dashboard') || request.includes('analytics')) {
    return filePath.includes('component') ? '4-6 hours' : '2-4 hours';
  }
  
  // Auth features are moderately complex
  if (request.includes('auth') || request.includes('security')) {
    return filePath.includes('middleware') ? '3-5 hours' : '2-3 hours';
  }
  
  // Simple CRUD operations
  if (request.includes('add') || request.includes('create') || request.includes('update')) {
    return filePath.includes('controller') ? '1-2 hours' : '30-60 minutes';
  }
  
  return '1-3 hours';
}

function generateNextSteps(featureRequest, impactedFiles, scaffoldFiles) {
  const steps = [];
  
  if (scaffoldFiles.length > 0) {
    steps.push(`1. Create ${scaffoldFiles.length} new scaffold files using the provided templates`);
  }
  
  if (impactedFiles.length > 0) {
    steps.push(`2. Modify ${impactedFiles.length} existing files according to the suggestions`);
  }
  
  steps.push("3. Update database schemas/models if required");
  steps.push("4. Add appropriate tests for the new functionality");
  steps.push("5. Update API documentation");
  steps.push("6. Test the feature end-to-end");
  
  if (featureRequest.toLowerCase().includes('auth') || featureRequest.toLowerCase().includes('security')) {
    steps.push("7. Perform security review and testing");
  }
  
  return steps;
}

async function updateUseCaseInMongoDB(useCaseId, updates) {
  const db = getDatabase();

  try {
    const collection = db.collection("use_cases");
    
    // Prepare the update object
    const updateDoc = {
      $set: {
        ...updates,
        lastUpdated: new Date(),
        updatedBy: 'mcp-automation'
      }
    };
    
    // Add new files to backend.filesToModify array if they don't exist
    if (updates.newBackendFiles && updates.newBackendFiles.length > 0) {
      updateDoc.$addToSet = {
        'backend.filesToModify': { $each: updates.newBackendFiles }
      };
    }
    
    // Add new components to frontend.components array if they don't exist
    if (updates.newFrontendFiles && updates.newFrontendFiles.length > 0) {
      updateDoc.$addToSet = updateDoc.$addToSet || {};
      updateDoc.$addToSet['frontend.components'] = { $each: updates.newFrontendFiles };
    }
    
    // Add new tags if they don't exist
    if (updates.newTags && updates.newTags.length > 0) {
      updateDoc.$addToSet = updateDoc.$addToSet || {};
      updateDoc.$addToSet.tags = { $each: updates.newTags };
    }
    
    const result = await collection.updateOne(
      { _id: useCaseId },
      updateDoc
    );
    
    if (result.matchedCount === 0) {
      throw new Error(`Use case with ID ${useCaseId} not found`);
    }
    
    return {
      updated: result.modifiedCount > 0,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  } catch (error) {
    console.error("Error updating use case in MongoDB:", error.message);
    throw new Error(`Failed to update use case: ${error.message}`);
  }
}

async function extractNewFilesFromImpact(impactedFiles, scaffoldFiles) {
  const newFiles = {
    backend: [],
    frontend: [],
    tags: []
  };
  
  // Extract backend files from impacted files
  impactedFiles.forEach(file => {
    if (file.file.includes('src/controllers') || 
        file.file.includes('src/services') || 
        file.file.includes('src/routes') || 
        file.file.includes('src/middleware') ||
        file.file.includes('src/models')) {
      newFiles.backend.push(file.file);
    }
    
    if (file.file.includes('src/components') || 
        file.file.includes('src/pages')) {
      newFiles.frontend.push(file.file);
    }
  });
  
  // Extract files from scaffold generation
  scaffoldFiles.forEach(file => {
    if (file.path.includes('backend/src') || file.path.includes('src/')) {
      if (file.path.includes('controller') || 
          file.path.includes('service') || 
          file.path.includes('route') || 
          file.path.includes('middleware') ||
          file.path.includes('model')) {
        newFiles.backend.push(file.path);
      }
    }
    
    if (file.path.includes('frontend/src') || file.path.includes('components')) {
      newFiles.frontend.push(file.path);
    }
  });
  
  // Extract tags from file paths and scaffold purposes
  const tagKeywords = [];
  [...impactedFiles, ...scaffoldFiles].forEach(file => {
    const text = (file.file || file.path || '').toLowerCase() + ' ' + (file.purpose || '').toLowerCase();
    
    if (text.includes('auth') || text.includes('jwt') || text.includes('login')) {
      tagKeywords.push('auth', 'jwt', 'login');
    }
    if (text.includes('user') || text.includes('profile')) {
      tagKeywords.push('user', 'profile');
    }
    if (text.includes('email') || text.includes('notification')) {
      tagKeywords.push('email', 'notification');
    }
    if (text.includes('dashboard') || text.includes('analytics')) {
      tagKeywords.push('dashboard', 'analytics');
    }
    if (text.includes('payment') || text.includes('billing')) {
      tagKeywords.push('payment', 'billing');
    }
  });
  
  newFiles.tags = [...new Set(tagKeywords)];
  
  // Remove duplicates
  newFiles.backend = [...new Set(newFiles.backend)];
  newFiles.frontend = [...new Set(newFiles.frontend)];
  
  return newFiles;
}

async function createNewUseCaseIfNeeded(featureRequest, projectId, impactedFiles, scaffoldFiles) {
  const db = getDatabase();

  try {
    const collection = db.collection("use_cases");
    
    // Check if we need to create a new use case
    const featureAnalysis = analyzeFeatureRequest(featureRequest);
    const resourceContext = extractResourceContext(featureRequest, []);
    
    // Generate a unique ID for the new use case
    const useCaseId = `uc_${resourceContext.primaryResource}_${featureAnalysis.primaryCategory}`;
    
    // Check if this use case already exists
    const existingUseCase = await collection.findOne({ _id: useCaseId });
    if (existingUseCase) {
      return { created: false, useCaseId, reason: 'Use case already exists' };
    }
    
    // Extract files for the new use case
    const newFiles = await extractNewFilesFromImpact(impactedFiles, scaffoldFiles);
    
    // Create new use case document
    const newUseCase = {
      _id: useCaseId,
      projectId: projectId || 'prj_h2hunt',
      title: `${resourceContext.suggestedNaming.pascalCase} ${featureAnalysis.primaryCategory.charAt(0).toUpperCase() + featureAnalysis.primaryCategory.slice(1)}`,
      description: `${featureRequest} - Auto-generated use case for ${resourceContext.primaryResource} ${featureAnalysis.primaryCategory}`,
      backend: {
        repos: ['repo_h2hunt_api'],
        endpoints: [],
        filesToModify: newFiles.backend
      },
      frontend: {
        repos: ['repo_h2hunt_web'],
        routes: [],
        components: newFiles.frontend
      },
      tags: [...new Set([
        resourceContext.primaryResource,
        featureAnalysis.primaryCategory,
        ...newFiles.tags,
        'auto-generated'
      ])],
      createdAt: new Date(),
      createdBy: 'mcp-automation',
      autoGenerated: true
    };
    
    await collection.insertOne(newUseCase);
    
    return { 
      created: true, 
      useCaseId, 
      useCase: newUseCase,
      reason: 'New use case created for this feature'
    };
    
  } catch (error) {
    console.error("Error creating new use case:", error.message);
    throw new Error(`Failed to create new use case: ${error.message}`);
  }
}

// =====================================================
// 4) Replace insert-only "createNewUseCaseIfNeeded" with upsert
//    (so it works for fresh + existing projects)
// =====================================================
async function createOrUpsertUseCase(featureRequest, projectId, impactedFiles, scaffoldFiles) {
  const db = getDatabase();

  const featureAnalysis = analyzeFeatureRequest(featureRequest);
  const resourceContext = extractResourceContext(featureRequest, []);
  const baseId = `uc_${toSlug(resourceContext.primaryResource)}_${toSlug(featureAnalysis.primaryCategory)}`;
  const useCaseId = baseId; // stable id

  const newFiles = await extractNewFilesFromImpact(impactedFiles, scaffoldFiles);

  const useCaseDoc = {
    _id: useCaseId,
    projectId: projectId || 'default',
    title: `${resourceContext.suggestedNaming.pascalCase} ${featureAnalysis.primaryCategory.charAt(0).toUpperCase() + featureAnalysis.primaryCategory.slice(1)}`,
    description: `${featureRequest} - Auto(up)generated use case for ${resourceContext.primaryResource} ${featureAnalysis.primaryCategory}`,
    backend: {
      repos: ['repo_api'],
      endpoints: [],
      filesToModify: newFiles.backend
    },
    frontend: {
      repos: ['repo_web'],
      routes: [],
      components: newFiles.frontend
    },
    tags: [...new Set([
      resourceContext.primaryResource,
      featureAnalysis.primaryCategory,
      ...newFiles.tags,
      'auto-generated'
    ])]
  };

  const res = await upsertUseCase(useCaseDoc);
  return { createdOrUpdated: true, useCaseId: useCaseId, result: res };
}

async function useCaseSyncAutomation(featureRequest, projectId = null, forceCreateNew = false) {
  const db = getDatabase();

  try {
    const automationLog = [];
    const results = {
      featureRequest,
      projectId,
      steps: [],
      useCaseSearchResults: [],
      impactAnalysis: {},
      scaffoldGeneration: {},
      useCaseUpdates: [],
      newUseCaseCreated: null,
      summary: {}
    };

    // Step 1: Search for related use cases
    automationLog.push("🔍 Step 1: Searching for related use cases...");
    const relatedUseCases = await searchUseCases(featureRequest, projectId, 10);
    
    // Also search with extracted keywords
    const keywords = extractFeatureKeywords(featureRequest);
    let allUseCases = [...relatedUseCases];
    
    for (const keyword of keywords.slice(0, 3)) {
      const keywordResults = await searchUseCases(keyword, projectId, 5);
      allUseCases.push(...keywordResults);
    }
    
    // Deduplicate
    const uniqueUseCases = Array.from(
      new Map(allUseCases.map(uc => [uc.id, uc])).values()
    );
    
    results.useCaseSearchResults = uniqueUseCases;
    automationLog.push(`✅ Found ${uniqueUseCases.length} related use cases: ${uniqueUseCases.map(uc => uc.title).join(', ')}`);

    // Step 2: Perform impact analysis
    automationLog.push("📊 Step 2: Analyzing impact on existing files...");
    const impactAnalysis = await analyzeImpact(featureRequest, projectId);
    results.impactAnalysis = impactAnalysis;
    automationLog.push(`✅ Identified ${impactAnalysis.impacted.length} files that will be impacted`);

    // Step 3: Generate scaffold files
    automationLog.push("🏗️ Step 3: Generating scaffold files for the feature...");
    const scaffoldFiles = generateFeatureScaffoldFiles(featureRequest, impactAnalysis.impacted, uniqueUseCases, projectId);
    results.scaffoldGeneration = {
      files: scaffoldFiles,
      count: scaffoldFiles.length
    };
    
    if (scaffoldFiles.length > 0) {
      const scaffoldResult = createScaffold({ files: scaffoldFiles });
      automationLog.push(`✅ Generated ${scaffoldResult.created.length} scaffold files`);
    } else {
      automationLog.push("⚠️ No scaffold files generated - feature may only require modifications to existing files");
    }

    // Step 4: Update existing use cases in MongoDB
    automationLog.push("💾 Step 4: Updating related use cases in MongoDB...");
    const newFiles = await extractNewFilesFromImpact(impactAnalysis.impacted, scaffoldFiles);
    
    for (const useCase of uniqueUseCases) {
      try {
        const updateResult = await updateUseCaseInMongoDB(useCase.id, {
          newBackendFiles: newFiles.backend,
          newFrontendFiles: newFiles.frontend,
          newTags: newFiles.tags,
          description: `${useCase.title} - Updated for: ${featureRequest}`
        });
        
        results.useCaseUpdates.push({
          useCaseId: useCase.id,
          title: useCase.title,
          updated: updateResult.updated,
          modifiedCount: updateResult.modifiedCount
        });
        
        if (updateResult.updated) {
          automationLog.push(`✅ Updated use case: ${useCase.title}`);
        } else {
          automationLog.push(`ℹ️ No changes needed for use case: ${useCase.title}`);
        }
      } catch (error) {
        automationLog.push(`❌ Failed to update use case ${useCase.title}: ${error.message}`);
      }
    }

    // =====================================================
    // 5) Wire into the automation so it works for BOTH cases
    //    (existing: update; empty/fresh: create)
    // =====================================================
    
    // Step 5: Create or upsert use cases (works for fresh AND existing projects)
    if (uniqueUseCases.length === 0 || forceCreateNew) {
      automationLog.push("🆕 Creating or updating canonical use case for this feature via upsert...");
      try {
        const upsertRes = await createOrUpsertUseCase(featureRequest, projectId, impactAnalysis.impacted, scaffoldFiles);
        results.newUseCaseCreated = upsertRes;
        automationLog.push(`✅ Upserted canonical use case: ${upsertRes.useCaseId}`);
      } catch (error) {
        automationLog.push(`❌ Failed to upsert canonical use case: ${error.message}`);
      }
    } else {
      automationLog.push("🔄 Upserting discovered related use cases with merged files/tags...");
      
      for (const uc of uniqueUseCases) {
        try {
          const upRes = await upsertUseCase({
            _id: uc.id,
            projectId: projectId || 'default',
            title: uc.title,
            description: `${uc.title} - Updated for: ${featureRequest}`,
            tags: newFiles.tags,
            backend: { filesToModify: newFiles.backend, endpoints: [], repos: [] },
            frontend: { components: newFiles.frontend, routes: [], repos: [] }
          });
          results.useCaseUpdates.push({ 
            useCaseId: uc.id, 
            title: uc.title, 
            upserted: true, 
            modified: upRes.modified 
          });
          automationLog.push(`✅ Upserted use case: ${uc.title}`);
        } catch (error) {
          automationLog.push(`❌ Failed to upsert use case ${uc.title}: ${error.message}`);
        }
      }
    }

    // Step 6: Generate summary
    results.steps = automationLog;
    results.summary = {
      useCasesFound: uniqueUseCases.length,
      useCasesUpdated: results.useCaseUpdates.filter(u => u.updated).length,
      newUseCaseCreated: results.newUseCaseCreated?.created || false,
      filesImpacted: impactAnalysis.impacted.length,
      scaffoldFilesGenerated: scaffoldFiles.length,
      completedSuccessfully: true
    };
    
    automationLog.push("🎉 Automation completed successfully!");

    return results;
    
  } catch (error) {
    console.error("Use case sync automation error:", error);
    throw new Error(`Automation failed: ${error.message}`);
  }
}

const server = new McpServer({
  name: 'mcp-hub',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    logging: {}
  }
});

// Register tools
server.registerTool('usecases_search', {
  title: 'Search Use Cases',
  description: 'Search for use cases by title, description, or tags with optional project scoping',
  inputSchema: {
    query: z.string().min(1, "Query must not be empty"),
    projectId: z.string().optional(),
    limit: z.number().int().positive().max(100).default(20).optional(),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('usecases_search', async ({ query, projectId, limit, _ztAuth }) => {
  try {
    const results = await searchUseCases(query, projectId, limit);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('usecases_get', {
  title: 'Get Use Case',
  description: 'Get a specific use case by string ID',
  inputSchema: {
    id: z.string().min(1, "ID must not be empty"),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('usecases_get', async ({ id, _ztAuth }) => {
  try {
    const result = await getUseCase(id);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('analysis_impact', {
  title: 'Impact Analysis',
  description: 'Analyze the impact of a feature specification by finding related use cases and their affected files',
  inputSchema: {
    featureSpec: z.string().min(1, "Feature specification must not be empty"),
    projectId: z.string().optional(),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('analysis_impact', async ({ featureSpec, projectId, _ztAuth }) => {
  try {
    const result = await analyzeImpact(featureSpec, projectId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('scaffold_create', {
  title: 'Create Scaffold',
  description: 'Create scaffold files from specifications',
  inputSchema: {
    files: z.array(z.object({
      path: z.string().min(1, "Path must not be empty"),
      template: z.string().optional(),
      vars: z.record(z.any()).optional()
    })).min(1, "Files array must not be empty"),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('scaffold_create', async ({ files, _ztAuth }) => {
  try {
    const result = createScaffold({ files });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

// =====================================================
// 3) Register new MCP tool: usecases_upsert
// =====================================================
server.registerTool('usecases_upsert', {
  title: 'Upsert Use Case',
  description: 'Create or update a use case with full business context (idempotent). Works for fresh and existing projects.',
  inputSchema: {
    _token: z.string().optional().describe('Zero Trust JWT access token'),
    id: z.string().min(1).describe('Unique use case identifier'),
    projectId: z.string().min(1).describe('Project identifier'),
    title: z.string().min(1).describe('Use case title'),
    description: z.string().default('').describe('Detailed description'),
    userStory: z.string().optional().describe('User story (As a... I want... So that...)'),
    acceptanceCriteria: z.array(z.string()).default([]).describe('List of acceptance criteria'),
    businessValue: z.string().optional().describe('Business value and impact'),
    tags: z.array(z.string()).default([]),
    backend: z.object({
      repos: z.array(z.string()).default([]),
      endpoints: z.array(z.object({
        path: z.string().describe('API endpoint path'),
        method: z.string().describe('HTTP method (GET, POST, PUT, DELETE)'),
        description: z.string().describe('Endpoint purpose'),
        requestExample: z.any().optional().describe('Sample request body/params (JSON)'),
        responseExample: z.any().optional().describe('Sample successful response (JSON)'),
        authentication: z.string().optional().describe('Auth requirements (bearer, basic, none)'),
        status: z.enum(['planned', 'implemented', 'tested']).default('planned').describe('Development status')
      })).default([]),
      collections: z.array(z.object({
        name: z.string().describe('Collection/table name'),
        purpose: z.string().describe('Data storage purpose'),
        operations: z.array(z.string()).describe('CRUD operations (CREATE, READ, UPDATE, DELETE)')
      })).default([]),
      filesToModify: z.array(z.string()).default([]),
    }).default({}),
    frontend: z.object({
      repos: z.array(z.string()).default([]),
      routes: z.array(z.string()).default([]),
      components: z.array(z.string()).default([]),
      userFlows: z.array(z.object({
        flow: z.string().describe('User flow description'),
        steps: z.array(z.string()).describe('Step-by-step user actions')
      })).default([])
    }).default({})
  }
}, withZeroTrust('usecases_upsert', async ({ id, projectId, title, description, userStory, acceptanceCriteria, businessValue, tags, backend, frontend, _ztAuth }) => {
  try {
    const result = await upsertUseCase({
      _id: id,
      projectId: projectId,
      title: title,
      description: description,
      userStory: userStory,
      acceptanceCriteria: acceptanceCriteria,
      businessValue: businessValue,
      tags: tags,
      backend: backend,
      frontend: frontend
    }, { user: _ztAuth?.agentName, developerId: _ztAuth?.developerId }); // Pass agent context
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          ...result,
          createdBy: _ztAuth?.agentName || 'unknown',
          message: result.action === 'created' ? 'Use case created successfully' : 'Use case updated successfully'
        }, null, 2) 
      }] 
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
}));

// =====================================================
// 4) Register API Documentation Tool - Links implemented APIs to use cases
// =====================================================
server.registerTool('api_document_link', {
  title: 'Document Implemented API',
  description: 'Link working API endpoints to use cases with real request/response examples',
  inputSchema: {
    _token: z.string().optional().describe('Zero Trust JWT access token'),
    useCaseId: z.string().min(1).describe('Use case ID to update'),
    endpoint: z.object({
      path: z.string().describe('API endpoint path'),
      method: z.string().describe('HTTP method'),
      description: z.string().describe('What this endpoint does'),
      requestExample: z.any().optional().describe('Sample request body (JSON)'),
      responseExample: z.any().optional().describe('Sample response body (JSON)'),
      authentication: z.string().optional().describe('Auth requirements'),
      implementationFile: z.string().describe('Controller/route file where this is implemented')
    }),
    testResults: z.object({
      status: z.enum(['working', 'needs-fixes', 'not-tested']).describe('Current API status'),
      testDate: z.string().optional().describe('When was this tested'),
      notes: z.string().optional().describe('Any implementation notes')
    }).optional()
  }
}, withZeroTrust('api_document_link', async ({ useCaseId, endpoint, testResults, _ztAuth }) => {
  try {
    const db = getDatabase();
    
    // Get existing use case
    const useCase = await db.collection("use_cases").findOne({ _id: useCaseId });
    if (!useCase) {
      return { 
        content: [{ type: 'text', text: `Use case ${useCaseId} not found` }], 
        isError: true 
      };
    }

    // Update endpoint with implementation details and mark as implemented
    const updatedEndpoint = {
      ...endpoint,
      status: 'implemented',
      implementedAt: new Date().toISOString(),
      testResults: testResults,
      documentedBy: _ztAuth?.agentName || 'unknown',
      documentedByDeveloperId: _ztAuth?.developerId
    };

    // Check if endpoint already exists (by path and method)
    const existingEndpoints = useCase.backend?.endpoints || [];
    const endpointIndex = existingEndpoints.findIndex(
      ep => ep.path === endpoint.path && ep.method === endpoint.method
    );

    let updateOperation;
    const now = new Date();
    
    if (endpointIndex >= 0) {
      // Update existing endpoint
      updateOperation = {
        $set: {
          [`backend.endpoints.${endpointIndex}`]: updatedEndpoint,
          updatedAt: now,
          updatedBy: _ztAuth?.agentName || "api-documentation",
          updatedByDeveloperId: _ztAuth?.developerId
        },
        $push: {
          updateHistory: {
            timestamp: now,
            action: "api_documented",
            updatedBy: _ztAuth?.agentName || "api-documentation", 
            updatedByDeveloperId: _ztAuth?.developerId,
            changes: `Updated API documentation for ${endpoint.method} ${endpoint.path}`
          }
        }
      };
    } else {
      // Add new endpoint
      updateOperation = {
        $addToSet: {
          "backend.endpoints": updatedEndpoint
        },
        $set: {
          updatedAt: now,
          updatedBy: _ztAuth?.agentName || "api-documentation",
          updatedByDeveloperId: _ztAuth?.developerId
        },
        $push: {
          updateHistory: {
            timestamp: now,
            action: "api_documented",
            updatedBy: _ztAuth?.agentName || "api-documentation",
            updatedByDeveloperId: _ztAuth?.developerId, 
            changes: `Added API documentation for ${endpoint.method} ${endpoint.path}`
          }
        }
      };
    }

    const result = await db.collection("use_cases").updateOne(
      { _id: useCaseId },
      updateOperation
    );

    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          success: true,
          action: endpointIndex >= 0 ? 'updated' : 'added',
          endpoint: `${endpoint.method} ${endpoint.path}`,
          useCaseId: useCaseId,
          documentedBy: _ztAuth?.agentName || 'unknown',
          message: `Successfully ${endpointIndex >= 0 ? 'updated' : 'added'} API documentation`
        }, null, 2)
      }] 
    };
  } catch (error) {
    return { 
      content: [{ type: 'text', text: `Error: ${error.message}` }], 
      isError: true 
    };
  }
}));

// =====================================================
// Bootstrap Project Tool - Creates complete project structure
// =====================================================
async function bootstrapFreshProject(projectName, projectDescription, framework = 'react-express') {
  const db = getDatabase();

  try {
    const projectId = `prj_${toSlug(projectName)}`;
    const timestamp = new Date();
    
    // 1. Create project document
    const project = {
      _id: projectId,
      name: projectName,
      description: projectDescription,
      tags: ['bootstrap', 'fresh-project', framework],
      defaultBranch: 'main',
      createdAt: timestamp,
      createdBy: 'mcp-automation'
    };

    await db.collection('projects').updateOne(
      { _id: projectId },
      { $set: project },
      { upsert: true }
    );

    // 2. Create repository documents
    const backendRepo = {
      _id: `repo_${toSlug(projectName)}_api`,
      projectId: projectId,
      name: `${toSlug(projectName)}-backend`,
      language: 'js',
      framework: framework.includes('express') ? 'express' : 'fastify',
      paths: {
        config: 'src/config',
        controllers: 'src/controllers',
        routes: 'src/routes',
        models: 'src/models',
        services: 'src/services',
        middleware: 'src/middleware',
        utils: 'src/utils'
      },
      deps: ['express', 'mongoose', 'dotenv', 'cors', 'helmet'],
      createdAt: timestamp,
      createdBy: 'mcp-automation'
    };

    const frontendRepo = {
      _id: `repo_${toSlug(projectName)}_web`,
      projectId: projectId,
      name: `${toSlug(projectName)}-frontend`,
      language: 'js',
      framework: framework.includes('react') ? 'react' : 'vue',
      paths: {
        pages: 'src/pages',
        components: 'src/components',
        layouts: 'src/layout',
        api: 'src/api'
      },
      deps: ['react', 'react-dom', 'react-router-dom', 'axios'],
      createdAt: timestamp,
      createdBy: 'mcp-automation'
    };

    await db.collection('repos').updateOne(
      { _id: backendRepo._id },
      { $set: backendRepo },
      { upsert: true }
    );

    await db.collection('repos').updateOne(
      { _id: frontendRepo._id },
      { $set: frontendRepo },
      { upsert: true }
    );

    // 3. Create initial base use cases for common features
    const baseUseCases = [
      {
        _id: `uc_${toSlug(projectName)}_auth`,
        projectId: projectId,
        title: 'Authentication & Authorization',
        description: `Authentication system for ${projectName} with JWT tokens, login/signup, and user management`,
        backend: {
          repos: [backendRepo._id],
          endpoints: ['/api/auth/login', '/api/auth/signup', '/api/auth/refresh'],
          filesToModify: [
            'src/controllers/authController.js',
            'src/middleware/authMiddleware.js',
            'src/models/User.js',
            'src/routes/authRoutes.js'
          ]
        },
        frontend: {
          repos: [frontendRepo._id],
          routes: ['/login', '/signup', '/profile'],
          components: [
            'src/components/LoginPage.js',
            'src/components/SignupPage.js',
            'src/components/AuthGuard.js'
          ]
        },
        tags: ['auth', 'jwt', 'users', 'security'],
        createdAt: timestamp,
        createdBy: 'mcp-automation'
      },
      {
        _id: `uc_${toSlug(projectName)}_dashboard`,
        projectId: projectId,
        title: 'Dashboard & Analytics',
        description: `Main dashboard with KPIs and analytics for ${projectName}`,
        backend: {
          repos: [backendRepo._id],
          endpoints: ['/api/dashboard/stats', '/api/analytics/data'],
          filesToModify: [
            'src/controllers/dashboardController.js',
            'src/services/analyticsService.js'
          ]
        },
        frontend: {
          repos: [frontendRepo._id],
          routes: ['/dashboard'],
          components: [
            'src/components/Dashboard.js',
            'src/components/MetricCard.js',
            'src/components/Chart.js'
          ]
        },
        tags: ['dashboard', 'analytics', 'charts', 'kpi'],
        createdAt: timestamp,
        createdBy: 'mcp-automation'
      }
    ];

    // Insert base use cases
    for (const useCase of baseUseCases) {
      await db.collection('use_cases').updateOne(
        { _id: useCase._id },
        { $set: useCase },
        { upsert: true }
      );
    }

    return {
      success: true,
      projectId,
      project,
      repositories: [backendRepo, frontendRepo],
      baseUseCases,
      message: `Successfully bootstrapped project: ${projectName}`
    };

  } catch (error) {
    console.error("Error bootstrapping project:", error);
    throw new Error(`Failed to bootstrap project: ${error.message}`);
  }
}

server.registerTool('project_bootstrap', {
  title: 'Bootstrap Fresh Project',
  description: 'Create a complete project structure with repositories and base use cases for a fresh project. Perfect for starting new projects from scratch.',
  inputSchema: {
    projectName: z.string().min(1, "Project name is required"),
    projectDescription: z.string().min(1, "Project description is required"),
    framework: z.enum(['react-express', 'vue-fastify', 'react-node', 'vue-express']).default('react-express'),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('project_bootstrap', async ({ projectName, projectDescription, framework, _ztAuth }) => {
  try {
    const result = await bootstrapFreshProject(projectName, projectDescription, framework);
    
    const formattedResult = {
      status: 'success',
      message: result.message,
      projectDetails: {
        projectId: result.projectId,
        name: result.project.name,
        description: result.project.description,
        framework: framework
      },
      repositories: result.repositories.map(repo => ({
        id: repo._id,
        name: repo.name,
        language: repo.language,
        framework: repo.framework
      })),
      baseUseCases: result.baseUseCases.map(uc => ({
        id: uc._id,
        title: uc.title,
        tags: uc.tags
      })),
      nextSteps: [
        '1. Project structure has been created in MongoDB',
        '2. Base use cases for auth and dashboard are ready',
        '3. You can now start implementing features using feature automation tools',
        '4. Use usecases_upsert to add more specific use cases as needed',
        '5. Run usecase_sync_automation for any new feature requirements'
      ]
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResult, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error bootstrapping project: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('feature_automation', {
  title: 'Feature Automation',
  description: 'Automate the complete feature development process: search related use cases, analyze impact, and generate scaffold suggestions',
  inputSchema: {
    featureRequest: z.string().min(1, "Feature request must not be empty"),
    projectId: z.string().optional(),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('feature_automation', async ({ featureRequest, projectId, _ztAuth }) => {
  try {
    const result = await automateFeature(featureRequest, projectId);
    
    // Format the response for better readability
    const formattedResult = {
      summary: `Automated analysis for: ${featureRequest}`,
      steps: result.steps,
      relatedUseCases: result.relatedUseCases.map(uc => ({
        id: uc.id,
        title: uc.title,
        tags: uc.tags
      })),
      impactAnalysis: {
        totalFiles: result.impactedFiles.length,
        files: result.impactedFiles
      },
      scaffoldSuggestions: result.scaffoldSuggestions
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResult, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('feature_request_automation', {
  title: 'Feature Request Automation',
  description: 'Complete automation for any feature request: searches use cases, analyzes impact, and creates scaffolded code files',
  inputSchema: {
    featureRequest: z.string().min(1, "Feature request description must not be empty"),
    projectId: z.string().optional(),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('feature_request_automation', async ({ featureRequest, projectId, _ztAuth }) => {
  try {
    console.log(`Processing feature request: ${featureRequest}`);
    const automationSteps = [];
    
    // Step 1: Search for relevant use cases
    automationSteps.push("🔍 Step 1: Searching for relevant use cases...");
    const relatedUseCases = await searchUseCases(featureRequest, projectId, 10);
    
    // Also search with extracted keywords
    const keywords = extractFeatureKeywords(featureRequest);
    let allUseCases = [...relatedUseCases];
    
    for (const keyword of keywords.slice(0, 3)) { // Limit to top 3 keywords
      const keywordResults = await searchUseCases(keyword, projectId, 5);
      allUseCases.push(...keywordResults);
    }
    
    // Deduplicate
    const uniqueUseCases = Array.from(
      new Map(allUseCases.map(uc => [uc.id, uc])).values()
    );
    
    automationSteps.push(`✅ Found ${uniqueUseCases.length} relevant use cases`);
    
    // Step 2: Perform impact analysis
    automationSteps.push("📊 Step 2: Analyzing impact on existing files...");
    const impactAnalysis = await analyzeImpact(featureRequest, projectId);
    automationSteps.push(`✅ Identified ${impactAnalysis.impacted.length} files that will be impacted`);
    
    // Step 3: Generate scaffold files
    automationSteps.push("🏗️ Step 3: Generating scaffold files for the feature...");
    const scaffoldFiles = generateFeatureScaffoldFiles(featureRequest, impactAnalysis.impacted, uniqueUseCases, projectId);
    
    // Create the scaffold using our existing function
    if (scaffoldFiles.length > 0) {
      const scaffoldResult = createScaffold({ files: scaffoldFiles });
      automationSteps.push(`✅ Generated ${scaffoldResult.created.length} scaffold files`);
    } else {
      automationSteps.push("⚠️ No scaffold files generated - feature may only require modifications to existing files");
    }
    
    // Prepare comprehensive result
    const result = {
      featureRequest,
      projectId: projectId || "all projects",
      automationSteps,
      phase1_useCaseSearch: {
        searchKeywords: [featureRequest, ...keywords],
        relatedUseCases: uniqueUseCases.map(uc => ({
          id: uc.id,
          title: uc.title,
          tags: uc.tags
        }))
      },
      phase2_impactAnalysis: {
        totalImpactedFiles: impactAnalysis.impacted.length,
        impactedFiles: impactAnalysis.impacted.map(file => ({
          file: file.file,
          reason: file.reason,
          category: categorizeFile(file.file)
        }))
      },
      phase3_scaffoldGeneration: {
        newFilesToCreate: scaffoldFiles.map(file => ({
          path: file.path,
          purpose: file.purpose || "Supporting the new feature",
          template: file.template || "standard"
        })),
        modificationSuggestions: generateModificationSuggestions(featureRequest, impactAnalysis.impacted)
      },
      nextSteps: generateNextSteps(featureRequest, impactAnalysis.impacted, scaffoldFiles)
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
    
  } catch (error) {
    console.error("Feature request automation error:", error);
    return {
      content: [
        {
          type: 'text',
          text: `Error in feature automation: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

server.registerTool('usecase_sync_automation', {
  title: 'Use Case Sync Automation',
  description: 'Complete workflow automation: searches use cases, analyzes impact, generates scaffolds, and automatically updates MongoDB use cases with new files and tags',
  inputSchema: {
    featureRequest: z.string().min(1, "Feature request description must not be empty"),
    projectId: z.string().optional(),
    forceCreateNew: z.boolean().optional().default(false),
    _token: z.string().optional().describe('Zero Trust JWT access token')
  }
}, withZeroTrust('usecase_sync_automation', async ({ featureRequest, projectId, forceCreateNew, _ztAuth }) => {
  try {
    console.log(`Starting use case sync automation for: ${featureRequest}`);
    
    const result = await useCaseSyncAutomation(featureRequest, projectId, forceCreateNew);
    
    // Format the response for better readability
    const formattedResult = {
      automation: "Use Case Sync Automation",
      status: "completed",
      featureRequest: result.featureRequest,
      projectContext: result.projectId || "auto-detected",
      
      executionLog: result.steps,
      
      results: {
        useCaseDiscovery: {
          searchKeywords: extractFeatureKeywords(featureRequest),
          relatedUseCasesFound: result.useCaseSearchResults.length,
          useCases: result.useCaseSearchResults.map(uc => ({
            id: uc.id,
            title: uc.title,
            tags: uc.tags
          }))
        },
        
        impactAnalysis: {
          totalFilesImpacted: result.impactAnalysis.impacted?.length || 0,
          impactedFiles: result.impactAnalysis.impacted?.map(file => ({
            file: file.file,
            category: categorizeFile(file.file),
            reason: file.reason
          })) || []
        },
        
        scaffoldGeneration: {
          filesGenerated: result.scaffoldGeneration.count,
          scaffoldFiles: result.scaffoldGeneration.files.map(file => ({
            path: file.path,
            template: file.template,
            purpose: file.purpose,
            category: categorizeFile(file.path)
          }))
        },
        
        mongoDbUpdates: {
          useCasesUpdated: result.useCaseUpdates.filter(u => u.updated).length,
          updateDetails: result.useCaseUpdates,
          newUseCaseCreated: result.newUseCaseCreated
        }
      },
      
      summary: result.summary,
      
      nextSteps: [
        "1. Review the generated scaffold files and implement the templates",
        "2. Modify the impacted existing files according to the analysis",
        "3. Test the new feature functionality",
        "4. Update API documentation if needed",
        "5. Run integration tests",
        "6. Deploy and monitor the changes"
      ]
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedResult, null, 2)
        }
      ]
    };
    
  } catch (error) {
    console.error("Use case sync automation error:", error);
    return {
      content: [
        {
          type: 'text',
          text: `Error in use case sync automation: ${error.message}`
        }
      ],
      isError: true
    };
  }
}));

// =====================================================
// PHASE 4 ADMIN TOOLS — Policy & Audit Management
// These tools require 'admin' permission.
// =====================================================

// ── agent_audit_query ────────────────────────────────────────
server.registerTool('agent_audit_query', {
  description: 'Query the Zero Trust audit log. Filter by agent, tool, decision, project, or time range. Requires admin permission.',
  inputSchema: {
    _token:     z.string().optional().describe('Agent access token (or set MCP_AGENT_TOKEN env var)'),
    agentId:    z.string().optional().describe('Filter by agent ID'),
    tool:       z.string().optional().describe('Filter by tool name'),
    decision:   z.enum(['allow', 'deny']).optional().describe('Filter by decision'),
    projectId:  z.string().optional().describe('Filter by project ID within params'),
    since:      z.string().optional().describe('ISO 8601 datetime — only return entries after this time'),
    until:      z.string().optional().describe('ISO 8601 datetime — only return entries before this time'),
    limit:      z.number().int().min(1).max(500).optional().default(100).describe('Max entries to return (default 100, max 500)'),
    skip:       z.number().int().min(0).optional().default(0).describe('Offset for pagination')
  }
}, withZeroTrust('agent_audit_query', async ({ agentId, tool, decision, projectId, since, until, limit = 100, skip = 0, _ztAuth }) => {
  try {
    const db     = getDatabase();
    const filter = {};

    // Developers can only query their own agents' logs
    filter.developerId = _ztAuth.developerId;

    if (agentId)  filter.agentId  = agentId;
    if (tool)     filter.tool     = tool;
    if (decision) filter.decision = decision;

    if (since || until) {
      filter.timestamp = {};
      if (since) filter.timestamp.$gte = new Date(since);
      if (until) filter.timestamp.$lte = new Date(until);
    }

    const [entries, total] = await Promise.all([
      db.collection('agent_audit_log')
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .project({ _id: 0, 'params.password': 0, 'params.secret': 0 })
        .toArray(),
      db.collection('agent_audit_log').countDocuments(filter)
    ]);

    // Summary stats
    const allows = entries.filter(e => e.decision === 'allow').length;
    const denies = entries.filter(e => e.decision === 'deny').length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          pagination: { total, returned: entries.length, skip, limit },
          summary:    { allows, denies, denyRate: total > 0 ? `${((denies / total) * 100).toFixed(1)}%` : '0%' },
          entries
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('agent_audit_query error:', error);
    return {
      content: [{ type: 'text', text: `Error querying audit log: ${error.message}` }],
      isError: true
    };
  }
}));

// ── agent_policy_update ──────────────────────────────────────
server.registerTool('agent_policy_update', {
  description: 'Manage policy rules for a registered agent. Supports: get (view rules), add (add one rule), remove (remove a rule by id), replace (replace all rules), simulate (test a decision). Requires admin permission.',
  inputSchema: {
    _token:     z.string().optional().describe('Agent access token (or set MCP_AGENT_TOKEN env var)'),
    action:     z.enum(['get', 'add', 'remove', 'replace', 'simulate']).describe('Policy action to perform'),
    agentId:    z.string().describe('Target agent ID'),
    // For add/replace — rule or rules array
    rule: z.object({
      resource:    z.string().describe("Resource pattern. e.g. 'tool:usecases_search' or 'tool:*'"),
      effect:      z.enum(['allow', 'deny']).describe("'allow' or 'deny'"),
      conditions:  z.object({
        projectIds: z.array(z.string()).optional().describe("Allowed project IDs, [] = any project"),
        operations: z.array(z.enum(['read', 'write', 'admin'])).optional().describe("Allowed operations"),
        timeWindow: z.object({
          startHour:  z.number().int().min(0).max(23).describe("Start hour UTC (0-23)"),
          endHour:    z.number().int().min(0).max(23).describe("End hour UTC (0-23)"),
          daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().describe("Allowed days (0=Sun..6=Sat)")
        }).optional().describe("Optional time window restriction")
      }).optional().describe("Conditions that must all match for the rule to apply"),
      description: z.string().optional().describe("Human-readable rule description")
    }).optional().describe("Rule object (required for add action)"),
    rules:      z.array(z.any()).optional().describe("Full rules array for replace action"),
    ruleId:     z.string().optional().describe("Rule ID to remove (required for remove action)"),
    // For simulate
    toolName:   z.string().optional().describe("Tool name to test (required for simulate)"),
    operation:  z.enum(['read', 'write', 'admin']).optional().describe("Operation to test (default: read)")
  }
}, withZeroTrust('agent_policy_update', async ({ action, agentId, rule, rules, ruleId, toolName, operation = 'read', _ztAuth }) => {
  try {
    if (!agentId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'agentId is required' }) }],
        isError: true
      };
    }

    // Verify the agent belongs to this developer
    const db    = getDatabase();
    const agent = await db.collection('agents').findOne({ agentId });
    if (!agent) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Agent '${agentId}' not found` }) }],
        isError: true
      };
    }
    if (agent.developerId.toString() !== _ztAuth.developerId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Access denied — agent belongs to a different developer' }) }],
        isError: true
      };
    }

    let result;

    switch (action) {
      case 'get':
        result = await getPolicyDocument(agentId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              agentId,
              agentName:  agent.name,
              ruleCount:  result.policies?.length ?? 0,
              policies:   result.policies ?? [],
              updatedAt:  result.updatedAt
            }, null, 2)
          }]
        };

      case 'add':
        if (!rule) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: "'rule' object is required for add action" }) }],
            isError: true
          };
        }
        result = await addPolicyRule(agentId, rule);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, message: 'Rule added', rule: result }, null, 2)
          }]
        };

      case 'remove':
        if (!ruleId) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: "'ruleId' is required for remove action" }) }],
            isError: true
          };
        }
        result = await removePolicyRule(agentId, ruleId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, message: 'Rule removed', ruleId }, null, 2)
          }]
        };

      case 'replace':
        if (!Array.isArray(rules)) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: "'rules' array is required for replace action" }) }],
            isError: true
          };
        }
        result = await replacePolicyRules(agentId, rules);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success:   true,
              message:   `Policy replaced with ${result.length} rules`,
              ruleCount: result.length,
              policies:  result
            }, null, 2)
          }]
        };

      case 'simulate':
        if (!toolName) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: "'toolName' is required for simulate action" }) }],
            isError: true
          };
        }
        result = await simulatePolicy(agentId, toolName, { operation, projectId: null });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };

      default:
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Unknown action '${action}'` }) }],
          isError: true
        };
    }
  } catch (error) {
    console.error('agent_policy_update error:', error);
    return {
      content: [{ type: 'text', text: `Policy management error: ${error.message}` }],
      isError: true
    };
  }
}));

// ── agent_session_revoke ─────────────────────────────────────
server.registerTool('agent_session_revoke', {
  description: 'Emergency kill switch — revoke one or all sessions for a registered agent. Requires admin permission.',
  inputSchema: {
    _token:    z.string().optional().describe('Agent access token (or set MCP_AGENT_TOKEN env var)'),
    agentId:   z.string().describe('Target agent ID'),
    sessionId: z.string().optional().describe('Specific session ID to revoke. Omit to revoke ALL sessions for the agent.'),
    reason:    z.string().optional().default('admin_revoke').describe("Reason stored in audit log (default: 'admin_revoke')")
  }
}, withZeroTrust('agent_session_revoke', async ({ agentId, sessionId, reason = 'admin_revoke', _ztAuth }) => {
  try {
    if (!agentId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'agentId is required' }) }],
        isError: true
      };
    }

    // Verify agent ownership
    const db    = getDatabase();
    const agent = await db.collection('agents').findOne({ agentId });
    if (!agent) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Agent '${agentId}' not found` }) }],
        isError: true
      };
    }
    if (agent.developerId.toString() !== _ztAuth.developerId) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Access denied — agent belongs to a different developer' }) }],
        isError: true
      };
    }

    const now = new Date();
    let revokedCount = 0;

    if (sessionId) {
      // Revoke a single session
      const updateResult = await db.collection('agent_sessions').updateOne(
        { agentId, sessionId, revoked: { $ne: true } },
        { $set: { revoked: true, revokedAt: now, revokedReason: reason } }
      );
      revokedCount = updateResult.modifiedCount;
    } else {
      // Revoke ALL active sessions for the agent
      const updateResult = await db.collection('agent_sessions').updateMany(
        { agentId, revoked: { $ne: true } },
        { $set: { revoked: true, revokedAt: now, revokedReason: reason } }
      );
      revokedCount = updateResult.modifiedCount;
    }

    console.error(
      `🚫 [AdminRevoke] ${revokedCount} session(s) revoked for agent ${agentId} by ${_ztAuth.agentName} (${_ztAuth.agentId}) — reason: ${reason}`
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success:      true,
          agentId,
          sessionId:    sessionId ?? 'all',
          revokedCount,
          reason,
          revokedAt:    now,
          message:      sessionId
            ? `Session '${sessionId}' revoked`
            : `All ${revokedCount} active session(s) revoked for agent '${agentId}'`
        }, null, 2)
      }]
    };
  } catch (error) {
    console.error('agent_session_revoke error:', error);
    return {
      content: [{ type: 'text', text: `Session revoke error: ${error.message}` }],
      isError: true
    };
  }
}));

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  process.exit(0);
});

// =====================================================
// API SERVER FOR DEVELOPER REGISTRATION
// =====================================================

async function startApiServer() {
  const app = express();
  const apiPort = process.env.API_PORT || 3001;
  
  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Import auth controller and agent routes
  const { registerDeveloperService, loginDeveloperService } = await import('./src/controllers/authController.js');
  const { agentRoutes }   = await import('./src/routes/agentRoutes.js');
  const { projectRoutes } = await import('./src/routes/projectRoutes.js');
  const { toolRoutes }    = await import('./src/routes/toolRoutes.js');
  const { logsRoutes }    = await import('./src/routes/logsRoutes.js');

  // Mount routes
  app.use('/api/agents',   agentRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/tools',    toolRoutes);
  app.use('/api/logs',     logsRoutes);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      service: 'MCP Hub API',
      timestamp: new Date().toISOString()
    });
  });
  
  // Developer registration
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { name, email, password, company } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required'
        });
      }
      
      const result = await registerDeveloperService({
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        company: company?.trim()
      });
      
      res.json({
        success: true,
        message: 'Developer registered successfully',
        developer: {
          name: result.developer.name,
          email: result.developer.email,
          id: result.developer._id
        },
        apiKey: result.apiKey
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  });

  // Developer login (email + password → API key)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const result = await loginDeveloperService(email, password);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  });

  // API documentation
  app.get('/api', (req, res) => {
    res.json({
      service: 'MCP Hub API',
      version: '2.0.0',
      endpoints: {
        health:                      'GET  /api/health',
        register:                    'POST /api/auth/register',
        // Zero Trust — Agent Identity (Phase 1)
        agentRegister:               'POST /api/agents/register',
        agentList:                   'GET  /api/agents',
        agentGet:                    'GET  /api/agents/:agentId',
        agentUpdatePolicy:           'PATCH /api/agents/:agentId/policy',
        agentRotateSecret:           'POST /api/agents/:agentId/rotate-secret',
        agentDeactivate:             'DELETE /api/agents/:agentId',
        agentRevokeSessions:         'DELETE /api/agents/:agentId/sessions',
        agentListSessions:           'GET  /api/agents/:agentId/sessions',
        // Zero Trust — Session Token Engine (Phase 2)
        agentAuthenticate:           'POST /api/agents/authenticate',
        agentRefreshToken:           'POST /api/agents/refresh',
        agentRevokeSession:          'POST /api/agents/revoke-session',
        agentIntrospect:             'POST /api/agents/introspect',
        // Zero Trust — Policy Management (Phase 4)
        agentGetPolicy:              'GET  /api/agents/:agentId/policy',
        agentAddPolicyRule:          'POST /api/agents/:agentId/policy/rules',
        agentRemovePolicyRule:       'DELETE /api/agents/:agentId/policy/rules/:ruleId',
        agentReplacePolicyRules:     'PUT  /api/agents/:agentId/policy/rules',
        agentSimulatePolicy:         'POST /api/agents/:agentId/policy/simulate'
      }
    });
  });
  
  // Start listening
  const httpServer = app.listen(apiPort, () => {
    console.error(`🌐 API server running on port ${apiPort}`);
    console.error(`📝 Registration available at: http://localhost:${apiPort}/api/auth/register`);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${apiPort} is already in use. Stop the other process or change API_PORT in .env`);
    } else {
      console.error('❌ HTTP server error:', err.message);
    }
    process.exit(1);
  });
}

// Start server
async function startServer() {
  try {
    await connectToMongoDB();
    
    // =====================================================
    // 6) Call ensureUseCaseIndexes() on startup
    // =====================================================
    await ensureUseCaseIndexes();
    
    // Authentication startup message
    console.error("🔐 Authentication enabled - API key required for all tool calls");
    console.error("📝 Register at /api/auth/register to get an API key");
    
    // Start API server for developer registration in parallel (unless skipped)
    if (!process.env.SKIP_API_SERVER) {
      startApiServer();
    } else {
      console.error("ℹ️ API server skipped (SKIP_API_SERVER=true)");
    }

    // Start MCP stdio transport unless running in API-only mode
    if (process.env.SKIP_MCP_STDIO === 'true') {
      console.error("ℹ️ MCP stdio transport skipped (SKIP_MCP_STDIO=true) — API-only mode");
      console.error("🌐 Running in API-only mode. Use the REST API at http://localhost:" + (process.env.API_PORT || 3001));
      // Keep the process alive — Express server handles this
    } else {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('🚀 MCP Hub server started');
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();