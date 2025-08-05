// Main services for programmatic usage
export { MockGeneratorService } from './services/mock-generator';
export { OpenRouterService } from './services/openrouter';
export { OpenRouterAPI } from './services/openrouter-api';

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