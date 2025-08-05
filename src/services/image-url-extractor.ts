/**
 * Microservizio per estrarre URLs di immagini Picsum dai dati JSON
 */

export interface ImageUrlInfo {
  url: string;
  path: string;
  fieldName: string;
  context: any;
  dimensions: {
    width: number;
    height: number;
  };
  seed?: string;
  itemIndex?: number;
}

export interface ExtractionResult {
  images: ImageUrlInfo[];
  totalFound: number;
  uniqueUrls: number;
  duplicateGroups: Map<string, ImageUrlInfo[]>;
}

export class ImageUrlExtractor {
  private static readonly PICSUM_PATTERNS = [
    /https?:\/\/picsum\.photos\/(\d+)\/(\d+)(?:\?.*)?/gi,
    /https?:\/\/picsum\.photos\/(\d+)(?:\?.*)?/gi,
    /https?:\/\/picsum\.photos\/seed\/([^\/]+)\/(\d+)\/(\d+)(?:\?.*)?/gi,
    /https?:\/\/picsum\.photos\/v2\/list(?:\?.*)?/gi
  ];

  /**
   * Estrae tutti gli URL Picsum da un oggetto JSON
   */
  static extractPicsumUrls(data: any): ExtractionResult {
    const images: ImageUrlInfo[] = [];
    const uniqueUrls = new Set<string>();
    const duplicateGroups = new Map<string, ImageUrlInfo[]>();

    this.traverseObject(data, '', images, 0);

    // Raggruppa per URL duplicati (stesse dimensioni/seed)
    images.forEach(img => {
      const normalizedUrl = this.normalizeUrl(img.url);
      if (!duplicateGroups.has(normalizedUrl)) {
        duplicateGroups.set(normalizedUrl, []);
      }
      duplicateGroups.get(normalizedUrl)!.push(img);
      uniqueUrls.add(normalizedUrl);
    });

    return {
      images,
      totalFound: images.length,
      uniqueUrls: uniqueUrls.size,
      duplicateGroups
    };
  }

  /**
   * Attraversa ricorsivamente un oggetto JSON per trovare URL Picsum
   */
  private static traverseObject(
    obj: any, 
    currentPath: string, 
    results: ImageUrlInfo[], 
    itemIndex: number
  ): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const newPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`;
        this.traverseObject(item, newPath, results, index);
      });
    } else {
      Object.entries(obj).forEach(([key, value]) => {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        
        if (typeof value === 'string' && this.isPicsumUrl(value)) {
          const imageInfo = this.parseImageUrl(value, newPath, key, obj, itemIndex);
          if (imageInfo) {
            results.push(imageInfo);
          }
        } else if (typeof value === 'object') {
          this.traverseObject(value, newPath, results, itemIndex);
        }
      });
    }
  }

  /**
   * Verifica se una stringa è un URL Picsum
   */
  private static isPicsumUrl(url: string): boolean {
    return this.PICSUM_PATTERNS.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state
      return pattern.test(url);
    });
  }

  /**
   * Parsea un URL Picsum ed estrae le informazioni
   */
  private static parseImageUrl(
    url: string, 
    path: string, 
    fieldName: string, 
    context: any, 
    itemIndex: number
  ): ImageUrlInfo | null {
    const dimensions = this.extractDimensions(url);
    const seed = this.extractSeed(url);

    if (!dimensions) return null;

    return {
      url,
      path,
      fieldName,
      context,
      dimensions,
      seed,
      itemIndex
    };
  }

  /**
   * Estrae le dimensioni da un URL Picsum
   */
  private static extractDimensions(url: string): { width: number; height: number } | null {
    // Pattern con larghezza e altezza: https://picsum.photos/800/600
    let match = url.match(/picsum\.photos\/(\d+)\/(\d+)/);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2])
      };
    }

    // Pattern con seed: https://picsum.photos/seed/milano/800/600
    match = url.match(/picsum\.photos\/seed\/[^\/]+\/(\d+)\/(\d+)/);
    if (match) {
      return {
        width: parseInt(match[1]),
        height: parseInt(match[2])
      };
    }

    // Pattern solo larghezza (quadrata): https://picsum.photos/400
    match = url.match(/picsum\.photos\/(\d+)(?:\?|$)/);
    if (match) {
      const size = parseInt(match[1]);
      return {
        width: size,
        height: size
      };
    }

    return null;
  }

  /**
   * Estrae il seed da un URL Picsum
   */
  private static extractSeed(url: string): string | undefined {
    const match = url.match(/picsum\.photos\/seed\/([^\/\?]+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Normalizza un URL per il confronto
   */
  private static normalizeUrl(url: string): string {
    return url.replace(/\?.*$/, '').toLowerCase();
  }

  /**
   * Raggruppa immagini per dimensioni simili
   */
  static groupBySimilarDimensions(images: ImageUrlInfo[]): Map<string, ImageUrlInfo[]> {
    const groups = new Map<string, ImageUrlInfo[]>();

    images.forEach(img => {
      const key = `${img.dimensions.width}x${img.dimensions.height}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(img);
    });

    return groups;
  }

  /**
   * Filtra immagini per tipo di campo
   */
  static filterByFieldType(images: ImageUrlInfo[]): {
    thumbnails: ImageUrlInfo[];
    banners: ImageUrlInfo[];
    squares: ImageUrlInfo[];
    portraits: ImageUrlInfo[];
    landscapes: ImageUrlInfo[];
    generic: ImageUrlInfo[];
  } {
    const result = {
      thumbnails: [] as ImageUrlInfo[],
      banners: [] as ImageUrlInfo[],
      squares: [] as ImageUrlInfo[],
      portraits: [] as ImageUrlInfo[],
      landscapes: [] as ImageUrlInfo[],
      generic: [] as ImageUrlInfo[]
    };

    images.forEach(img => {
      const fieldName = img.fieldName.toLowerCase();
      const { width, height } = img.dimensions;
      const ratio = width / height;

      if (fieldName.includes('thumb')) {
        result.thumbnails.push(img);
      } else if (fieldName.includes('banner') || fieldName.includes('header')) {
        result.banners.push(img);
      } else if (ratio === 1) {
        result.squares.push(img);
      } else if (ratio < 1) {
        result.portraits.push(img);
      } else if (ratio > 2) {
        result.banners.push(img);
      } else if (ratio > 1) {
        result.landscapes.push(img);
      } else {
        result.generic.push(img);
      }
    });

    return result;
  }

  /**
   * Statistiche di estrazione
   */
  static getExtractionStats(result: ExtractionResult): {
    summary: string;
    dimensionDistribution: Map<string, number>;
    fieldTypeDistribution: Map<string, number>;
    duplicateCount: number;
  } {
    const dimensionDistribution = new Map<string, number>();
    const fieldTypeDistribution = new Map<string, number>();
    let duplicateCount = 0;

    result.images.forEach(img => {
      const dimKey = `${img.dimensions.width}x${img.dimensions.height}`;
      dimensionDistribution.set(dimKey, (dimensionDistribution.get(dimKey) || 0) + 1);

      const fieldType = this.getFieldType(img.fieldName);
      fieldTypeDistribution.set(fieldType, (fieldTypeDistribution.get(fieldType) || 0) + 1);
    });

    result.duplicateGroups.forEach(group => {
      if (group.length > 1) {
        duplicateCount += group.length - 1;
      }
    });

    const summary = `Trovate ${result.totalFound} immagini Picsum, ${result.uniqueUrls} uniche, ${duplicateCount} duplicate`;

    return {
      summary,
      dimensionDistribution,
      fieldTypeDistribution,
      duplicateCount
    };
  }

  private static getFieldType(fieldName: string): string {
    const name = fieldName.toLowerCase();
    if (name.includes('thumb')) return 'thumbnail';
    if (name.includes('banner') || name.includes('header')) return 'banner';
    if (name.includes('avatar') || name.includes('profile')) return 'avatar';
    if (name.includes('logo')) return 'logo';
    if (name.includes('background') || name.includes('bg')) return 'background';
    if (name.includes('gallery') || name.includes('photo')) return 'gallery';
    return 'generic';
  }
}