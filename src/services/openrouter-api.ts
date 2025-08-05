export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
  top_provider: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
  supported_generation_methods?: string[];
}

export interface ModelCategory {
  name: string;
  description: string;
  models: OpenRouterModel[];
}

export class OpenRouterAPI {
  private baseURL = 'https://openrouter.ai/api/v1';

  async fetchAvailableModels(jsonOnly: boolean = false): Promise<OpenRouterModel[]> {
    try {
      const response = await fetch(`${this.baseURL}/models`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      let models = data.data || [];
      
      if (jsonOnly) {
        models = this.filterJsonCapableModels(models);
      }
      
      return models;
    } catch (error) {
      console.error('Error fetching OpenRouter models:', error);
      return this.getFallbackModels(jsonOnly);
    }
  }
  
  private filterJsonCapableModels(models: OpenRouterModel[]): OpenRouterModel[] {
    // Models known to support JSON mode based on OpenRouter docs
    const jsonCapablePatterns = [
      /^openai\//,           // All OpenAI models
      /^gpt-/,              // GPT models
      /^nitro/,             // Nitro models
      /^anthropic\/claude-3/, // Claude 3 models support JSON
      /^google\/gemini/,     // Gemini models
    ];
    
    return models.filter(model => {
      // Check if model ID matches known JSON-capable patterns
      const isKnownJsonCapable = jsonCapablePatterns.some(pattern => pattern.test(model.id));
      
      // Also check if model explicitly supports json_object in generation methods
      const hasJsonSupport = model.supported_generation_methods?.includes('json_object') ?? false;
      
      return isKnownJsonCapable || hasJsonSupport;
    });
  }

  formatModelForDisplay(model: OpenRouterModel): string {
    const price = parseFloat(model.pricing.prompt);
    let priceStr: string;
    
    if (price === 0) {
      priceStr = 'Free';
    } else if (price < 0.0001) {
      priceStr = `$${(price * 1000000).toFixed(2)}/1M tokens`;
    } else if (price < 0.001) {
      priceStr = `$${(price * 1000).toFixed(2)}/1k tokens`;
    } else {
      priceStr = `$${price.toFixed(3)}/1k tokens`;
    }
    
    const contextK = Math.floor(model.context_length / 1000);
    
    return `${model.name || model.id} (${contextK}k context, ${priceStr})`;
  }

  getFallbackModels(jsonOnly: boolean = false): OpenRouterModel[] {
    const allFallbacks = [
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Most intelligent model - JSON capable',
        pricing: { prompt: '0.003', completion: '0.015' },
        context_length: 200000,
        architecture: { modality: 'text', tokenizer: 'Claude' },
        top_provider: {},
        supported_generation_methods: ['json_object']
      },
      {
        id: 'openai/gpt-4.1-nano',
        name: 'GPT-4.1 Nano',
        description: 'Fastest and cheapest GPT-4.1 model - JSON capable',
        pricing: { prompt: '0.000100', completion: '0.000400' },
        context_length: 1047576,
        architecture: { modality: 'text', tokenizer: 'GPT' },
        top_provider: {},
        supported_generation_methods: ['json_object']
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        description: 'Fast and cost-effective - JSON capable',
        pricing: { prompt: '0.00025', completion: '0.00125' },
        context_length: 200000,
        architecture: { modality: 'text', tokenizer: 'Claude' },
        top_provider: {},
        supported_generation_methods: ['json_object']
      }
    ];
    
    return jsonOnly ? this.filterJsonCapableModels(allFallbacks) : allFallbacks;
  }
}