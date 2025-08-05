/**
 * Microservizio per analizzare e determinare il tipo di elaborazione per le immagini
 */

import { ImageUrlInfo } from './image-url-extractor';
import { ImageDescription } from './description-generator';

export interface ProcessingPlan {
  imageId: string;
  processingType: 'generate' | 'resize' | 'crop' | 'reuse';
  sourceImageId?: string;
  targetDimensions: {
    width: number;
    height: number;
  };
  cropRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  description: ImageDescription;
  priority: number;
  estimatedCost: number;
}

export interface ProcessingGroup {
  masterImageId: string;
  description: ImageDescription;
  targetDimensions: {
    width: number;
    height: number;
  };
  variants: ProcessingPlan[];
  totalCost: number;
}

export interface OptimizationResult {
  groups: ProcessingGroup[];
  totalImages: number;
  generatedImages: number;
  resizedImages: number;
  croppedImages: number;
  reusedImages: number;
  estimatedSavings: number;
}

export class ImageProcessingAnalyzer {
  private static readonly SIMILARITY_THRESHOLD = 0.8;
  private static readonly MIN_RESIZE_RATIO = 0.5;
  private static readonly MAX_RESIZE_RATIO = 2.0;
  private static readonly CROP_EFFICIENCY_THRESHOLD = 0.6;

  /**
   * Analizza e crea un piano di elaborazione ottimizzato
   */
  static createProcessingPlan(
    images: ImageUrlInfo[],
    descriptions: Map<string, ImageDescription>
  ): OptimizationResult {
    // Raggruppa immagini per similarità di contenuto
    const similarityGroups = this.groupBySimilarity(images, descriptions);
    
    // Crea gruppi di elaborazione ottimizzati
    const processingGroups = similarityGroups.map(group => 
      this.optimizeGroup(group, descriptions)
    );

    return this.calculateOptimizationResult(processingGroups);
  }

  /**
   * Raggruppa immagini per similarità di contenuto
   */
  private static groupBySimilarity(
    images: ImageUrlInfo[],
    descriptions: Map<string, ImageDescription>
  ): ImageUrlInfo[][] {
    const groups: ImageUrlInfo[][] = [];
    const processed = new Set<string>();

    images.forEach(image => {
      if (processed.has(image.path)) return;

      const currentGroup = [image];
      processed.add(image.path);

      const currentDesc = descriptions.get(image.path);
      if (!currentDesc) return;

      // Trova immagini simili
      images.forEach(otherImage => {
        if (processed.has(otherImage.path)) return;

        const otherDesc = descriptions.get(otherImage.path);
        if (!otherDesc) return;

        const similarity = this.calculateDescriptionSimilarity(currentDesc, otherDesc);
        const contextSimilarity = this.calculateContextSimilarity(image, otherImage);

        if (similarity >= this.SIMILARITY_THRESHOLD || contextSimilarity >= this.SIMILARITY_THRESHOLD) {
          currentGroup.push(otherImage);
          processed.add(otherImage.path);
        }
      });

      groups.push(currentGroup);
    });

    return groups;
  }

  /**
   * Calcola similarità tra descrizioni
   */
  private static calculateDescriptionSimilarity(
    desc1: ImageDescription,
    desc2: ImageDescription
  ): number {
    // Similarità basata su categoria
    const categorySimilarity = desc1.category === desc2.category ? 0.4 : 0;
    
    // Similarità basata su parole chiave nel prompt
    const words1 = new Set(desc1.prompt.toLowerCase().split(/\s+/));
    const words2 = new Set(desc2.prompt.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    const wordSimilarity = intersection.size / union.size * 0.4;
    
    // Similarità di stile
    const styleSimilarity = desc1.style === desc2.style ? 0.2 : 0;

    return categorySimilarity + wordSimilarity + styleSimilarity;
  }

  /**
   * Calcola similarità tra contesti
   */
  private static calculateContextSimilarity(
    img1: ImageUrlInfo,
    img2: ImageUrlInfo
  ): number {
    const context1 = img1.context;
    const context2 = img2.context;

    if (!context1 || !context2) return 0;

    let similarity = 0;
    let comparisons = 0;

    // Confronta campi chiave
    const keyFields = ['category', 'type', 'brand', 'location', 'name'];
    
    keyFields.forEach(field => {
      if (context1[field] && context2[field]) {
        comparisons++;
        if (context1[field] === context2[field]) {
          similarity += 1;
        } else if (typeof context1[field] === 'string' && typeof context2[field] === 'string') {
          // Calcola similarità tra stringhe
          const stringSim = this.calculateStringSimilarity(context1[field], context2[field]);
          similarity += stringSim;
        }
      }
    });

    return comparisons > 0 ? similarity / comparisons : 0;
  }

  /**
   * Calcola similarità tra stringhe
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calcola distanza di Levenshtein
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Ottimizza un gruppo di immagini simili
   */
  private static optimizeGroup(
    images: ImageUrlInfo[],
    descriptions: Map<string, ImageDescription>
  ): ProcessingGroup {
    if (images.length === 1) {
      const image = images[0];
      const description = descriptions.get(image.path)!;
      return {
        masterImageId: image.path,
        description,
        targetDimensions: image.dimensions,
        variants: [{
          imageId: image.path,
          processingType: 'generate',
          targetDimensions: image.dimensions,
          description,
          priority: 1,
          estimatedCost: 1
        }],
        totalCost: 1
      };
    }

    // Trova l'immagine "master" (la più grande o con maggiore confidence)
    const masterImage = this.selectMasterImage(images, descriptions);
    const masterDescription = descriptions.get(masterImage.path)!;

    // Crea piani per le varianti
    const variants: ProcessingPlan[] = [];
    let totalCost = 1; // Costo per generare l'immagine master

    // Piano per l'immagine master
    variants.push({
      imageId: masterImage.path,
      processingType: 'generate',
      targetDimensions: masterImage.dimensions,
      description: masterDescription,
      priority: 1,
      estimatedCost: 1
    });

    // Piani per le varianti
    images.forEach(image => {
      if (image.path === masterImage.path) return;

      const plan = this.createVariantPlan(image, masterImage, descriptions);
      variants.push(plan);
      totalCost += plan.estimatedCost;
    });

    return {
      masterImageId: masterImage.path,
      description: masterDescription,
      targetDimensions: masterImage.dimensions,
      variants,
      totalCost
    };
  }

  /**
   * Seleziona l'immagine master da un gruppo
   */
  private static selectMasterImage(
    images: ImageUrlInfo[],
    descriptions: Map<string, ImageDescription>
  ): ImageUrlInfo {
    return images.reduce((best, current) => {
      const bestDesc = descriptions.get(best.path);
      const currentDesc = descriptions.get(current.path);

      // Priorità: confidence maggiore, poi dimensioni maggiori
      const bestScore = (bestDesc?.confidence || 0) * 100 + 
                       (best.dimensions.width * best.dimensions.height) / 10000;
      const currentScore = (currentDesc?.confidence || 0) * 100 + 
                          (current.dimensions.width * current.dimensions.height) / 10000;

      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Crea piano per una variante basata sull'immagine master
   */
  private static createVariantPlan(
    targetImage: ImageUrlInfo,
    masterImage: ImageUrlInfo,
    descriptions: Map<string, ImageDescription>
  ): ProcessingPlan {
    const targetDesc = descriptions.get(targetImage.path)!;
    const masterDims = masterImage.dimensions;
    const targetDims = targetImage.dimensions;

    // Calcola rapporti
    const widthRatio = targetDims.width / masterDims.width;
    const heightRatio = targetDims.height / masterDims.height;
    const aspectRatioMatch = Math.abs(widthRatio - heightRatio) < 0.1;

    // Determina tipo di elaborazione
    let processingType: ProcessingPlan['processingType'] = 'generate';
    let cropRegion: ProcessingPlan['cropRegion'];
    let estimatedCost = 1;

    // Se le dimensioni sono identiche, riusa direttamente
    if (targetDims.width === masterDims.width && targetDims.height === masterDims.height) {
      processingType = 'reuse';
      estimatedCost = 0.1;
    }
    // Se il rapporto dimensionale è ok, ridimensiona
    else if (aspectRatioMatch && 
             widthRatio >= this.MIN_RESIZE_RATIO && 
             widthRatio <= this.MAX_RESIZE_RATIO) {
      processingType = 'resize';
      estimatedCost = 0.2;
    }
    // Se può essere ritagliata efficacemente
    else if (this.canCropEfficiently(masterDims, targetDims)) {
      processingType = 'crop';
      cropRegion = this.calculateOptimalCrop(masterDims, targetDims);
      estimatedCost = 0.3;
    }
    // Altrimenti genera nuova immagine
    else {
      processingType = 'generate';
      estimatedCost = 1;
    }

    return {
      imageId: targetImage.path,
      processingType,
      sourceImageId: processingType !== 'generate' ? masterImage.path : undefined,
      targetDimensions: targetDims,
      cropRegion,
      description: targetDesc,
      priority: this.calculatePriority(targetImage, targetDesc),
      estimatedCost
    };
  }

  /**
   * Verifica se un'immagine può essere ritagliata efficacemente
   */
  private static canCropEfficiently(
    sourceDims: { width: number; height: number },
    targetDims: { width: number; height: number }
  ): boolean {
    const sourceArea = sourceDims.width * sourceDims.height;
    const targetArea = targetDims.width * targetDims.height;
    const efficiency = targetArea / sourceArea;

    return targetDims.width <= sourceDims.width &&
           targetDims.height <= sourceDims.height &&
           efficiency >= this.CROP_EFFICIENCY_THRESHOLD;
  }

  /**
   * Calcola ritaglio ottimale
   */
  private static calculateOptimalCrop(
    sourceDims: { width: number; height: number },
    targetDims: { width: number; height: number }
  ): { x: number; y: number; width: number; height: number } {
    // Centro il ritaglio
    const x = Math.max(0, (sourceDims.width - targetDims.width) / 2);
    const y = Math.max(0, (sourceDims.height - targetDims.height) / 2);

    return {
      x: Math.floor(x),
      y: Math.floor(y),
      width: targetDims.width,
      height: targetDims.height
    };
  }

  /**
   * Calcola priorità di elaborazione
   */
  private static calculatePriority(
    image: ImageUrlInfo,
    description: ImageDescription
  ): number {
    let priority = description.confidence * 10;

    // Aumenta priorità per immagini importanti
    const fieldName = image.fieldName.toLowerCase();
    if (fieldName.includes('banner') || fieldName.includes('hero')) {
      priority += 5;
    } else if (fieldName.includes('thumb')) {
      priority -= 2;
    }

    // Dimensioni maggiori = priorità maggiore
    const area = image.dimensions.width * image.dimensions.height;
    priority += Math.log10(area / 10000);

    return Math.max(1, Math.min(10, Math.round(priority)));
  }

  /**
   * Calcola risultato di ottimizzazione
   */
  private static calculateOptimizationResult(groups: ProcessingGroup[]): OptimizationResult {
    let totalImages = 0;
    let generatedImages = 0;
    let resizedImages = 0;
    let croppedImages = 0;
    let reusedImages = 0;
    let totalCostWithoutOptimization = 0;
    let totalCostWithOptimization = 0;

    groups.forEach(group => {
      totalImages += group.variants.length;
      totalCostWithoutOptimization += group.variants.length; // Senza ottimizzazione, ogni immagine costa 1
      totalCostWithOptimization += group.totalCost;

      group.variants.forEach(variant => {
        switch (variant.processingType) {
          case 'generate':
            generatedImages++;
            break;
          case 'resize':
            resizedImages++;
            break;
          case 'crop':
            croppedImages++;
            break;
          case 'reuse':
            reusedImages++;
            break;
        }
      });
    });

    const estimatedSavings = ((totalCostWithoutOptimization - totalCostWithOptimization) / 
                             totalCostWithoutOptimization) * 100;

    return {
      groups,
      totalImages,
      generatedImages,
      resizedImages,
      croppedImages,
      reusedImages,
      estimatedSavings
    };
  }

  /**
   * Ordina gruppi per priorità di elaborazione
   */
  static sortGroupsByPriority(groups: ProcessingGroup[]): ProcessingGroup[] {
    return groups.sort((a, b) => {
      const avgPriorityA = a.variants.reduce((sum, v) => sum + v.priority, 0) / a.variants.length;
      const avgPriorityB = b.variants.reduce((sum, v) => sum + v.priority, 0) / b.variants.length;
      return avgPriorityB - avgPriorityA;
    });
  }

  /**
   * Filtra piani per tipo di elaborazione
   */
  static filterPlansByType(
    groups: ProcessingGroup[],
    type: ProcessingPlan['processingType']
  ): ProcessingPlan[] {
    return groups.flatMap(group => 
      group.variants.filter(variant => variant.processingType === type)
    );
  }

  /**
   * Statistiche di ottimizzazione
   */
  static getOptimizationStats(result: OptimizationResult): {
    summary: string;
    breakdown: Record<string, number>;
    efficiencyScore: number;
  } {
    const breakdown = {
      'Immagini totali': result.totalImages,
      'Nuove generazioni': result.generatedImages,
      'Ridimensionamenti': result.resizedImages,
      'Ritagli': result.croppedImages,
      'Riutilizzi': result.reusedImages
    };

    const efficiencyScore = Math.round(
      ((result.resizedImages + result.croppedImages + result.reusedImages) / result.totalImages) * 100
    );

    const summary = `Ottimizzazione: ${Math.round(result.estimatedSavings)}% risparmio, ` +
                   `${result.generatedImages}/${result.totalImages} generazioni necessarie`;

    return {
      summary,
      breakdown,
      efficiencyScore
    };
  }
}