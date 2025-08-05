#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import readline from 'readline/promises';
import { OpenRouterAPI, type OpenRouterModel, type ModelCategory } from '../services/openrouter-api';

const ENV_FILE_PATH = join(process.cwd(), '.env');

interface AIConfig {
  OPENROUTER_API_KEY: string;
  OPENROUTER_DEFAULT_MODEL?: string;
  OPENROUTER_MOCK_GENERATOR_MODEL?: string;
  STORAGE_PROVIDER?: 'aws' | 'digitalocean';
  // AWS S3 Configuration
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET_NAME?: string;
  AWS_S3_ENDPOINT?: string;
  // DigitalOcean Spaces Configuration
  DO_SPACES_ACCESS_KEY?: string;
  DO_SPACES_SECRET_KEY?: string;
  DO_SPACES_REGION?: string;
  DO_SPACES_NAME?: string;
  DO_API_TOKEN?: string;
}

class InitWizard {
  private rl: readline.Interface;
  private api: OpenRouterAPI;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.api = new OpenRouterAPI();
  }

  async run(): Promise<void> {
    try {
      console.log('🤖 OpenRouter AI Tools Configuration\\n');
      console.log('This wizard will help you set up your OpenRouter API connection.\\n');

      const config = await this.collectConfiguration();
      this.writeConfiguration(config);
      
      console.log('\\n✅ Configuration completed successfully!');
      console.log('\\n🚀 You can now use the AI mock generator:');
      console.log('   ai-generate-mock <input.json> --count 50\\n');
      
    } catch (error) {
      console.error('\\n❌ Configuration failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  private async collectConfiguration(): Promise<AIConfig> {
    // Step 1: API Key
    const apiKey = await this.getApiKey();
    
    // Step 2: Model Selection
    const models = await this.selectModels();
    
    // Step 3: Storage Configuration (optional)
    const storageConfig = await this.configureStorage();
    
    return {
      OPENROUTER_API_KEY: apiKey,
      OPENROUTER_DEFAULT_MODEL: models.default,
      OPENROUTER_MOCK_GENERATOR_MODEL: models.mockGenerator,
      ...storageConfig
    };
  }

  private async getApiKey(): Promise<string> {
    console.log('Step 1: OpenRouter API Key\\n');
    console.log('📌 Get your API key from: \\x1b[36mhttps://openrouter.ai/settings/keys\\x1b[0m');
    console.log('   (Ctrl/Cmd + Click to open in browser)\\n');

    const existingKey = this.getExistingApiKey();
    if (existingKey) {
      const keep = await this.askQuestion(`Found existing API key (${this.maskApiKey(existingKey)}). Keep it? (y/n) `);
      if (keep.toLowerCase() === 'y' || keep.toLowerCase() === 'yes') {
        return existingKey;
      }
    }

    let apiKey = '';
    while (!apiKey || !this.isValidApiKey(apiKey)) {
      apiKey = await this.askQuestion('Enter your OpenRouter API key: ');
      if (!this.isValidApiKey(apiKey)) {
        console.log('❌ Invalid API key format. Please try again.\\n');
      }
    }

    return apiKey;
  }

  private async selectModels(): Promise<{ default?: string; mockGenerator?: string }> {
    console.log('\\nStep 2: Model Selection');
    console.log('Different services can use different models for optimal performance.\\n');

    console.log('🔄 Fetching JSON-capable models from OpenRouter...');
    const models = await this.api.fetchAvailableModels(true);
    console.log(`\\n✅ Found ${models.length} JSON-capable models\\n`);

    const defaultModel = await this.selectModelFromCategories(models, 'default');
    const mockModel = await this.selectModelFromCategories(models, 'mock generator');

    return {
      default: defaultModel,
      mockGenerator: mockModel
    };
  }

  private async selectModelFromCategories(models: OpenRouterModel[], serviceType: string): Promise<string | undefined> {
    console.log(`\\n🎯 Select model for ${serviceType}:`);
    
    const categories = this.categorizeModels(models);
    let currentIndex = 1;
    
    categories.forEach(category => {
      console.log(`\\n📁 ${category.name}`);
      console.log(`   ${category.description}`);
      category.models.forEach((model, index) => {
        console.log(`   ${currentIndex++}. ${this.api.formatModelForDisplay(model)}`);
      });
    });
    
    console.log(`\\n   ${currentIndex++}. Custom (enter your own model ID)`);
    console.log(`   ${currentIndex++}. Skip (use default: ${categories[0]?.models[0]?.name || 'Claude 3.5 Sonnet'})`);
    
    const choice = await this.askQuestion(`\\nChoose model (1-${currentIndex - 1}): `);
    const choiceNum = parseInt(choice);
    
    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > currentIndex - 1) {
      console.log('Invalid choice, using default.');
      return categories[0]?.models[0]?.id;
    }
    
    // Handle custom and skip options
    if (choiceNum === currentIndex - 2) { // Custom
      const customModel = await this.askQuestion('Enter model ID: ');
      return customModel.trim() || undefined;
    }
    
    if (choiceNum === currentIndex - 1) { // Skip
      return undefined;
    }
    
    // Find the selected model
    let selectedModel: OpenRouterModel | undefined;
    let currentModelIndex = 1;
    
    for (const category of categories) {
      for (const model of category.models) {
        if (currentModelIndex === choiceNum) {
          selectedModel = model;
          break;
        }
        currentModelIndex++;
      }
      if (selectedModel) break;
    }
    
    return selectedModel?.id;
  }

  private categorizeModels(models: OpenRouterModel[]): ModelCategory[] {
    const categories: ModelCategory[] = [
      {
        name: 'Recommended for Mock Generation',
        description: 'Best models for generating realistic mock data',
        models: []
      },
      {
        name: 'Fast & Economical',
        description: 'Quick responses at lower cost',
        models: []
      }
    ];

    const recommendedIds = [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4.1-nano',
      'anthropic/claude-3-haiku'
    ];

    const fastIds = [
      'openai/gpt-4.1-nano',
      'anthropic/claude-3-haiku',
      'openai/gpt-3.5-turbo'
    ];

    models.forEach(model => {
      if (recommendedIds.includes(model.id)) {
        categories[0].models.push(model);
      } else if (fastIds.includes(model.id)) {
        categories[1].models.push(model);
      }
    });

    return categories.filter(cat => cat.models.length > 0);
  }

  private async askQuestion(prompt: string): Promise<string> {
    const answer = await this.rl.question(prompt);
    return answer.trim();
  }

  private getExistingApiKey(): string | null {
    if (existsSync(ENV_FILE_PATH)) {
      const envContent = readFileSync(ENV_FILE_PATH, 'utf8');
      const match = envContent.match(/OPENROUTER_API_KEY=(.+)/);
      return match ? match[1].trim() : null;
    }
    return null;
  }

  private isValidApiKey(key: string): boolean {
    return key.startsWith('sk-') && key.length > 20;
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return '****';
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }

  private async configureStorage(): Promise<Partial<AIConfig>> {
    console.log('\\nStep 3: Storage Configuration (Optional)');
    console.log('Configure cloud storage for image storage. Leave blank to skip.\\n');

    const useStorage = await this.askQuestion('Do you want to configure cloud storage for images? (y/n) ');
    
    if (useStorage.toLowerCase() !== 'y' && useStorage.toLowerCase() !== 'yes') {
      console.log('Skipping storage configuration.');
      return {};
    }

    console.log('\\nChoose your storage provider:');
    console.log('1. AWS S3');
    console.log('2. DigitalOcean Spaces');
    
    const choice = await this.askQuestion('Select provider (1-2): ');
    
    if (choice === '1') {
      return this.configureAWS();
    } else if (choice === '2') {
      return this.configureDigitalOcean();
    } else {
      console.log('Invalid choice. Skipping storage configuration.');
      return {};
    }
  }

  private async configureAWS(): Promise<Partial<AIConfig>> {
    console.log('\\n📦 AWS S3 Configuration');
    console.log('📌 Get AWS credentials from: \\x1b[36mhttps://console.aws.amazon.com/iam/home#/security_credentials\\x1b[0m');
    console.log('   (Create an IAM user with S3 permissions)\\n');

    const accessKeyId = await this.askQuestion('AWS Access Key ID: ');
    if (!accessKeyId.trim()) return {};

    const secretAccessKey = await this.askQuestion('AWS Secret Access Key: ');
    if (!secretAccessKey.trim()) return {};

    const region = await this.askQuestion('AWS Region (default: us-east-1): ') || 'us-east-1';
    const bucketName = await this.askQuestion('S3 Bucket Name: ');
    if (!bucketName.trim()) return {};

    const endpoint = await this.askQuestion('Custom S3 Endpoint (optional): ');

    // Test AWS connection
    console.log('\\n🔄 Testing AWS S3 connection...');
    try {
      const { AWSS3Storage } = await import('../services/aws-s3-storage');
      const s3 = new AWSS3Storage({
        accessKeyId,
        secretAccessKey,
        region,
        bucketName,
        endpoint: endpoint || undefined
      });

      const isConnected = await s3.testConnection();
      if (isConnected) {
        console.log('✅ AWS S3 connection successful!');
      } else {
        console.log('⚠️  AWS S3 connection test failed, but configuration will be saved.');
      }
    } catch (error) {
      console.log('⚠️  Could not test AWS S3 connection, but configuration will be saved.');
    }

    return {
      STORAGE_PROVIDER: 'aws',
      AWS_ACCESS_KEY_ID: accessKeyId,
      AWS_SECRET_ACCESS_KEY: secretAccessKey,
      AWS_REGION: region,
      AWS_S3_BUCKET_NAME: bucketName,
      AWS_S3_ENDPOINT: endpoint || undefined
    };
  }

  private async configureDigitalOcean(): Promise<Partial<AIConfig>> {
    console.log('\\n🌊 DigitalOcean Spaces Configuration');
    console.log('📌 Get Spaces credentials from: \\x1b[36mhttps://cloud.digitalocean.com/settings/api/tokens\\x1b[0m');
    console.log('   (Go to Spaces Keys section)\\n');

    // Show available regions
    const { DigitalOceanSpaces } = await import('../services/digitalocean-spaces');
    const regions = DigitalOceanSpaces.getAvailableRegions();
    
    console.log('Available regions:');
    regions.forEach((region, index) => {
      console.log(`   ${index + 1}. ${region.code} - ${region.name} (${region.location})`);
    });

    const regionChoice = await this.askQuestion(`\\nSelect region (1-${regions.length}): `);
    const regionIndex = parseInt(regionChoice) - 1;
    
    if (isNaN(regionIndex) || regionIndex < 0 || regionIndex >= regions.length) {
      console.log('Invalid region choice. Using default: nyc3');
    }
    
    const selectedRegion = regions[regionIndex] || regions[0];

    const accessKey = await this.askQuestion('Spaces Access Key: ');
    if (!accessKey.trim()) return {};

    const secretKey = await this.askQuestion('Spaces Secret Key: ');
    if (!secretKey.trim()) return {};

    // Ask if user wants to create a new Space or use existing one
    const createNew = await this.askQuestion('Create a new Space? (y/n, default: y): ') || 'y';
    
    let spaceName: string;
    let spaceCreated = false;

    if (createNew.toLowerCase() === 'y' || createNew.toLowerCase() === 'yes') {
      spaceName = await this.askQuestion('New Space name (letters, numbers, hyphens only): ');
      if (!spaceName.trim()) {
        spaceName = `ai-images-${Date.now()}`;
        console.log(`Using auto-generated name: ${spaceName}`);
      }

      // Create the Space
      console.log(`\\n🔄 Creating Space "${spaceName}" in ${selectedRegion.name}...`);
      try {
        const doSpaces = new DigitalOceanSpaces({
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
          region: selectedRegion.code,
          spaceName
        });

        await doSpaces.createSpace(spaceName, selectedRegion.code, true);
        spaceCreated = true;
        console.log('✅ Space created successfully!');
      } catch (error) {
        console.log(`⚠️  Failed to create Space: ${error}`);
        console.log('You can create it manually or use an existing one.');
      }
    } else {
      // List existing Spaces
      console.log('\\n🔄 Fetching existing Spaces...');
      try {
        const doSpaces = new DigitalOceanSpaces({
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
          region: selectedRegion.code
        });

        const spaces = await doSpaces.listSpaces();
        if (spaces.length === 0) {
          console.log('No existing Spaces found. Please create one first.');
          return {};
        }

        console.log('\\nExisting Spaces:');
        spaces.forEach((space, index) => {
          console.log(`   ${index + 1}. ${space.name} (${space.region})`);
        });

        const spaceChoice = await this.askQuestion(`\\nSelect Space (1-${spaces.length}): `);
        const spaceIndex = parseInt(spaceChoice) - 1;
        
        if (isNaN(spaceIndex) || spaceIndex < 0 || spaceIndex >= spaces.length) {
          console.log('Invalid Space choice.');
          return {};
        }

        spaceName = spaces[spaceIndex].name;
      } catch (error) {
        console.log(`⚠️  Could not list Spaces: ${error}`);
        spaceName = await this.askQuestion('Enter Space name manually: ');
        if (!spaceName.trim()) return {};
      }
    }

    // Test connection
    console.log('\\n🔄 Testing DigitalOcean Spaces connection...');
    try {
      const doSpaces = new DigitalOceanSpaces({
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        region: selectedRegion.code,
        spaceName
      });

      const isConnected = await doSpaces.testConnection();
      if (isConnected) {
        console.log('✅ DigitalOcean Spaces connection successful!');
        console.log(`📡 CDN URL: https://${spaceName}.${selectedRegion.code}.cdn.digitaloceanspaces.com`);
      } else {
        console.log('⚠️  Connection test failed, but configuration will be saved.');
      }
    } catch (error) {
      console.log('⚠️  Could not test connection, but configuration will be saved.');
    }

    const doApiToken = await this.askQuestion('DigitalOcean API Token (optional, for advanced features): ');

    return {
      STORAGE_PROVIDER: 'digitalocean',
      DO_SPACES_ACCESS_KEY: accessKey,
      DO_SPACES_SECRET_KEY: secretKey,
      DO_SPACES_REGION: selectedRegion.code,
      DO_SPACES_NAME: spaceName,
      DO_API_TOKEN: doApiToken || undefined
    };
  }

  private writeConfiguration(config: AIConfig): void {
    const lines: string[] = [];
    
    if (existsSync(ENV_FILE_PATH)) {
      const existing = readFileSync(ENV_FILE_PATH, 'utf8');
      const existingLines = existing.split('\\n');
      
      existingLines.forEach(line => {
        if (!line.startsWith('OPENROUTER_') && 
            !line.startsWith('AWS_') && 
            !line.startsWith('DO_') && 
            !line.startsWith('STORAGE_PROVIDER')) {
          lines.push(line);
        }
      });
    }
    
    // OpenRouter configuration
    lines.push(`OPENROUTER_API_KEY=${config.OPENROUTER_API_KEY}`);
    if (config.OPENROUTER_DEFAULT_MODEL) {
      lines.push(`OPENROUTER_DEFAULT_MODEL=${config.OPENROUTER_DEFAULT_MODEL}`);
    }
    if (config.OPENROUTER_MOCK_GENERATOR_MODEL) {
      lines.push(`OPENROUTER_MOCK_GENERATOR_MODEL=${config.OPENROUTER_MOCK_GENERATOR_MODEL}`);
    }
    
    // Storage provider
    if (config.STORAGE_PROVIDER) {
      lines.push(`STORAGE_PROVIDER=${config.STORAGE_PROVIDER}`);
    }
    
    // AWS configuration (if provided)
    if (config.AWS_ACCESS_KEY_ID) {
      lines.push(`AWS_ACCESS_KEY_ID=${config.AWS_ACCESS_KEY_ID}`);
    }
    if (config.AWS_SECRET_ACCESS_KEY) {
      lines.push(`AWS_SECRET_ACCESS_KEY=${config.AWS_SECRET_ACCESS_KEY}`);
    }
    if (config.AWS_REGION) {
      lines.push(`AWS_REGION=${config.AWS_REGION}`);
    }
    if (config.AWS_S3_BUCKET_NAME) {
      lines.push(`AWS_S3_BUCKET_NAME=${config.AWS_S3_BUCKET_NAME}`);
    }
    if (config.AWS_S3_ENDPOINT) {
      lines.push(`AWS_S3_ENDPOINT=${config.AWS_S3_ENDPOINT}`);
    }
    
    // DigitalOcean configuration (if provided)
    if (config.DO_SPACES_ACCESS_KEY) {
      lines.push(`DO_SPACES_ACCESS_KEY=${config.DO_SPACES_ACCESS_KEY}`);
    }
    if (config.DO_SPACES_SECRET_KEY) {
      lines.push(`DO_SPACES_SECRET_KEY=${config.DO_SPACES_SECRET_KEY}`);
    }
    if (config.DO_SPACES_REGION) {
      lines.push(`DO_SPACES_REGION=${config.DO_SPACES_REGION}`);
    }
    if (config.DO_SPACES_NAME) {
      lines.push(`DO_SPACES_NAME=${config.DO_SPACES_NAME}`);
    }
    if (config.DO_API_TOKEN) {
      lines.push(`DO_API_TOKEN=${config.DO_API_TOKEN}`);
    }
    
    writeFileSync(ENV_FILE_PATH, lines.filter(line => line.trim()).join('\\n') + '\\n');
  }
}

// Run the wizard
const wizard = new InitWizard();
wizard.run();