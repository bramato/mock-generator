import { ImageGenerator, ImageGenerationOptions } from './image-generator';
import { AWSS3Storage, S3Config, UploadResult } from './aws-s3-storage';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ImageMockOptions extends ImageGenerationOptions {
  uploadToS3?: boolean;
  filename?: string;
}

export interface ImageMockResult {
  prompt: string;
  imageUrl: string;
  s3Upload?: UploadResult;
  localPath?: string;
}

export class ImageMockGenerator {
  private imageGenerator: ImageGenerator;
  private s3Storage?: AWSS3Storage;
  private config: any;

  constructor(openRouterApiKey: string) {
    this.imageGenerator = new ImageGenerator(openRouterApiKey);
    this.loadConfiguration();
    
    if (this.hasS3Config()) {
      this.s3Storage = new AWSS3Storage({
        accessKeyId: this.config.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
        region: this.config.AWS_REGION,
        bucketName: this.config.AWS_S3_BUCKET_NAME,
        endpoint: this.config.AWS_S3_ENDPOINT
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

  async generateImageMock(options: ImageMockOptions): Promise<ImageMockResult> {
    const {
      prompt,
      uploadToS3 = false,
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
      let s3Upload: UploadResult | undefined;

      // Upload to S3 if requested and configured
      if (uploadToS3 && this.s3Storage) {
        console.log('☁️  Uploading to S3...');
        
        // Get image data as base64
        const base64Images = await this.imageGenerator.generateImageFromBase64({
          prompt,
          n: 1,
          ...imageOptions
        });

        if (base64Images.length > 0) {
          s3Upload = await this.s3Storage.uploadImage(
            base64Images[0],
            `${filename}.png`,
            'image/png'
          );
          
          finalImageUrl = s3Upload.url;
          console.log(`✅ Image uploaded to S3: ${finalImageUrl}`);
        }
      } else if (uploadToS3 && !this.s3Storage) {
        console.warn('⚠️  S3 upload requested but S3 is not configured. Using original URL.');
      }

      return {
        prompt,
        imageUrl: finalImageUrl,
        s3Upload,
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
          s3Upload: undefined,
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

  async testS3Connection(): Promise<boolean> {
    if (!this.s3Storage) {
      return false;
    }
    
    return this.s3Storage.testConnection();
  }

  formatResultsAsJSON(results: ImageMockResult[]): string {
    return JSON.stringify(results.map(result => ({
      prompt: result.prompt,
      imageUrl: result.imageUrl,
      s3Key: result.s3Upload?.key,
      uploadStatus: result.s3Upload ? 'uploaded' : 'not_uploaded'
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
        
        if (result.s3Upload) {
          markdown += `**S3 Key:** ${result.s3Upload.key}\n\n`;
        }
      } else {
        markdown += `❌ *Image generation failed*\n\n`;
      }
      
      markdown += '---\n\n';
    });
    
    return markdown;
  }
}