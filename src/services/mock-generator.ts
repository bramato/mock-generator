import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { OpenRouterService } from './openrouter';
import { PatternAnalyzer } from '../utils/pattern-analyzer';
import { MockGenerationRequest, MockGenerationResult, OpenRouterConfig } from '../types/index';
import { PostProcessingOrchestrator, type PostProcessingOptions } from './post-processing-orchestrator';

export class MockGeneratorService {
  private openRouter: OpenRouterService;
  private postProcessor?: PostProcessingOrchestrator;

  constructor(config?: OpenRouterConfig, enableImageProcessing: boolean = true) {
    this.openRouter = new OpenRouterService(
      config || OpenRouterService.getDefaultConfig(),
      'mockGenerator'
    );
    
    if (enableImageProcessing) {
      try {
        // Tenta di inizializzare il post-processor con la chiave HuggingFace
        const hfKey = this.getHuggingFaceApiKey();
        this.postProcessor = new PostProcessingOrchestrator(hfKey || undefined);
      } catch (error) {
        console.warn('⚠️  Image processing disabled: Failed to initialize post-processor');
      }
    }
  }

  private getHuggingFaceApiKey(): string | null {
    try {
      // Cerca nelle variabili d'ambiente
      if (process.env.HUGGINGFACE_API_KEY) {
        return process.env.HUGGINGFACE_API_KEY;
      }

      // Cerca nel file .env (sync per compatibilità con costruttore)
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env');
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/HUGGINGFACE_API_KEY=(.+)/);
        return match ? match[1].trim() : null;
      }
    } catch (error) {
      // Ignora errori, il post-processing funzionerà comunque senza chiave API
    }
    
    return null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private createPrompt(sampleItem: any, count: number = 1, preferences?: string): string {
    const basePrompt = `Generate ${count} realistic mock data items based on this example structure:

${JSON.stringify(sampleItem, null, 2)}

Requirements:
- Keep the same structure and data types
- Generate realistic values that match the context (names, prices, dates, etc.)
- Ensure all required fields are present
- Use Italian locale for names, addresses, and text when appropriate
- For prices, use realistic values with proper formatting
- For IDs, use unique sequential numbers starting from a random high number

IMAGE GENERATION RULES:
- For image URLs, ALWAYS use https://picsum.photos/ with appropriate dimensions
- If you see existing image URLs with specific dimensions, maintain the same format but use Picsum Photos
- For NULL image fields, generate appropriate Picsum URLs based on field name:
  * Fields ending with "_1x1" or containing "square": use 400x400 dimensions
  * Fields ending with "_4x3": use 800x600 dimensions (4:3 ratio)
  * Fields ending with "_16x9": use 800x450 dimensions (16:9 ratio)
  * Fields containing "thumb": use 200x200 dimensions
  * Fields containing "banner" or "header": use 1200x300 dimensions
  * Generic image fields: use 800x600 dimensions
- Add seed parameter based on item name/description for consistent images: https://picsum.photos/800/600?random=SEED
- Use a seed derived from the item name, description, or ID to ensure consistent but varied images
- Example: if generating for "Nencini Sport Milano", use seed like "milano" or the store ID`;

    // Add custom preferences if provided
    const preferencesSection = preferences 
      ? `\n\nCUSTOM PREFERENCES:\n${preferences}\nPlease follow these specific preferences while maintaining the required structure and data types.`
      : '';

    const closingPrompt = `\n\n- Return only the JSON array without any markdown formatting or explanations

Generate exactly ${count} item${count > 1 ? 's' : ''}.`;

    return basePrompt + preferencesSection + closingPrompt;
  }

  private calculateOptimalBatchSize(sampleItem: any): number {
    // Calculate complexity and return optimal batch size
    const jsonString = JSON.stringify(sampleItem);
    const itemSizeInChars = jsonString.length;
    const fieldCount = this.countFields(sampleItem);
    
    let complexityScore = 0;
    
    if (itemSizeInChars > 5000) complexityScore += 4;
    else if (itemSizeInChars > 2000) complexityScore += 3;
    else if (itemSizeInChars > 1000) complexityScore += 2;
    else if (itemSizeInChars > 500) complexityScore += 1;
    
    if (fieldCount > 50) complexityScore += 3;
    else if (fieldCount > 30) complexityScore += 2;
    else if (fieldCount > 15) complexityScore += 1;
    
    const nestedComplexity = this.calculateNestedComplexity(sampleItem);
    complexityScore += Math.min(nestedComplexity, 4);
    
    let batchSize: number;
    if (complexityScore >= 8) batchSize = 1;
    else if (complexityScore >= 6) batchSize = 2;
    else if (complexityScore >= 4) batchSize = 3;
    else if (complexityScore >= 2) batchSize = 5;
    else batchSize = 10;
    
    return batchSize;
  }

  private countFields(obj: any, depth: number = 0): number {
    if (depth > 10 || obj === null || typeof obj !== 'object') return 0;
    
    let count = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        count++;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          count += this.countFields(obj[key], depth + 1);
        }
      }
    }
    return count;
  }

  private calculateNestedComplexity(obj: any, depth: number = 0): number {
    if (depth > 10 || obj === null || typeof obj !== 'object') return 0;
    
    let complexity = 0;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          complexity += 2;
          if (value.length > 0 && typeof value[0] === 'object') {
            complexity += 1;
          }
        } else if (typeof value === 'object' && value !== null) {
          complexity += 1;
          complexity += this.calculateNestedComplexity(value, depth + 1);
        }
      }
    }
    return complexity;
  }

  private async generateSingleBatch(sampleItem: any, count: number, preferences?: string): Promise<any[]> {
    const prompt = this.createPrompt(sampleItem, count, preferences);
    const response = await this.openRouter.generateMockData(prompt, undefined, true);
    
    try {
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanResponse);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error('JSON parsing failed, raw response:', response);
      throw new Error(`Failed to parse generated JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async appendToJsonFile(filePath: string, newItems: any[], isFirstBatch: boolean): Promise<void> {
    if (isFirstBatch) {
      const jsonContent = JSON.stringify(newItems, null, 2);
      await writeFile(filePath, jsonContent, 'utf8');
    } else {
      const existingContent = await readFile(filePath, 'utf8');
      const existingData = JSON.parse(existingContent);
      
      if (!Array.isArray(existingData)) {
        throw new Error('Output file does not contain a JSON array');
      }
      
      const mergedData = [...existingData, ...newItems];
      const jsonContent = JSON.stringify(mergedData, null, 2);
      await writeFile(filePath, jsonContent, 'utf8');
    }
  }

  async generateMockData(request: MockGenerationRequest): Promise<MockGenerationResult> {
    try {
      // Clear output file at the beginning
      await writeFile(request.outputFile, '[]', 'utf8');

      const inputContent = await readFile(request.inputFile, 'utf8');
      const inputData = JSON.parse(inputContent);

      const analyses = PatternAnalyzer.analyzeJsonStructure(inputData);
      
      if (analyses.length === 0) {
        return {
          success: false,
          generatedCount: 0,
          outputFile: request.outputFile,
          error: 'No arrays found in input file'
        };
      }

      const targetAnalysis = request.arrayPath 
        ? analyses.find(a => a.arrayPath === request.arrayPath)
        : PatternAnalyzer.findLargestArray(analyses);

      if (!targetAnalysis) {
        return {
          success: false,
          generatedCount: 0,
          outputFile: request.outputFile,
          error: request.arrayPath 
            ? `No array found at path: ${request.arrayPath}`
            : 'No suitable array found for mock generation'
        };
      }

      const sampleItem = targetAnalysis.sampleItem;
      const optimalBatchSize = this.calculateOptimalBatchSize(sampleItem);
      const totalBatches = Math.ceil(request.count / optimalBatchSize);
      let generatedCount = 0;

      for (let batch = 0; batch < totalBatches; batch++) {
        const remainingItems = request.count - generatedCount;
        const currentBatchSize = Math.min(optimalBatchSize, remainingItems);
        
        const newItems = await this.generateSingleBatch(sampleItem, currentBatchSize, request.preferences);
        await this.appendToJsonFile(request.outputFile, newItems, batch === 0);
        
        generatedCount += newItems.length;
        
        // Dynamic delay based on batch size
        const delay = Math.max(500, currentBatchSize * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Post-processing: sostituisci immagini Picsum con AI generate
      if (this.postProcessor && request.enableImageProcessing !== false) {
        try {
          console.log('\n🎨 Starting image post-processing...');
          
          const finalData = await readFile(request.outputFile, 'utf8');
          const parsedData = JSON.parse(finalData);
          
          const postProcessingResult = await this.postProcessor.processData(parsedData);
          
          if (postProcessingResult.success) {
            // Salva dati con immagini sostituite
            const processedContent = JSON.stringify(postProcessingResult.processedData, null, 2);
            await writeFile(request.outputFile, processedContent, 'utf8');
            
            console.log(`✅ Image post-processing completed!`);
            console.log(`   • Original images: ${postProcessingResult.originalImageCount}`);
            console.log(`   • Processed images: ${postProcessingResult.processedImageCount}`);
            console.log(`   • Generated images: ${postProcessingResult.generatedImageCount}`);
            if (postProcessingResult.optimizationSavings > 0) {
              console.log(`   • Optimization savings: ${postProcessingResult.optimizationSavings.toFixed(1)}%`);
            }
          } else {
            console.warn('⚠️  Image post-processing failed:', postProcessingResult.errors.join(', '));
            console.log('   Continuing with original Picsum images...');
          }
        } catch (error) {
          console.warn('⚠️  Image post-processing error:', error instanceof Error ? error.message : 'Unknown error');
          console.log('   Continuing with original Picsum images...');
        }
      }

      return {
        success: true,
        generatedCount,
        outputFile: request.outputFile
      };

    } catch (error) {
      return {
        success: false,
        generatedCount: 0,
        outputFile: request.outputFile,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}