#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ImageMockGenerator } from '../services/image-mock-generator';

interface CLIOptions {
  prompts: string[];
  model?: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  count?: number;
  uploadToCloud?: boolean;
  output?: string;
  format?: 'json' | 'markdown';
}

class ImageGeneratorCLI {
  private generator?: ImageMockGenerator;

  async run(): Promise<void> {
    try {
      const options = this.parseArguments();
      
      if (options.prompts.length === 0) {
        this.showHelp();
        return;
      }

      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.error('❌ OpenRouter API key not found. Run "ai-init" first.');
        process.exit(1);
      }

      this.generator = new ImageMockGenerator(apiKey);
      
      console.log('🤖 AI Image Generator');
      console.log(`📝 Generating ${options.prompts.length} image(s)...`);

      const results = await this.generator.generateMultipleImageMocks(
        options.prompts,
        {
          model: options.model,
          size: options.size,
          quality: options.quality,
          style: options.style,
          uploadToCloud: options.uploadToCloud
        }
      );

      // Output results
      if (options.output) {
        this.saveResults(results, options);
        console.log(`📁 Results saved to: ${options.output}`);
      } else {
        this.displayResults(results, options.format);
      }

    } catch (error) {
      console.error('❌ Image generation failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private parseArguments(): CLIOptions {
    const args = process.argv.slice(2);
    const options: CLIOptions = {
      prompts: [],
      uploadToCloud: false,
      format: 'json'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--model':
        case '-m':
          options.model = args[++i];
          break;
        case '--size':
        case '-s':
          options.size = args[++i] as any;
          break;
        case '--quality':
        case '-q':
          options.quality = args[++i] as any;
          break;
        case '--style':
          options.style = args[++i] as any;
          break;
        case '--count':
        case '-c':
          options.count = parseInt(args[++i]);
          break;
        case '--upload-cloud':
        case '--cloud':
        case '--upload-s3':
        case '--s3':
          options.uploadToCloud = true;
          break;
        case '--output':
        case '-o':
          options.output = args[++i];
          break;
        case '--format':
        case '-f':
          options.format = args[++i] as any;
          break;
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
        default:
          if (!arg.startsWith('-')) {
            options.prompts.push(arg);
          }
          break;
      }
    }

    return options;
  }

  private getApiKey(): string | null {
    try {
      const envPath = join(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf8');
      const match = envContent.match(/OPENROUTER_API_KEY=(.+)/);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  private saveResults(results: any[], options: CLIOptions): void {
    if (!options.output || !this.generator) return;

    let content: string;
    
    if (options.format === 'markdown') {
      content = this.generator.formatResultsAsMarkdown(results);
    } else {
      content = this.generator.formatResultsAsJSON(results);
    }

    writeFileSync(options.output, content, 'utf8');
  }

  private displayResults(results: any[], format?: string): void {
    if (!this.generator) return;

    if (format === 'markdown') {
      console.log('\n' + this.generator.formatResultsAsMarkdown(results));
    } else {
      console.log('\n' + this.generator.formatResultsAsJSON(results));
    }
  }

  private showHelp(): void {
    console.log(`
🎨 AI Image Generator

USAGE:
  ai-generate-images [OPTIONS] <prompt1> [prompt2] [prompt3]...

OPTIONS:
  -m, --model <model>       OpenRouter model to use
  -s, --size <size>         Image size (256x256, 512x512, 1024x1024, 1024x1792, 1792x1024)
  -q, --quality <quality>   Image quality (standard, hd)
  --style <style>           Image style (vivid, natural)
  -c, --count <number>      Number of images per prompt (default: 1)
  --cloud, --upload-cloud   Upload images to configured cloud storage (AWS S3 or DigitalOcean Spaces)
  -o, --output <file>       Save results to file
  -f, --format <format>     Output format (json, markdown)
  -h, --help                Show this help

EXAMPLES:
  # Generate single image
  ai-generate-images "A sunset over mountains"

  # Generate multiple images
  ai-generate-images "Cat playing piano" "Dog reading book" "Robot cooking"

  # Upload to cloud storage and save as markdown
  ai-generate-images --cloud --format markdown --output results.md "AI generated art"

  # Specify model and size
  ai-generate-images --model "openrouter/horizon-beta" --size "1024x1024" "Abstract art"

SETUP:
  Run 'ai-init' first to configure your OpenRouter API key and cloud storage (AWS S3 or DigitalOcean Spaces).
`);
  }
}

// Run CLI
const cli = new ImageGeneratorCLI();
cli.run();