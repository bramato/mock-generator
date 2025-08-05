/**
 * Servizio coordinatore per il post-processing delle immagini nei dati mock
 */

import { ImageUrlExtractor, type ExtractionResult } from './image-url-extractor';
import { DescriptionGenerator, type ImageDescription, type DescriptionOptions } from './description-generator';
import { ImageProcessingAnalyzer, type OptimizationResult, type ProcessingGroup, type ProcessingPlan } from './image-processing-analyzer';
import { UrlReplacer, type ReplacementResult, type ReplacementOptions } from './url-replacer';
import { ImageMockGenerator } from './image-mock-generator';

export interface PostProcessingOptions {
  // Opzioni generali
  enableImageReplacement?: boolean;
  enableOptimization?: boolean;
  maxConcurrentGenerations?: number;
  
  // Opzioni per la generazione descrizioni
  descriptionOptions?: DescriptionOptions;
  
  // Opzioni per il caricamento cloud
  uploadToCloud?: boolean;
  storageProvider?: 'aws' | 'digitalocean';
  
  // Opzioni per la sostituzione URL
  replacementOptions?: ReplacementOptions;
  
  // Opzioni di logging e debug
  verbose?: boolean;
  saveIntermediateResults?: boolean;
  logFile?: string;
}

export interface PostProcessingResult {
  success: boolean;
  originalImageCount: number;
  processedImageCount: number;
  generatedImageCount: number;
  optimizationSavings: number;
  processingTimeMs: number;
  
  // Risultati dettagliati
  extraction: ExtractionResult;
  optimization: OptimizationResult;
  replacement: ReplacementResult;
  
  // Dati finali
  processedData: any;
  
  // Errori e warning
  errors: string[];
  warnings: string[];
}

export interface ProcessingStats {
  phase: string;
  startTime: number;
  endTime?: number;
  itemsProcessed: number;
  errors: number;
  details?: any;
}

export class PostProcessingOrchestrator {
  private imageGenerator: ImageMockGenerator;
  private stats: ProcessingStats[] = [];
  private options: Required<Omit<PostProcessingOptions, 'logFile'>> & { logFile?: string };

  constructor(
    huggingfaceApiKey?: string,
    options: PostProcessingOptions = {}
  ) {
    this.imageGenerator = new ImageMockGenerator(huggingfaceApiKey);
    this.options = this.normalizeOptions(options);
  }

  /**
   * Esegue il post-processing completo dei dati mock
   */
  async processData(data: any): Promise<PostProcessingResult> {
    const startTime = Date.now();
    const result: PostProcessingResult = {
      success: false,
      originalImageCount: 0,
      processedImageCount: 0,
      generatedImageCount: 0,
      optimizationSavings: 0,
      processingTimeMs: 0,
      extraction: { images: [], totalFound: 0, uniqueUrls: 0, duplicateGroups: new Map() },
      optimization: { groups: [], totalImages: 0, generatedImages: 0, resizedImages: 0, croppedImages: 0, reusedImages: 0, estimatedSavings: 0 },
      replacement: { success: false, replacedCount: 0, failedCount: 0, mappings: [], modifiedData: data, errors: [] },
      processedData: data,
      errors: [],
      warnings: []
    };

    try {
      if (!this.options.enableImageReplacement) {
        this.log('📋 Image replacement disabled, skipping post-processing');
        result.success = true;
        result.processedData = data;
        return result;
      }

      this.log('🚀 Starting post-processing pipeline...\n');

      // Fase 1: Estrazione URL immagini
      result.extraction = await this.extractImageUrls(data);
      if (result.extraction.totalFound === 0) {
        this.log('ℹ️  No Picsum images found, skipping processing');
        result.success = true;
        result.processedData = data;
        return result;
      }

      // Fase 2: Generazione descrizioni
      const descriptions = await this.generateDescriptions(result.extraction);

      // Fase 3: Analisi e ottimizzazione
      result.optimization = await this.optimizeProcessing(result.extraction, descriptions);

      // Fase 4: Generazione immagini
      const generatedImages = await this.generateImages(result.optimization);

      // Fase 5: Sostituzione URL
      result.replacement = await this.replaceUrls(data, generatedImages);

      // Calcola statistiche finali
      result.originalImageCount = result.extraction.totalFound;
      result.processedImageCount = result.replacement.replacedCount;
      result.generatedImageCount = generatedImages.filter(img => img.success).length;
      result.optimizationSavings = result.optimization.estimatedSavings;
      result.processedData = result.replacement.modifiedData;
      result.success = result.replacement.success && result.errors.length === 0;

      this.log(`\n✅ Post-processing completed successfully!`);
      this.logFinalStats(result);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Post-processing failed: ${errorMsg}`);
      this.log(`❌ Post-processing failed: ${errorMsg}`);
      result.success = false;
    } finally {
      result.processingTimeMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Fase 1: Estrazione URL immagini Picsum
   */
  private async extractImageUrls(data: any): Promise<ExtractionResult> {
    const phase = this.startPhase('Image URL Extraction');

    try {
      this.log('🔍 Extracting Picsum URLs from data...');
      const result = ImageUrlExtractor.extractPicsumUrls(data);
      
      const stats = ImageUrlExtractor.getExtractionStats(result);
      this.log(`   ${stats.summary}`);
      
      if (this.options.verbose) {
        this.log('   📊 Dimensions distribution:');
        stats.dimensionDistribution.forEach((count, dim) => {
          this.log(`      • ${dim}: ${count} images`);
        });
      }

      this.endPhase(phase, result.totalFound, 0);
      return result;

    } catch (error) {
      this.endPhase(phase, 0, 1);
      throw error;
    }
  }

  /**
   * Fase 2: Generazione descrizioni contestuali
   */
  private async generateDescriptions(extraction: ExtractionResult): Promise<Map<string, ImageDescription>> {
    const phase = this.startPhase('Description Generation');

    try {
      this.log('📝 Generating contextual descriptions...');
      const descriptions = DescriptionGenerator.generateDescriptions(
        extraction.images,
        this.options.descriptionOptions
      );

      this.log(`   Generated ${descriptions.size} contextual descriptions`);

      if (this.options.verbose) {
        const categories = new Map<string, number>();
        descriptions.forEach(desc => {
          categories.set(desc.category, (categories.get(desc.category) || 0) + 1);
        });

        this.log('   📊 Categories distribution:');
        categories.forEach((count, category) => {
          this.log(`      • ${category}: ${count} images`);
        });
      }

      this.endPhase(phase, descriptions.size, 0);
      return descriptions;

    } catch (error) {
      this.endPhase(phase, 0, 1);
      throw error;
    }
  }

  /**
   * Fase 3: Analisi e ottimizzazione processing
   */
  private async optimizeProcessing(
    extraction: ExtractionResult,
    descriptions: Map<string, ImageDescription>
  ): Promise<OptimizationResult> {
    const phase = this.startPhase('Processing Optimization');

    try {
      this.log('⚙️  Analyzing and optimizing image processing...');
      
      if (!this.options.enableOptimization) {
        this.log('   Optimization disabled, creating basic plan');
        // Crea piano base senza ottimizzazioni
        return this.createBasicPlan(extraction.images, descriptions);
      }

      const result = ImageProcessingAnalyzer.createProcessingPlan(extraction.images, descriptions);
      
      const stats = ImageProcessingAnalyzer.getOptimizationStats(result);
      this.log(`   ${stats.summary}`);
      this.log(`   Efficiency score: ${stats.efficiencyScore}%`);

      if (this.options.verbose) {
        this.log('   📊 Processing breakdown:');
        Object.entries(stats.breakdown).forEach(([type, count]) => {
          this.log(`      • ${type}: ${count}`);
        });
      }

      this.endPhase(phase, result.totalImages, 0);
      return result;

    } catch (error) {
      this.endPhase(phase, 0, 1);
      throw error;
    }
  }

  /**
   * Fase 4: Generazione immagini AI
   */
  private async generateImages(
    optimization: OptimizationResult
  ): Promise<Array<{
    originalUrl: string;
    newUrl: string;
    cdnUrl?: string;
    path: string;
    success: boolean;
    error?: string;
  }>> {
    const phase = this.startPhase('Image Generation');

    try {
      this.log('🎨 Generating AI images...');
      
      const results: Array<{
        originalUrl: string;
        newUrl: string;
        cdnUrl?: string;
        path: string;
        success: boolean;
        error?: string;
      }> = [];

      // Ordina gruppi per priorità
      const sortedGroups = ImageProcessingAnalyzer.sortGroupsByPriority(optimization.groups);
      
      // Processa gruppi con concorrenza limitata
      const concurrencyLimit = this.options.maxConcurrentGenerations || 3;
      const batches = this.createBatches(sortedGroups, concurrencyLimit);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        this.log(`   Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} groups)`);

        const batchPromises = batch.map(group => this.processGroup(group));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(...result.value);
          } else {
            const group = batch[index];
            this.log(`   ❌ Failed to process group ${group.masterImageId}: ${result.reason}`);
            // Aggiungi risultati falliti
            group.variants.forEach(variant => {
              results.push({
                originalUrl: '', // TODO: recupera URL originale
                newUrl: '',
                path: variant.imageId,
                success: false,
                error: result.reason?.toString()
              });
            });
          }
        });

        // Pausa tra batch per evitare rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successCount = results.filter(r => r.success).length;
      this.log(`   Generated ${successCount}/${results.length} images successfully`);

      this.endPhase(phase, successCount, results.length - successCount);
      return results;

    } catch (error) {
      this.endPhase(phase, 0, 1);
      throw error;
    }
  }

  /**
   * Fase 5: Sostituzione URL nei dati
   */
  private async replaceUrls(
    data: any,
    generatedImages: Array<{
      originalUrl: string;
      newUrl: string;
      cdnUrl?: string;
      path: string;
      success: boolean;
    }>
  ): Promise<ReplacementResult> {
    const phase = this.startPhase('URL Replacement');

    try {
      this.log('🔄 Replacing URLs in data...');

      const { urlMappings, cdnMappings } = UrlReplacer.createUrlMappings(generatedImages);
      
      const result = await UrlReplacer.replaceUrls(
        data,
        urlMappings,
        cdnMappings,
        this.options.replacementOptions
      );

      const stats = UrlReplacer.getReplacementStats(result);
      this.log(`   ${stats.summary}`);

      this.endPhase(phase, result.replacedCount, result.failedCount);
      return result;

    } catch (error) {
      this.endPhase(phase, 0, 1);
      throw error;
    }
  }

  /**
   * Processa un singolo gruppo di immagini
   */
  private async processGroup(group: ProcessingGroup): Promise<Array<{
    originalUrl: string;
    newUrl: string;
    cdnUrl?: string;
    path: string;
    success: boolean;
    error?: string;
  }>> {
    const results: Array<{
      originalUrl: string;
      newUrl: string;
      cdnUrl?: string;
      path: string;
      success: boolean;
      error?: string;
    }> = [];

    // Prima genera l'immagine master
    const masterPlan = group.variants.find(v => v.processingType === 'generate');
    if (!masterPlan) {
      throw new Error(`No master generation plan found for group ${group.masterImageId}`);
    }

    try {
      const masterResult = await this.imageGenerator.generateImageMock({
        prompt: masterPlan.description.enhancedPrompt,
        model: 'black-forest-labs/FLUX.1-dev',
        size: `${masterPlan.targetDimensions.width}x${masterPlan.targetDimensions.height}` as any,
        uploadToCloud: this.options.uploadToCloud
      });

      if (!masterResult.imageUrl) {
        throw new Error(`Failed to generate master image: No image URL returned`);
      }

      // Processa tutte le varianti
      for (const variant of group.variants) {
        if (variant.processingType === 'generate') {
          // È l'immagine master già generata
          results.push({
            originalUrl: variant.imageId, // TODO: recupera URL originale
            newUrl: masterResult.imageUrl,
            cdnUrl: masterResult.cdnUrl,
            path: variant.imageId,
            success: true
          });
        } else {
          // Implementa ridimensionamento/ritaglio in futuro
          // Per ora riusa l'immagine master
          results.push({
            originalUrl: variant.imageId,
            newUrl: masterResult.imageUrl,
            cdnUrl: masterResult.cdnUrl,
            path: variant.imageId,
            success: true
          });
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      // Aggiungi risultati falliti per tutte le varianti
      group.variants.forEach(variant => {
        results.push({
          originalUrl: variant.imageId,
          newUrl: '',
          path: variant.imageId,
          success: false,
          error: errorMsg
        });
      });
    }

    return results;
  }

  /**
   * Crea piano base senza ottimizzazioni
   */
  private createBasicPlan(
    images: any[],
    descriptions: Map<string, ImageDescription>
  ): OptimizationResult {
    const groups: ProcessingGroup[] = images.map(img => {
      const description = descriptions.get(img.path)!;
      return {
        masterImageId: img.path,
        description,
        targetDimensions: img.dimensions,
        variants: [{
          imageId: img.path,
          processingType: 'generate',
          targetDimensions: img.dimensions,
          description,
          priority: 1,
          estimatedCost: 1
        }],
        totalCost: 1
      };
    });

    return {
      groups,
      totalImages: images.length,
      generatedImages: images.length,
      resizedImages: 0,
      croppedImages: 0,
      reusedImages: 0,
      estimatedSavings: 0
    };
  }

  /**
   * Crea batch per elaborazione concorrente
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Gestione fasi di processing
   */
  private startPhase(phase: string): ProcessingStats {
    const stats: ProcessingStats = {
      phase,
      startTime: Date.now(),
      itemsProcessed: 0,
      errors: 0
    };
    this.stats.push(stats);
    return stats;
  }

  private endPhase(stats: ProcessingStats, itemsProcessed: number, errors: number): void {
    stats.endTime = Date.now();
    stats.itemsProcessed = itemsProcessed;
    stats.errors = errors;
  }

  /**
   * Logging
   */
  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }

  private logFinalStats(result: PostProcessingResult): void {
    this.log(`\n📊 Final Statistics:`);
    this.log(`   • Original images: ${result.originalImageCount}`);
    this.log(`   • Processed images: ${result.processedImageCount}`);
    this.log(`   • Generated images: ${result.generatedImageCount}`);
    this.log(`   • Optimization savings: ${result.optimizationSavings.toFixed(1)}%`);
    this.log(`   • Processing time: ${(result.processingTimeMs / 1000).toFixed(1)}s`);
    
    if (result.errors.length > 0) {
      this.log(`   • Errors: ${result.errors.length}`);
    }
    if (result.warnings.length > 0) {
      this.log(`   • Warnings: ${result.warnings.length}`);
    }
  }

  /**
   * Normalizza opzioni con valori di default
   */
  private normalizeOptions(options: PostProcessingOptions): Required<Omit<PostProcessingOptions, 'logFile'>> & { logFile?: string } {
    return {
      enableImageReplacement: options.enableImageReplacement ?? true,
      enableOptimization: options.enableOptimization ?? true,
      maxConcurrentGenerations: options.maxConcurrentGenerations ?? 3,
      descriptionOptions: options.descriptionOptions ?? {},
      uploadToCloud: options.uploadToCloud ?? true,
      storageProvider: options.storageProvider ?? 'digitalocean',
      replacementOptions: options.replacementOptions ?? {},
      verbose: options.verbose ?? true,
      saveIntermediateResults: options.saveIntermediateResults ?? false,
      logFile: options.logFile
    };
  }

  /**
   * Ottieni statistiche complete del processing
   */
  getProcessingStats(): ProcessingStats[] {
    return [...this.stats];
  }

  /**
   * Reset statistiche
   */
  resetStats(): void {
    this.stats = [];
  }
}