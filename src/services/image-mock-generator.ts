import { ImageGenerator, ImageGenerationOptions } from './image-generator';
import { AWSS3Storage, S3Config, UploadResult as S3UploadResult } from './aws-s3-storage';
import { DigitalOceanSpaces, UploadResult as DOUploadResult } from './digitalocean-spaces';
import { readFileSync } from 'fs';
import { join } from 'path';

export type UploadResult = S3UploadResult | DOUploadResult;

export interface ImageMockOptions extends ImageGenerationOptions {
  uploadToCloud?: boolean;
  filename?: string;
}

export interface ImageMockResult {
  prompt: string;
  imageUrl: string;
  cloudUpload?: UploadResult;
  cdnUrl?: string;
  localPath?: string;
}

export class ImageMockGenerator {
  private imageGenerator: ImageGenerator;
  private s3Storage?: AWSS3Storage;
  private doStorage?: DigitalOceanSpaces;
  private config: any;

  constructor(openRouterApiKey: string) {
    this.imageGenerator = new ImageGenerator(openRouterApiKey);
    this.loadConfiguration();
    
    // Initialize storage based on provider
    if (this.config.STORAGE_PROVIDER === 'aws' && this.hasS3Config()) {
      this.s3Storage = new AWSS3Storage({
        accessKeyId: this.config.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
        region: this.config.AWS_REGION,
        bucketName: this.config.AWS_S3_BUCKET_NAME,
        endpoint: this.config.AWS_S3_ENDPOINT
      });
    } else if (this.config.STORAGE_PROVIDER === 'digitalocean' && this.hasDOConfig()) {
      this.doStorage = new DigitalOceanSpaces({
        accessKeyId: this.config.DO_SPACES_ACCESS_KEY,
        secretAccessKey: this.config.DO_SPACES_SECRET_KEY,
        region: this.config.DO_SPACES_REGION,
        spaceName: this.config.DO_SPACES_NAME,
        apiToken: this.config.DO_API_TOKEN
      });
    }
  }

  private loadConfiguration(): void {
    try {
      const envPath = join(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf8');
      
      this.config = {};
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          this.config[key.trim()] = value.trim();
        }
      });
    } catch (error) {
      console.warn('Could not load .env file. Some features may not work.');
      this.config = {};
    }
  }

  private hasS3Config(): boolean {
    return !!(
      this.config.AWS_ACCESS_KEY_ID &&
      this.config.AWS_SECRET_ACCESS_KEY &&
      this.config.AWS_REGION &&
      this.config.AWS_S3_BUCKET_NAME
    );
  }

  private hasDOConfig(): boolean {
    return !!(
      this.config.DO_SPACES_ACCESS_KEY &&
      this.config.DO_SPACES_SECRET_KEY &&
      this.config.DO_SPACES_REGION &&
      this.config.DO_SPACES_NAME
    );
  }

  async generateImageMock(options: ImageMockOptions): Promise<ImageMockResult> {
    const {
      prompt,
      uploadToCloud = false,
      filename = `generated-${Date.now()}`,
      ...imageOptions
    } = options;

    try {
      // Generate image using OpenRouter
      console.log(`🎨 Generating image: "${prompt}"`);
      const imageResponse = await this.imageGenerator.generateImage({
        prompt,
        ...imageOptions
      });

      if (!imageResponse.data || imageResponse.data.length === 0) {
        throw new Error('No image data received from OpenRouter');
      }

      const imageData = imageResponse.data[0];
      let finalImageUrl = imageData.url;
      let cloudUpload: UploadResult | undefined;
      let cdnUrl: string | undefined;

      // Upload to cloud storage if requested and configured
      if (uploadToCloud) {
        // Get image data as base64
        const base64Images = await this.imageGenerator.generateImageFromBase64({
          prompt,
          n: 1,
          ...imageOptions
        });

        if (base64Images.length > 0) {
          if (this.s3Storage) {
            console.log('☁️  Uploading to AWS S3...');
            cloudUpload = await this.s3Storage.uploadImage(
              base64Images[0],
              `${filename}.png`,
              'image/png'
            );
            finalImageUrl = cloudUpload.url;
            console.log(`✅ Image uploaded to S3: ${finalImageUrl}`);
            
          } else if (this.doStorage) {
            console.log('☁️  Uploading to DigitalOcean Spaces...');
            cloudUpload = await this.doStorage.uploadImage(
              base64Images[0],
              `${filename}.png`,
              'image/png'
            );
            finalImageUrl = cloudUpload.url;
            cdnUrl = (cloudUpload as DOUploadResult).cdnUrl;
            console.log(`✅ Image uploaded to Spaces: ${finalImageUrl}`);
            if (cdnUrl) {
              console.log(`📡 CDN URL: ${cdnUrl}`);
            }
          } else {
            console.warn('⚠️  Cloud upload requested but no storage provider is configured. Using original URL.');
          }
        }
      }

      return {
        prompt,
        imageUrl: finalImageUrl,
        cloudUpload,
        cdnUrl,
        localPath: undefined // Could implement local saving if needed
      };

    } catch (error) {
      console.error(`❌ Failed to generate image for prompt: "${prompt}"`, error);
      throw error;
    }
  }

  async generateMultipleImageMocks(
    prompts: string[],
    options: Omit<ImageMockOptions, 'prompt'> = {}
  ): Promise<ImageMockResult[]> {
    const results: ImageMockResult[] = [];
    
    console.log(`🎨 Generating ${prompts.length} images...`);
    
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      
      try {
        console.log(`\n[${i + 1}/${prompts.length}] Processing: "${prompt}"`);
        
        const result = await this.generateImageMock({
          prompt,
          filename: `batch-${i + 1}-${Date.now()}`,
          ...options
        });
        
        results.push(result);
        
        // Add delay to avoid rate limiting
        if (i < prompts.length - 1) {
          console.log('⏳ Waiting to avoid rate limits...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process prompt ${i + 1}: "${prompt}"`);
        results.push({
          prompt,
          imageUrl: '',
          cloudUpload: undefined,
          cdnUrl: undefined,
          localPath: undefined
        });
      }
    }
    
    console.log(`\n✅ Completed batch generation: ${results.filter(r => r.imageUrl).length}/${prompts.length} successful`);
    return results;
  }

  async getAvailableModels() {
    return this.imageGenerator.getAvailableImageModels();
  }

  async testCloudConnection(): Promise<boolean> {
    if (this.s3Storage) {
      return this.s3Storage.testConnection();
    } else if (this.doStorage) {
      return this.doStorage.testConnection();
    }
    
    return false;
  }

  formatResultsAsJSON(results: ImageMockResult[]): string {
    return JSON.stringify(results.map(result => ({
      prompt: result.prompt,
      imageUrl: result.imageUrl,
      cdnUrl: result.cdnUrl,
      cloudKey: result.cloudUpload?.key,
      uploadStatus: result.cloudUpload ? 'uploaded' : 'not_uploaded',
      storageProvider: this.config.STORAGE_PROVIDER || 'none'
    })), null, 2);
  }

  formatResultsAsMarkdown(results: ImageMockResult[]): string {
    let markdown = '# Generated Images\n\n';
    
    results.forEach((result, index) => {
      markdown += `## Image ${index + 1}\n\n`;
      markdown += `**Prompt:** ${result.prompt}\n\n`;
      
      if (result.imageUrl) {
        markdown += `![Generated Image](${result.imageUrl})\n\n`;
        markdown += `**URL:** [${result.imageUrl}](${result.imageUrl})\n\n`;
        
        if (result.cdnUrl) {
          markdown += `**CDN URL:** [${result.cdnUrl}](${result.cdnUrl})\n\n`;
        }
        
        if (result.cloudUpload) {
          markdown += `**Storage Key:** ${result.cloudUpload.key}\n\n`;
          markdown += `**Provider:** ${this.config.STORAGE_PROVIDER || 'unknown'}\n\n`;
        }
      } else {
        markdown += `❌ *Image generation failed*\n\n`;
      }
      
      markdown += '---\n\n';
    });
    
    return markdown;
  }
}