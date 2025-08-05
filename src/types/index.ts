export interface OpenRouterConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface MockGenerationRequest {
  inputFile: string;
  outputFile: string;
  count: number;
  arrayPath?: string;
  preferences?: string;
}

export interface MockGenerationResult {
  success: boolean;
  generatedCount: number;
  outputFile: string;
  error?: string;
}

export interface ArrayPatternAnalysis {
  isArray: boolean;
  sampleItem: any;
  arrayPath: string;
  itemCount: number;
}