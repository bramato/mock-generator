import { OpenRouterConfig } from '../types/index';

export type ServiceType = 'mockGenerator' | 'codeGenerator' | 'translation' | 'default';

export class OpenRouterService {
  private config: OpenRouterConfig;
  private serviceType: ServiceType;

  constructor(config: OpenRouterConfig, serviceType: ServiceType = 'default') {
    this.config = config;
    this.serviceType = serviceType;
  }

  private getModelForService(): string {
    // Check for service-specific model first
    const serviceKey = this.serviceType === 'mockGenerator' ? 'MOCK_GENERATOR' 
                     : this.serviceType === 'codeGenerator' ? 'CODE_GENERATOR'
                     : this.serviceType === 'translation' ? 'TRANSLATION' 
                     : 'DEFAULT';
    const serviceModelKey = `OPENROUTER_${serviceKey}_MODEL`;
    const serviceModel = process.env[serviceModelKey];
    
    if (serviceModel) {
      return serviceModel;
    }

    // Fall back to default model
    if (process.env.OPENROUTER_DEFAULT_MODEL) {
      return process.env.OPENROUTER_DEFAULT_MODEL;
    }

    // Finally, use the config model or hardcoded default
    return this.config.model;
  }

  private supportsJsonMode(modelId: string): boolean {
    // Models known to support JSON mode based on OpenRouter docs
    const jsonCapablePatterns = [
      /^openai\//,           // All OpenAI models
      /^gpt-/,              // GPT models
      /^nitro/,             // Nitro models
      /^anthropic\/claude-3/, // Claude 3 models support JSON
      /^google\/gemini/,     // Gemini models
    ];
    
    return jsonCapablePatterns.some(pattern => pattern.test(modelId));
  }

  async generateMockData(prompt: string, schema?: any, forceJson: boolean = false): Promise<string> {
    try {
      const model = this.getModelForService();
      
      const requestBody: any = {
        model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPromptForService(forceJson)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.getTemperatureForService(),
        max_tokens: this.getMaxTokensForService()
      };

      // Force JSON output for compatible models
      if (forceJson) {
        requestBody.response_format = { type: 'json_object' };
      }
      
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/bramato/openrouter-mock-generator',
          'X-Title': `MockGenerator ${this.serviceType}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as any;
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      throw new Error(`Failed to generate with ${this.serviceType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getSystemPromptForService(forceJson: boolean = false): string {
    switch (this.serviceType) {
      case 'mockGenerator':
        if (forceJson) {
          return 'You are a mock data generator. Generate realistic mock data based on the provided schema and examples. You MUST return only valid JSON. Do not include any markdown formatting, code blocks, or explanations. The response must be parseable JSON.';
        }
        return 'You are a mock data generator. Generate realistic mock data based on the provided schema and examples. Return only valid JSON without markdown formatting or explanations.';
      case 'codeGenerator':
        return 'You are a code generator assistant. Generate clean, well-structured code following best practices. Include appropriate comments and follow the existing code style.';
      case 'translation':
        return 'You are a translation assistant. Translate text accurately while preserving technical terms and context. Return only the translated text without explanations.';
      default:
        return 'You are an AI assistant. Provide helpful and accurate responses.';
    }
  }

  private getTemperatureForService(): number {
    switch (this.serviceType) {
      case 'mockGenerator':
        return 0.7; // More creative for varied data
      case 'codeGenerator':
        return 0.3; // More deterministic for code
      case 'translation':
        return 0.1; // Very consistent for translations
      default:
        return 0.5;
    }
  }

  private getMaxTokensForService(): number {
    const model = this.getModelForService();
    
    // Check model-specific limits and set appropriate max_tokens
    if (model.includes('claude-3')) {
      // Claude 3 models have high context windows, use generous token limits for mock generation
      return this.serviceType === 'mockGenerator' ? 8000 : 4000;
    } else if (model.includes('gpt-4')) {
      // GPT-4 models
      return this.serviceType === 'mockGenerator' ? 6000 : 3000;
    } else if (model.includes('gpt-3.5')) {
      // GPT-3.5 has lower limits
      return this.serviceType === 'mockGenerator' ? 3000 : 2000;
    } else if (model.includes('gemini')) {
      // Gemini models
      return this.serviceType === 'mockGenerator' ? 7000 : 3500;
    }
    
    // Default conservative limit
    switch (this.serviceType) {
      case 'mockGenerator':
        return 4000; // High limit for mock data generation
      case 'codeGenerator':
        return 3000; // Moderate limit for code
      case 'translation':
        return 1500; // Lower limit for translations
      default:
        return 2000;
    }
  }

  static getDefaultConfig(): OpenRouterConfig {
    return {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet'
    };
  }
}