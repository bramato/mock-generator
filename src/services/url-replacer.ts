/**
 * Microservizio per sostituire URLs nei dati JSON
 */

import { ImageUrlInfo } from './image-url-extractor';

export interface UrlMapping {
  originalUrl: string;
  newUrl: string;
  cdnUrl?: string;
  path: string;
  fieldName: string;
  itemIndex?: number;
  replacementType: 'direct' | 'variant' | 'fallback';
}

export interface ReplacementResult {
  success: boolean;
  replacedCount: number;
  failedCount: number;
  mappings: UrlMapping[];
  modifiedData: any;
  errors: string[];
}

export interface ReplacementOptions {
  preferCdnUrls?: boolean;
  preserveOriginalOnFailure?: boolean;
  validateUrls?: boolean;
  backupOriginal?: boolean;
  logReplacements?: boolean;
}

export class UrlReplacer {
  private static readonly URL_VALIDATION_TIMEOUT = 5000;

  /**
   * Sostituisce URLs Picsum con nuovi URLs nei dati JSON
   */
  static async replaceUrls(
    data: any,
    urlMappings: Map<string, string>,
    cdnMappings?: Map<string, string>,
    options: ReplacementOptions = {}
  ): Promise<ReplacementResult> {
    const opts = this.normalizeOptions(options);
    const result: ReplacementResult = {
      success: false,
      replacedCount: 0,
      failedCount: 0,
      mappings: [],
      modifiedData: opts.backupOriginal ? this.deepClone(data) : data,
      errors: []
    };

    try {
      // Crea backup se richiesto
      const originalData = opts.backupOriginal ? this.deepClone(data) : null;

      // Esegui sostituzioni
      await this.performReplacements(
        result.modifiedData,
        '',
        urlMappings,
        cdnMappings,
        result,
        opts,
        0
      );

      // Valida URLs se richiesto
      if (opts.validateUrls) {
        await this.validateReplacementUrls(result);
      }

      result.success = result.failedCount === 0 || result.replacedCount > 0;

      // Log risultati se richiesto
      if (opts.logReplacements) {
        this.logReplacementResults(result);
      }

    } catch (error) {
      result.errors.push(`Replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Crea mappature URL da risultati di elaborazione immagini
   */
  static createUrlMappings(
    imageResults: Array<{
      originalUrl: string;
      newUrl: string;
      cdnUrl?: string;
      path: string;
      success: boolean;
    }>
  ): {
    urlMappings: Map<string, string>;
    cdnMappings: Map<string, string>;
    failedUrls: string[];
  } {
    const urlMappings = new Map<string, string>();
    const cdnMappings = new Map<string, string>();
    const failedUrls: string[] = [];

    imageResults.forEach(result => {
      if (result.success && result.newUrl) {
        urlMappings.set(result.originalUrl, result.newUrl);
        
        if (result.cdnUrl) {
          cdnMappings.set(result.originalUrl, result.cdnUrl);
        }
      } else {
        failedUrls.push(result.originalUrl);
      }
    });

    return { urlMappings, cdnMappings, failedUrls };
  }

  /**
   * Esegue le sostituzioni ricorsivamente
   */
  private static async performReplacements(
    obj: any,
    currentPath: string,
    urlMappings: Map<string, string>,
    cdnMappings: Map<string, string> | undefined,
    result: ReplacementResult,
    options: Required<ReplacementOptions>,
    itemIndex: number
  ): Promise<void> {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const newPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        await this.performReplacements(
          obj[i],
          newPath,
          urlMappings,
          cdnMappings,
          result,
          options,
          i
        );
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;

        if (typeof value === 'string' && this.isPicsumUrl(value)) {
          await this.replaceUrl(
            obj,
            key,
            value,
            newPath,
            urlMappings,
            cdnMappings,
            result,
            options,
            itemIndex
          );
        } else if (typeof value === 'object' && value !== null) {
          await this.performReplacements(
            value,
            newPath,
            urlMappings,
            cdnMappings,
            result,
            options,
            itemIndex
          );
        }
      }
    }
  }

  /**
   * Sostituisce un singolo URL
   */
  private static async replaceUrl(
    obj: any,
    key: string,
    originalUrl: string,
    path: string,
    urlMappings: Map<string, string>,
    cdnMappings: Map<string, string> | undefined,
    result: ReplacementResult,
    options: Required<ReplacementOptions>,
    itemIndex: number
  ): Promise<void> {
    try {
      // Normalizza URL per la ricerca
      const normalizedUrl = this.normalizeUrl(originalUrl);
      
      // Cerca mappatura diretta
      let newUrl = urlMappings.get(originalUrl) || urlMappings.get(normalizedUrl);
      let replacementType: UrlMapping['replacementType'] = 'direct';

      // Se non trovata, cerca mappature variant (stesso seed/dimensioni)
      if (!newUrl) {
        newUrl = this.findVariantMapping(originalUrl, urlMappings);
        replacementType = 'variant';
      }

      // Se ancora non trovata e preserveOriginalOnFailure è false, usa fallback
      if (!newUrl && !options.preserveOriginalOnFailure) {
        newUrl = this.generateFallbackUrl(originalUrl);
        replacementType = 'fallback';
      }

      if (newUrl) {
        // Usa CDN URL se disponibile e preferito
        const finalUrl = (options.preferCdnUrls && cdnMappings?.has(originalUrl)) 
          ? cdnMappings.get(originalUrl)! 
          : newUrl;

        // Sostituisci URL
        obj[key] = finalUrl;

        // Registra mapping
        result.mappings.push({
          originalUrl,
          newUrl: finalUrl,
          cdnUrl: cdnMappings?.get(originalUrl),
          path,
          fieldName: key,
          itemIndex,
          replacementType
        });

        result.replacedCount++;

      } else {
        // Fallimento - mantieni originale se richiesto
        if (options.preserveOriginalOnFailure) {
          result.errors.push(`No replacement found for URL: ${originalUrl} at ${path}`);
        }
        result.failedCount++;
      }

    } catch (error) {
      result.errors.push(`Failed to replace URL ${originalUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.failedCount++;
    }
  }

  /**
   * Cerca mappatura per varianti (stesso contenuto, dimensioni diverse)
   */
  private static findVariantMapping(
    originalUrl: string,
    urlMappings: Map<string, string>
  ): string | undefined {
    const originalSeed = this.extractSeed(originalUrl);
    const originalDimensions = this.extractDimensions(originalUrl);

    if (!originalSeed && !originalDimensions) return undefined;

    // Cerca URLs con stesso seed o dimensioni simili
    for (const [mappedOriginal, mappedNew] of urlMappings.entries()) {
      const mappedSeed = this.extractSeed(mappedOriginal);
      const mappedDimensions = this.extractDimensions(mappedOriginal);

      // Stesso seed
      if (originalSeed && mappedSeed === originalSeed) {
        return mappedNew;
      }

      // Dimensioni identiche
      if (originalDimensions && mappedDimensions &&
          originalDimensions.width === mappedDimensions.width &&
          originalDimensions.height === mappedDimensions.height) {
        return mappedNew;
      }
    }

    return undefined;
  }

  /**
   * Genera URL di fallback per casi non mappati
   */
  private static generateFallbackUrl(originalUrl: string): string {
    // Per ora mantieni URL Picsum come fallback
    // In futuro potresti voler usare un'immagine placeholder
    return originalUrl;
  }

  /**
   * Valida URLs dopo la sostituzione
   */
  private static async validateReplacementUrls(result: ReplacementResult): Promise<void> {
    const validationPromises = result.mappings.map(async mapping => {
      try {
        const response = await fetch(mapping.newUrl, { 
          method: 'HEAD',
          signal: AbortSignal.timeout(this.URL_VALIDATION_TIMEOUT)
        });
        
        if (!response.ok) {
          result.errors.push(`URL validation failed for ${mapping.newUrl}: ${response.status}`);
        }
      } catch (error) {
        result.errors.push(`URL validation error for ${mapping.newUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    await Promise.allSettled(validationPromises);
  }

  /**
   * Verifica se una stringa è un URL Picsum
   */
  private static isPicsumUrl(url: string): boolean {
    return /https?:\/\/picsum\.photos/.test(url);
  }

  /**
   * Normalizza URL per il confronto
   */
  private static normalizeUrl(url: string): string {
    return url.replace(/\?.*$/, '').toLowerCase().replace(/\/$/, '');
  }

  /**
   * Estrae seed da URL Picsum
   */
  private static extractSeed(url: string): string | undefined {
    const match = url.match(/picsum\.photos\/seed\/([^\/\?]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Estrae dimensioni da URL Picsum
   */
  private static extractDimensions(url: string): { width: number; height: number } | undefined {
    // Pattern con larghezza e altezza
    let match = url.match(/picsum\.photos\/(?:seed\/[^\/]+\/)?(\d+)\/(\d+)/);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2])
      };
    }

    // Pattern solo larghezza (quadrata)
    match = url.match(/picsum\.photos\/(?:seed\/[^\/]+\/)?(\d+)(?:\?|$)/);
    if (match) {
      const size = parseInt(match[1]);
      return { width: size, height: size };
    }

    return undefined;
  }

  /**
   * Clona profondamente un oggetto
   */
  private static deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned: any = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone(obj[key]);
      });
      return cloned;
    }
    return obj;
  }

  /**
   * Normalizza opzioni con valori di default
   */
  private static normalizeOptions(options: ReplacementOptions): Required<ReplacementOptions> {
    return {
      preferCdnUrls: options.preferCdnUrls ?? true,
      preserveOriginalOnFailure: options.preserveOriginalOnFailure ?? false,
      validateUrls: options.validateUrls ?? false,
      backupOriginal: options.backupOriginal ?? true,
      logReplacements: options.logReplacements ?? true
    };
  }

  /**
   * Log dei risultati di sostituzione
   */
  private static logReplacementResults(result: ReplacementResult): void {
    console.log(`\n🔄 URL Replacement Results:`);
    console.log(`   ✅ Successfully replaced: ${result.replacedCount} URLs`);
    console.log(`   ❌ Failed to replace: ${result.failedCount} URLs`);
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors encountered:`);
      result.errors.slice(0, 5).forEach(error => {
        console.log(`      • ${error}`);
      });
      if (result.errors.length > 5) {
        console.log(`      • ... and ${result.errors.length - 5} more errors`);
      }
    }

    // Raggruppa per tipo di sostituzione
    const typeGroups = result.mappings.reduce((acc, mapping) => {
      acc[mapping.replacementType] = (acc[mapping.replacementType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(typeGroups).length > 0) {
      console.log(`   📊 Replacement types:`);
      Object.entries(typeGroups).forEach(([type, count]) => {
        console.log(`      • ${type}: ${count}`);
      });
    }
  }

  /**
   * Crea statistiche di sostituzione
   */
  static getReplacementStats(result: ReplacementResult): {
    summary: string;
    successRate: number;
    typeDistribution: Record<string, number>;
    avgUrlLength: number;
  } {
    const successRate = result.replacedCount / (result.replacedCount + result.failedCount) * 100;
    
    const typeDistribution = result.mappings.reduce((acc, mapping) => {
      acc[mapping.replacementType] = (acc[mapping.replacementType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgUrlLength = result.mappings.length > 0
      ? result.mappings.reduce((sum, m) => sum + m.newUrl.length, 0) / result.mappings.length
      : 0;

    const summary = `Sostituiti ${result.replacedCount}/${result.replacedCount + result.failedCount} URLs (${Math.round(successRate)}% successo)`;

    return {
      summary,
      successRate,
      typeDistribution,
      avgUrlLength: Math.round(avgUrlLength)
    };
  }

  /**
   * Rollback delle sostituzioni (usa backup)
   */
  static rollbackReplacements(originalData: any, result: ReplacementResult): any {
    if (!result.modifiedData) {
      throw new Error('No modified data available for rollback');
    }

    // Ripristina URLs originali
    result.mappings.forEach(mapping => {
      this.setValueAtPath(result.modifiedData, mapping.path, mapping.originalUrl);
    });

    return result.modifiedData;
  }

  /**
   * Imposta valore a un percorso specifico
   */
  private static setValueAtPath(obj: any, path: string, value: any): void {
    const parts = path.split(/[\.\[\]]/).filter(Boolean);
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const isArrayIndex = /^\d+$/.test(part);
      
      if (isArrayIndex) {
        current = current[parseInt(part)];
      } else {
        current = current[part];
      }
    }

    const lastPart = parts[parts.length - 1];
    const isArrayIndex = /^\d+$/.test(lastPart);
    
    if (isArrayIndex) {
      current[parseInt(lastPart)] = value;
    } else {
      current[lastPart] = value;
    }
  }
}