// Main services for programmatic usage
export { MockGeneratorService } from './services/mock-generator';
export { OpenRouterService } from './services/openrouter';
export { OpenRouterAPI } from './services/openrouter-api';
export { ImageGenerator } from './services/image-generator';
export { AWSS3Storage } from './services/aws-s3-storage';
export { DigitalOceanSpaces } from './services/digitalocean-spaces';
export { ImageMockGenerator } from './services/image-mock-generator';

// Utilities
export { PatternAnalyzer } from './utils/pattern-analyzer';

// Types
export type {
  OpenRouterConfig,
  MockGenerationRequest,
  MockGenerationResult,
  ArrayPatternAnalysis
} from './types/index';

export type {
  OpenRouterModel,
  ModelCategory
} from './services/openrouter-api';

// Default export for convenience
export { MockGeneratorService as default } from './services/mock-generator';