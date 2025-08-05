# OpenRouter Mock Generator

AI-powered mock data generator using OpenRouter API with JSON mode support. Generate realistic mock data from existing JSON examples using state-of-the-art language models.

## Features

- 🤖 **AI-Powered Generation**: Uses OpenRouter API with JSON mode for reliable output
- 📊 **Smart Pattern Analysis**: Automatically detects and analyzes JSON structures
- ⚡ **Dynamic Batch Processing**: Optimizes generation based on data complexity
- 🎨 **Custom Preferences**: Guide generation with custom instructions
- 🖼️ **Smart Image Generation**: Automatic Picsum Photos integration with intelligent dimensions
- 🌍 **Italian Locale Support**: Default Italian names, addresses, and formatting
- 📈 **Multiple Model Support**: Works with OpenAI, Anthropic Claude, Google Gemini, and more

## Installation

```bash
npm install @bramato/openrouter-mock-generator
```

## CLI Usage

### Setup

First, configure your OpenRouter API key:

```bash
npx ai-init
```

### Generate Mock Data

```bash
# Basic usage
npx ai-generate-mock products.json --count 50

# With custom preferences
npx ai-generate-mock products.json --preferences "Generate only premium brand products with prices above €200" --count 25

# Specify output file and array path
npx ai-generate-mock data.json --output generated_data.json --array-path "products" --count 100

# Analyze file structure first
npx ai-generate-mock input.json --analyze
```

### CLI Options

- `-c, --count <number>`: Number of items to generate (default: 10)
- `-o, --output <file>`: Output file path (default: input_mock.json)
- `-p, --array-path <path>`: Specific array path to use (e.g. 'data.items')
- `--preferences, --pref <text>`: Custom preferences for data generation
- `-a, --analyze`: Analyze input file structure without generating
- `-h, --help`: Show help message

## Programmatic Usage

```typescript
import { MockGeneratorService } from '@bramato/openrouter-mock-generator';

const generator = new MockGeneratorService();

const result = await generator.generateMockData({
  inputFile: 'products.json',
  outputFile: 'generated_products.json',
  count: 50,
  preferences: 'Generate Italian fashion brands with prices in euros'
});

if (result.success) {
  console.log(`Generated ${result.generatedCount} items`);
} else {
  console.error(`Error: ${result.error}`);
}
```

## Environment Variables

- `OPENROUTER_API_KEY`: Your OpenRouter API key (required)
- `OPENROUTER_DEFAULT_MODEL`: Default model to use
- `OPENROUTER_MOCK_GENERATOR_MODEL`: Specific model for mock generation

## Supported Models

The package automatically filters and uses only JSON-mode compatible models:

- **OpenAI**: GPT-4.1 Nano, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Google**: Gemini Pro, Gemini Flash
- **And many more via OpenRouter**

## Custom Preferences Examples

```bash
# E-commerce products
--preferences "Generate luxury Italian fashion items with designer brands"

# Restaurant menu
--preferences "Create traditional Italian dishes with regional specialties"

# User data  
--preferences "Generate users from major Italian cities with realistic demographics"

# Events
--preferences "Create cultural events and festivals typical of Italian regions"
```

## Smart Features

### Dynamic Batch Sizing
The generator analyzes data complexity and automatically adjusts batch sizes:
- Simple items: Up to 10 per batch
- Complex nested structures: 1-3 per batch
- Prevents API timeouts and ensures quality

### Intelligent Image Generation
Automatically generates appropriate Picsum Photos URLs:
- Square images: `https://picsum.photos/400/400`
- Banners: `https://picsum.photos/1200/300`
- Thumbnails: `https://picsum.photos/200/200`
- Consistent seeds based on item names

### Italian Locale Support
- Realistic Italian names and surnames
- Italian addresses and cities
- Euro currency formatting
- Italian business names and contexts

## License

MIT

## Author

bramato