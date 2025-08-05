export interface ImageGenerationOptions {
  prompt: string;
  model?: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  provider?: 'openai' | 'replicate' | 'huggingface';
}

export interface GeneratedImage {
  url: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: GeneratedImage[];
  provider: string;
  model: string;
}

export interface ImageProvider {
  id: string;
  name: string;
  description: string;
  models: ImageModel[];
  requiresApiKey: boolean;
  pricing: {
    free: boolean;
    costPerImage?: string;
  };
}

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  sizes: string[];
  maxImages: number;
}

export class ImageGenerator {
  private huggingfaceApiKey?: string;

  constructor(huggingfaceApiKey?: string) {
    this.huggingfaceApiKey = huggingfaceApiKey;
  }

  getAvailableModels(): ImageModel[] {
    return [
      {
        id: 'black-forest-labs/FLUX.1-dev',
        name: 'FLUX.1 Dev',
        description: 'State-of-the-art image generation model by Black Forest Labs',
        sizes: ['1024x1024', '1024x1792', '1792x1024'],
        maxImages: 1
      },
      {
        id: 'Qwen/Qwen-Image',
        name: 'Qwen Image',
        description: 'Advanced multimodal model with image generation capabilities',
        sizes: ['1024x1024'],
        maxImages: 1
      }
    ];
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResponse> {
    const {
      prompt,
      model = 'black-forest-labs/FLUX.1-dev',
      size = '1024x1024'
    } = options;

    try {
      return await this.generateWithHuggingFace({ prompt, model, size });
    } catch (error) {
      console.error('Error generating image with Hugging Face:', error);
      throw error;
    }
  }


  private async generateWithHuggingFace(options: {
    prompt: string;
    model?: string;
    size: string;
  }): Promise<ImageGenerationResponse> {
    const { prompt, model = 'stabilityai/stable-diffusion-xl-base-1.0', size } = options;
    
    const apiUrl = `https://api-inference.huggingface.co/models/${model}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Try without API key first for free models
    console.log(`🔑 HF API Key available: ${!!this.huggingfaceApiKey}`);
    
    if (this.huggingfaceApiKey && this.huggingfaceApiKey.trim()) {
      headers['Authorization'] = `Bearer ${this.huggingfaceApiKey}`;
      console.log(`🔐 Using authentication with token: ${this.huggingfaceApiKey.substring(0, 6)}...`);
    } else {
      console.log(`🆓 Trying without authentication (free tier)`);
    }

    console.log(`🎨 Generating image with model: ${model}`);
    console.log(`📝 Prompt: "${prompt}"`);

    const [width, height] = size.split('x').map(Number);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 20,
          guidance_scale: 7.5,
          width: width || 1024,
          height: height || 1024
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Check if it's a model loading error
      if (response.status === 503) {
        throw new Error(`Model is loading. Please wait a few seconds and try again. This is normal for first requests to Hugging Face models.`);
      }
      
      throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    // Check if response is JSON (error) or binary (image)
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      const errorData = await response.json() as any;
      if (errorData.error) {
        throw new Error(`Hugging Face API error: ${errorData.error}`);
      }
    }

    // Hugging Face returns binary image data
    const imageBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    
    // Create data URL for immediate use
    const mimeType = contentType || 'image/png';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    console.log(`✅ Image generated successfully (${imageBuffer.byteLength} bytes)`);

    return {
      created: Date.now(),
      data: [{
        url: dataUrl,
        b64_json: base64
      }],
      provider: 'huggingface',
      model
    };
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

  formatImageModelForDisplay(model: ImageModel): string {
    const sizesStr = model.sizes.join(', ');
    return `${model.name} - ${model.description} (Sizes: ${sizesStr})`;
  }
}