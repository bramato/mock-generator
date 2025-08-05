import { OpenRouterAPI, OpenRouterModel } from './openrouter-api';

export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface GeneratedImage {
  url: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: GeneratedImage[];
}

export class ImageGenerator {
  private apiKey: string;
  private api: OpenRouterAPI;
  private baseURL = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.api = new OpenRouterAPI();
  }

  async getAvailableImageModels(): Promise<OpenRouterModel[]> {
    return this.api.fetchImageGenerationModels();
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const {
      prompt,
      model = 'openrouter/horizon-beta',
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
      n = 1
    } = options;

    try {
      const response = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/bramato/openrouter-mock-generator',
          'X-Title': 'OpenRouter Mock Generator'
        },
        body: JSON.stringify({
          model,
          prompt,
          n,
          size,
          quality,
          style,
          response_format: 'url'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image generation failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const result = await response.json() as ImageGenerationResponse;
      return result;

    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }

  async generateImageFromBase64(options: ImageGenerationOptions): Promise<string[]> {
    const response = await this.generateImage({
      ...options,
      n: options.n || 1
    });

    // If the API doesn't return base64, fetch the URLs and convert
    const images: string[] = [];
    
    for (const image of response.data) {
      if (image.b64_json) {
        images.push(image.b64_json);
      } else if (image.url) {
        try {
          const imageResponse = await fetch(image.url);
          const buffer = await imageResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          images.push(base64);
        } catch (error) {
          console.error('Error converting image to base64:', error);
          throw new Error(`Failed to convert image from URL to base64: ${error}`);
        }
      }
    }

    return images;
  }

  async generateMultipleImages(
    prompts: string[], 
    model?: string,
    options?: Omit<ImageGenerationOptions, 'prompt' | 'model'>
  ): Promise<{ prompt: string; images: GeneratedImage[] }[]> {
    const results = [];
    
    for (const prompt of prompts) {
      try {
        const response = await this.generateImage({
          prompt,
          model,
          ...options
        });
        
        results.push({
          prompt,
          images: response.data
        });
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Failed to generate image for prompt: ${prompt}`, error);
        results.push({
          prompt,
          images: []
        });
      }
    }
    
    return results;
  }

  formatImageModelForDisplay(model: OpenRouterModel): string {
    const imagePrice = model.pricing.image ? parseFloat(model.pricing.image) : 0;
    let priceStr: string;
    
    if (imagePrice === 0) {
      priceStr = 'Free';
    } else if (imagePrice < 0.01) {
      priceStr = `$${(imagePrice * 100).toFixed(3)}/100 images`;
    } else {
      priceStr = `$${imagePrice.toFixed(3)}/image`;
    }
    
    return `${model.name || model.id} (${priceStr})`;
  }
}