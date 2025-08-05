#!/usr/bin/env node

import { MockGeneratorService } from '../services/mock-generator';
import { PatternAnalyzer } from '../utils/pattern-analyzer';
import { readFile } from 'fs/promises';

interface CliArgs {
  inputFile?: string;
  outputFile?: string;
  count?: number;
  arrayPath?: string;
  preferences?: string;
  analyze?: boolean;
  help?: boolean;
  enableImageProcessing?: boolean;
  disableImageProcessing?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--count':
      case '-c':
        parsed.count = parseInt(args[++i]) || 10;
        break;
      case '--array-path':
      case '-p':
        parsed.arrayPath = args[++i];
        break;
      case '--preferences':
      case '--pref':
        parsed.preferences = args[++i];
        break;
      case '--output':
      case '-o':
        parsed.outputFile = args[++i];
        break;
      case '--analyze':
      case '-a':
        parsed.analyze = true;
        break;
      case '--enable-images':
      case '--images':
        parsed.enableImageProcessing = true;
        break;
      case '--disable-images':
      case '--no-images':
        parsed.disableImageProcessing = true;
        break;
      default:
        if (!arg.startsWith('-') && !parsed.inputFile) {
          parsed.inputFile = arg;
        }
        break;
    }
  }
  
  return parsed;
}

function showHelp(): void {
  console.log(`
AI Mock Data Generator

Usage:
  ai-generate-mock <input.json> [options]

Options:
  -c, --count <number>      Number of items to generate (default: 10)
  -o, --output <file>       Output file path (default: input_mock.json)
  -p, --array-path <path>   Specific array path to use (e.g. 'data.items')
  --preferences, --pref <text>  Custom preferences for data generation
  --images, --enable-images Force enable AI image processing (replaces Picsum URLs)
  --no-images, --disable-images  Disable AI image processing (keep Picsum URLs)
  -a, --analyze             Analyze input file structure without generating
  -h, --help                Show this help message

Examples:
  ai-generate-mock products.json --count 50
  ai-generate-mock data.json --output generated_data.json --count 100
  ai-generate-mock users.json --array-path "users" --count 25
  ai-generate-mock products.json --preferences "Generate only premium brand products with prices above €200"
  ai-generate-mock products.json --images --count 20    # Force AI image generation
  ai-generate-mock products.json --no-images            # Disable AI images, keep Picsum
  ai-generate-mock input.json --analyze

Environment Variables:
  OPENROUTER_API_KEY        Your OpenRouter API key (required)
`);
}

async function analyzeFile(inputFile: string): Promise<void> {
  try {
    const content = await readFile(inputFile, 'utf8');
    const data = JSON.parse(content);
    const analyses = PatternAnalyzer.analyzeJsonStructure(data);
    
    console.log(`\\nFile: ${inputFile}`);
    console.log('='.repeat(50));
    console.log('🤖 Note: Mock generation uses JSON-mode compatible models only');
    
    if (analyses.length === 0) {
      console.log('No arrays found in the input file.');
      return;
    }
    
    console.log('Found arrays:');
    analyses.forEach((analysis, index) => {
      console.log(`\\n${index + 1}. Path: ${analysis.arrayPath}`);
      console.log(`   Items: ${analysis.itemCount}`);
      console.log(`   Sample structure:`);
      console.log(`   ${JSON.stringify(analysis.sampleItem, null, 2).split('\\n').map(line => '   ' + line).join('\\n')}`);
    });
    
    const largest = PatternAnalyzer.findLargestArray(analyses);
    if (largest) {
      console.log(`\\nLargest array: ${largest.arrayPath} (${largest.itemCount} items)`);
    }
  } catch (error) {
    console.error('Error analyzing file:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    showHelp();
    return;
  }
  
  if (!args.inputFile) {
    console.error('Error: Input file is required\\n');
    showHelp();
    process.exit(1);
  }
  
  if (args.analyze) {
    await analyzeFile(args.inputFile);
    return;
  }
  
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required');
    process.exit(1);
  }
  
  const outputFile = args.outputFile || args.inputFile.replace(/\\.json$/, '_mock.json');
  const count = args.count || 10;
  
  console.log(`Generating ${count} mock items from ${args.inputFile}...`);
  if (args.arrayPath) {
    console.log(`Using array path: ${args.arrayPath}`);
  }
  if (args.preferences) {
    console.log(`Custom preferences: ${args.preferences}`);
  }
  console.log(`Output: ${outputFile}\\n`);
  
  // Determina se abilitare il post-processing delle immagini
  let enableImageProcessing: boolean | undefined = undefined; // Default: auto-detect
  if (args.disableImageProcessing) {
    enableImageProcessing = false;
    console.log('🚫 AI image processing explicitly disabled');
  } else if (args.enableImageProcessing) {
    enableImageProcessing = true;
    console.log('🎨 AI image processing explicitly enabled');
  }

  const generator = new MockGeneratorService(undefined, enableImageProcessing);
  const result = await generator.generateMockData({
    inputFile: args.inputFile,
    outputFile,
    count,
    arrayPath: args.arrayPath,
    preferences: args.preferences,
    enableImageProcessing
  });
  
  if (result.success) {
    console.log(`\\n✅ Successfully generated ${result.generatedCount} items`);
    console.log(`📁 Output saved to: ${result.outputFile}`);
  } else {
    console.error(`\\n❌ Generation failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error: any) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});