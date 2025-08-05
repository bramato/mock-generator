/**
 * Microservizio per generare descrizioni contestuali per immagini AI
 */

import { ImageUrlInfo } from './image-url-extractor';

export interface ImageDescription {
  prompt: string;
  style: string;
  category: string;
  confidence: number;
  baseContext: string;
  enhancedPrompt: string;
}

export interface DescriptionOptions {
  language?: 'italian' | 'english';
  style?: 'realistic' | 'artistic' | 'professional' | 'casual';
  includeBackground?: boolean;
  maxPromptLength?: number;
}

export class DescriptionGenerator {
  private static readonly FIELD_TYPE_MAPPING = {
    // E-commerce
    'product': 'professional product photography',
    'item': 'clean product shot',
    'article': 'item showcase',
    'goods': 'commercial product',
    
    // People
    'avatar': 'professional headshot portrait',
    'profile': 'portrait photography',
    'user': 'person portrait',
    'author': 'professional author photo',
    'customer': 'friendly customer portrait',
    
    // Branding
    'logo': 'modern logo design',
    'brand': 'brand identity',
    'company': 'corporate branding',
    
    // Content
    'banner': 'professional banner design',
    'header': 'website header image',
    'background': 'clean background texture',
    'hero': 'hero section image',
    'thumbnail': 'preview image',
    'cover': 'cover image design',
    'featured': 'featured content image',
    
    // Location
    'location': 'beautiful location photography',
    'place': 'scenic place photograph',
    'destination': 'travel destination',
    'venue': 'venue photography',
    'shop': 'retail store interior',
    'restaurant': 'restaurant ambiance',
    'hotel': 'luxury hotel interior',
    
    // Categories specifiche
    'food': 'appetizing food photography',
    'dish': 'gourmet dish presentation',
    'recipe': 'food styling photography',
    'menu': 'restaurant menu photography',
    'fashion': 'fashion photography',
    'clothing': 'clothing product shot',
    'accessory': 'fashion accessory',
    'tech': 'modern technology product',
    'gadget': 'tech gadget photography',
    'sport': 'sports equipment',
    'fitness': 'fitness and wellness',
    'beauty': 'beauty product photography',
    'home': 'home interior design',
    'garden': 'garden and landscape',
    'car': 'automotive photography',
    'book': 'book cover design',
    'art': 'artistic photography',
    'music': 'music related imagery'
  };

  private static readonly ITALIAN_STYLE_ADDITIONS = {
    'italian_context': [
      'in Italian style',
      'with Italian elegance',
      'Italian design aesthetic',
      'Mediterranean style',
      'classic Italian'
    ],
    'food': [
      'authentic Italian cuisine',
      'traditional Italian dish',
      'Italian culinary tradition',
      'regional Italian specialty'
    ],
    'fashion': [
      'Italian fashion style',
      'Milano fashion design',
      'Italian elegance',
      'made in Italy style'
    ],
    'location': [
      'Italian landscape',
      'Italian architecture',
      'Italian piazza',
      'Mediterranean setting'
    ]
  };

  /**
   * Genera descrizione per una singola immagine
   */
  static generateDescription(
    imageInfo: ImageUrlInfo, 
    options: DescriptionOptions = {}
  ): ImageDescription {
    const opts = this.normalizeOptions(options);
    const context = this.analyzeContext(imageInfo);
    const category = this.determineCategory(imageInfo, context);
    const basePrompt = this.generateBasePrompt(imageInfo, context, category);
    const enhancedPrompt = this.enhancePrompt(basePrompt, context, opts);

    return {
      prompt: basePrompt,
      style: opts.style!,
      category,
      confidence: context.confidence,
      baseContext: context.description,
      enhancedPrompt
    };
  }

  /**
   * Genera descrizioni per più immagini ottimizzate per batch processing
   */
  static generateDescriptions(
    images: ImageUrlInfo[], 
    options: DescriptionOptions = {}
  ): Map<string, ImageDescription> {
    const descriptions = new Map<string, ImageDescription>();
    const opts = this.normalizeOptions(options);

    // Raggruppa per contesto simile per ottimizzazione
    const contextGroups = this.groupByContext(images);

    contextGroups.forEach((groupImages, contextKey) => {
      const sharedContext = this.extractSharedContext(groupImages);
      
      groupImages.forEach(img => {
        const description = this.generateDescription(img, {
          ...opts,
          // Usa contesto condiviso se disponibile
          ...(sharedContext && { baseContext: sharedContext })
        });
        
        descriptions.set(img.path, description);
      });
    });

    return descriptions;
  }

  /**
   * Analizza il contesto di un'immagine dai dati circostanti
   */
  private static analyzeContext(imageInfo: ImageUrlInfo): {
    description: string;
    confidence: number;
    keywords: string[];
    dataType: string;
  } {
    const context = imageInfo.context;
    const fieldName = imageInfo.fieldName;
    const keywords: string[] = [];
    let description = '';
    let confidence = 0.5;

    // Analizza il nome del campo
    const fieldAnalysis = this.analyzeFieldName(fieldName);
    keywords.push(...fieldAnalysis.keywords);
    confidence += fieldAnalysis.confidence;

    // Analizza il contesto dei dati
    if (context && typeof context === 'object') {
      const contextAnalysis = this.analyzeContextData(context);
      description = contextAnalysis.description;
      keywords.push(...contextAnalysis.keywords);
      confidence += contextAnalysis.confidence;
    }

    // Normalizza confidence
    confidence = Math.min(confidence, 1.0);

    return {
      description: description || this.getGenericDescription(fieldName),
      confidence,
      keywords: [...new Set(keywords)], // Remove duplicates
      dataType: this.inferDataType(context)
    };
  }

  /**
   * Analizza il nome del campo per estrarre informazioni
   */
  private static analyzeFieldName(fieldName: string): {
    keywords: string[];
    confidence: number;
  } {
    const name = fieldName.toLowerCase();
    const keywords: string[] = [];
    let confidence = 0.1;

    // Cerca corrispondenze dirette
    Object.entries(this.FIELD_TYPE_MAPPING).forEach(([key, value]) => {
      if (name.includes(key)) {
        keywords.push(key);
        confidence += 0.2;
      }
    });

    // Analizza pattern comuni
    if (name.includes('thumb')) {
      keywords.push('thumbnail', 'small');
      confidence += 0.3;
    }
    if (name.includes('_1x1') || name.includes('square')) {
      keywords.push('square', 'centered');
      confidence += 0.2;
    }
    if (name.includes('banner') || name.includes('header')) {
      keywords.push('banner', 'wide', 'header');
      confidence += 0.3;
    }

    return { keywords, confidence };
  }

  /**
   * Analizza i dati del contesto per estrarre informazioni semantiche
   */
  private static analyzeContextData(context: any): {
    description: string;
    keywords: string[];
    confidence: number;
  } {
    const keywords: string[] = [];
    let description = '';
    let confidence = 0.2;

    // Cerca campi descrittivi comuni
    const descriptiveFields = [
      'name', 'title', 'description', 'caption', 'alt',
      'product', 'brand', 'category', 'type', 'style',
      'location', 'city', 'address', 'venue', 'place'
    ];

    descriptiveFields.forEach(field => {
      if (context[field] && typeof context[field] === 'string') {
        const value = context[field].toLowerCase();
        description += ` ${value}`;
        keywords.push(...this.extractKeywords(value));
        confidence += 0.1;
      }
    });

    // Analizza pattern specifici
    if (context.price || context.cost || context.amount) {
      keywords.push('commercial', 'product');
      confidence += 0.1;
    }

    if (context.author || context.creator || context.artist) {
      keywords.push('creative', 'professional');
      confidence += 0.1;
    }

    return {
      description: description.trim(),
      keywords: [...new Set(keywords)],
      confidence: Math.min(confidence, 0.5)
    };
  }

  /**
   * Estrae parole chiave da una stringa
   */
  private static extractKeywords(text: string): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'il', 'la', 'le', 'lo', 'gli', 'un', 'una', 'e', 'o', 'ma', 'in', 'su', 'a', 'per', 'di', 'con', 'da'
    ]);

    return text
      .split(/[\s,.-]+/)
      .filter(word => word.length > 2 && !commonWords.has(word.toLowerCase()))
      .slice(0, 5); // Limita a 5 keywords
  }

  /**
   * Determina la categoria principale dell'immagine
   */
  private static determineCategory(imageInfo: ImageUrlInfo, context: any): string {
    const fieldName = imageInfo.fieldName.toLowerCase();
    
    // Categorie basate sul nome del campo
    for (const [key, value] of Object.entries(this.FIELD_TYPE_MAPPING)) {
      if (fieldName.includes(key)) {
        return key;
      }
    }

    // Categorie basate sul contesto
    if (context.keywords.includes('food') || context.keywords.includes('dish')) {
      return 'food';
    }
    if (context.keywords.includes('fashion') || context.keywords.includes('clothing')) {
      return 'fashion';
    }
    if (context.keywords.includes('location') || context.keywords.includes('place')) {
      return 'location';
    }

    return 'generic';
  }

  /**
   * Genera il prompt base per l'immagine
   */
  private static generateBasePrompt(
    imageInfo: ImageUrlInfo, 
    context: any, 
    category: string
  ): string {
    const fieldType = (this.FIELD_TYPE_MAPPING as any)[category] || 'professional photography';
    let prompt = fieldType;

    // Aggiungi descrizione contestuale se disponibile
    if (context.description && context.confidence > 0.3) {
      const cleanDescription = context.description
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanDescription.length > 0) {
        prompt = `${cleanDescription}, ${fieldType}`;
      }
    }

    // Aggiungi specifiche per dimensioni
    const { width, height } = imageInfo.dimensions;
    if (width === height) {
      prompt += ', square composition, centered';
    } else if (width > height * 2) {
      prompt += ', wide banner format, horizontal composition';
    } else if (height > width) {
      prompt += ', vertical composition, portrait orientation';
    }

    return prompt;
  }

  /**
   * Migliora il prompt con stile e preferenze
   */
  private static enhancePrompt(
    basePrompt: string, 
    context: any, 
    options: DescriptionOptions
  ): string {
    let enhanced = basePrompt;

    // Aggiungi stile
    switch (options.style) {
      case 'professional':
        enhanced += ', professional lighting, high quality, clean background';
        break;
      case 'artistic':
        enhanced += ', artistic composition, creative lighting, aesthetic';
        break;
      case 'realistic':
        enhanced += ', photorealistic, natural lighting, detailed';
        break;
      case 'casual':
        enhanced += ', casual style, natural look, everyday setting';
        break;
    }

    // Aggiungi contesto italiano se richiesto
    if (options.language === 'italian' && context.keywords.length > 0) {
      const italianContext = this.getItalianContext(context.keywords);
      if (italianContext) {
        enhanced += `, ${italianContext}`;
      }
    }

    // Limita lunghezza se specificato
    if (options.maxPromptLength && enhanced.length > options.maxPromptLength) {
      enhanced = enhanced.substring(0, options.maxPromptLength - 3) + '...';
    }

    return enhanced;
  }

  /**
   * Ottiene contesto italiano appropriato
   */
  private static getItalianContext(keywords: string[]): string | null {
    for (const [category, contexts] of Object.entries(this.ITALIAN_STYLE_ADDITIONS)) {
      if (keywords.some(keyword => category.includes(keyword))) {
        return contexts[Math.floor(Math.random() * contexts.length)];
      }
    }
    return this.ITALIAN_STYLE_ADDITIONS.italian_context[0];
  }

  /**
   * Raggruppa immagini per contesto simile
   */
  private static groupByContext(images: ImageUrlInfo[]): Map<string, ImageUrlInfo[]> {
    const groups = new Map<string, ImageUrlInfo[]>();

    images.forEach(img => {
      const contextKey = this.generateContextKey(img);
      if (!groups.has(contextKey)) {
        groups.set(contextKey, []);
      }
      groups.get(contextKey)!.push(img);
    });

    return groups;
  }

  /**
   * Genera chiave di contesto per raggruppamento
   */
  private static generateContextKey(imageInfo: ImageUrlInfo): string {
    const context = imageInfo.context;
    const parts: string[] = [];

    // Usa campi identificativi comuni
    if (context?.category) parts.push(context.category);
    if (context?.type) parts.push(context.type);
    if (context?.brand) parts.push(context.brand);
    
    // Aggiungi dimensioni per raggruppare formati simili
    const { width, height } = imageInfo.dimensions;
    parts.push(`${width}x${height}`);

    return parts.join('_') || 'generic';
  }

  /**
   * Estrae contesto condiviso da un gruppo di immagini
   */
  private static extractSharedContext(images: ImageUrlInfo[]): string | null {
    if (images.length < 2) return null;

    const commonFields = ['category', 'brand', 'type', 'location'];
    const sharedValues: string[] = [];

    commonFields.forEach(field => {
      const values = images
        .map(img => img.context?.[field])
        .filter(val => val && typeof val === 'string');
      
      if (values.length === images.length && new Set(values).size === 1) {
        sharedValues.push(values[0]);
      }
    });

    return sharedValues.length > 0 ? sharedValues.join(' ') : null;
  }

  /**
   * Normalizza le opzioni con valori di default
   */
  private static normalizeOptions(options: DescriptionOptions): Required<DescriptionOptions> {
    return {
      language: options.language || 'italian',
      style: options.style || 'professional',
      includeBackground: options.includeBackground ?? true,
      maxPromptLength: options.maxPromptLength || 200
    };
  }

  /**
   * Inferisce il tipo di dati dal contesto
   */
  private static inferDataType(context: any): string {
    if (!context || typeof context !== 'object') return 'unknown';

    const fields = Object.keys(context);
    
    if (fields.includes('price') && fields.includes('name')) return 'product';
    if (fields.includes('author') || fields.includes('creator')) return 'content';
    if (fields.includes('address') || fields.includes('location')) return 'place';
    if (fields.includes('email') || fields.includes('phone')) return 'person';
    
    return 'generic';
  }

  /**
   * Ottiene descrizione generica basata sul nome del campo
   */
  private static getGenericDescription(fieldName: string): string {
    const name = fieldName.toLowerCase();
    
    if (name.includes('thumb')) return 'thumbnail image';
    if (name.includes('banner')) return 'banner image';
    if (name.includes('avatar')) return 'profile picture';
    if (name.includes('logo')) return 'logo design';
    if (name.includes('background')) return 'background image';
    
    return 'professional image';
  }
}