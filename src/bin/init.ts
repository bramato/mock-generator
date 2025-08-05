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
    
    return {
      OPENROUTER_API_KEY: apiKey,
      OPENROUTER_DEFAULT_MODEL: models.default,
      OPENROUTER_MOCK_GENERATOR_MODEL: models.mockGenerator
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

  private writeConfiguration(config: AIConfig): void {
    const lines: string[] = [];
    
    if (existsSync(ENV_FILE_PATH)) {
      const existing = readFileSync(ENV_FILE_PATH, 'utf8');
      const existingLines = existing.split('\\n');
      
      existingLines.forEach(line => {
        if (!line.startsWith('OPENROUTER_')) {
          lines.push(line);
        }
      });
    }
    
    lines.push(`OPENROUTER_API_KEY=${config.OPENROUTER_API_KEY}`);
    if (config.OPENROUTER_DEFAULT_MODEL) {
      lines.push(`OPENROUTER_DEFAULT_MODEL=${config.OPENROUTER_DEFAULT_MODEL}`);
    }
    if (config.OPENROUTER_MOCK_GENERATOR_MODEL) {
      lines.push(`OPENROUTER_MOCK_GENERATOR_MODEL=${config.OPENROUTER_MOCK_GENERATOR_MODEL}`);
    }
    
    writeFileSync(ENV_FILE_PATH, lines.filter(line => line.trim()).join('\\n') + '\\n');
  }
}

// Run the wizard
const wizard = new InitWizard();
wizard.run();