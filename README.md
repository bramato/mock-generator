# OpenRouter AI Mock Generator

AI-powered mock data generator with advanced image processing capabilities. Generate realistic mock data from existing JSON examples using state-of-the-art language models, with optional AI-generated images.

## ✨ Features

- 🤖 **AI-Powered Generation**: Uses OpenRouter API with JSON mode for reliable output
- 📊 **Smart Pattern Analysis**: Automatically detects and analyzes JSON structures
- ⚡ **Dynamic Batch Processing**: Optimizes generation based on data complexity
- 🎨 **Custom Preferences**: Guide generation with custom instructions
- 🖼️ **AI Image Processing**: Replace placeholder images with contextual AI-generated images
- ☁️ **Cloud Storage Integration**: Upload images to AWS S3 or DigitalOcean Spaces
- 🧠 **Smart Optimization**: Intelligent duplication detection and image reuse (up to 30% savings)
- 🌍 **Italian Locale Support**: Default Italian names, addresses, and formatting
- 📈 **Multiple Model Support**: Works with OpenAI, Anthropic Claude, Google Gemini, and more

## Installation

```bash
npm install @bramato/openrouter-mock-generator
```

## 🚀 Quick Start

### 1. Setup Configuration

Run the interactive configuration wizard:

```bash
npx ai-init
```

This will guide you through:
- **OpenRouter API Key**: Required for text generation
- **Model Selection**: Choose the best models for your needs
- **AI Image Processing** (Optional): 
  - Hugging Face API key for AI image generation
  - Cloud storage (AWS S3 or DigitalOcean Spaces) for image hosting

### 2. Generate Mock Data

```bash
# Basic usage (uses placeholder images)
npx ai-generate-mock products.json --count 50

# With AI image processing (if configured)
npx ai-generate-mock products.json --images --count 20

# Force disable AI images
npx ai-generate-mock products.json --no-images --count 50
```

## 📋 CLI Usage

### Basic Commands

```bash
# Generate mock data with auto-detection
npx ai-generate-mock <input.json> --count <number>

# With custom preferences
npx ai-generate-mock products.json --preferences "Generate luxury Italian fashion items" --count 25

# Specify output file and array path
npx ai-generate-mock data.json --output generated_data.json --array-path "products" --count 100

# Analyze file structure first
npx ai-generate-mock input.json --analyze
```

### AI Image Processing

```bash
# Enable AI image processing (replaces Picsum URLs with AI-generated images)
npx ai-generate-mock products.json --images --count 50

# Disable AI image processing (keeps placeholder images)
npx ai-generate-mock products.json --no-images --count 50

# Auto-detection (enabled if configured, disabled otherwise)
npx ai-generate-mock products.json --count 50
```

### CLI Options

- `-c, --count <number>`: Number of items to generate (default: 10)
- `-o, --output <file>`: Output file path (default: input_mock.json)
- `-p, --array-path <path>`: Specific array path to use (e.g. 'data.items')
- `--preferences, --pref <text>`: Custom preferences for data generation
- `--images, --enable-images`: Force enable AI image processing
- `--no-images, --disable-images`: Force disable AI image processing
- `-a, --analyze`: Analyze input file structure without generating
- `-h, --help`: Show help message

## 💻 Programmatic Usage

### Basic Usage

```typescript
import { MockGeneratorService } from '@bramato/openrouter-mock-generator';

// Auto-detect image processing configuration
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

### Advanced Configuration

```typescript
import { MockGeneratorService } from '@bramato/openrouter-mock-generator';

// Explicitly control image processing
const generator = new MockGeneratorService(
  undefined, // Use default OpenRouter config
  true       // Force enable image processing
);

const result = await generator.generateMockData({
  inputFile: 'products.json',
  outputFile: 'generated_products.json',
  count: 50,
  preferences: 'Generate luxury Italian fashion items',
  enableImageProcessing: true // Enable for this specific request
});
```

### Image Processing Only

```typescript
import { PostProcessingOrchestrator } from '@bramato/openrouter-mock-generator';

// Process existing mock data with AI images
const processor = new PostProcessingOrchestrator('your-hf-api-key', {
  verbose: true,
  enableOptimization: true,
  uploadToCloud: true
});

const data = JSON.parse(fs.readFileSync('existing-mock-data.json', 'utf8'));
const result = await processor.processData(data);

if (result.success) {
  fs.writeFileSync('processed-data.json', JSON.stringify(result.processedData, null, 2));
}
```

## 🔧 Environment Variables

### Required
- `OPENROUTER_API_KEY`: Your OpenRouter API key

### Model Configuration
- `OPENROUTER_DEFAULT_MODEL`: Default model to use
- `OPENROUTER_MOCK_GENERATOR_MODEL`: Specific model for mock generation

### AI Image Processing (Optional)
- `HUGGINGFACE_API_KEY`: Hugging Face API token for image generation
- `STORAGE_PROVIDER`: `aws` or `digitalocean`

### AWS S3 Configuration
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `AWS_REGION`: AWS region (e.g., `us-east-1`)
- `AWS_S3_BUCKET_NAME`: S3 bucket name
- `AWS_S3_ENDPOINT`: Custom S3 endpoint (optional)

### DigitalOcean Spaces Configuration
- `DO_SPACES_ACCESS_KEY`: Spaces access key
- `DO_SPACES_SECRET_KEY`: Spaces secret key
- `DO_SPACES_REGION`: Spaces region (e.g., `fra1`)
- `DO_SPACES_NAME`: Space name
- `DO_API_TOKEN`: DigitalOcean API token (optional)

## Supported Models

The package automatically filters and uses only JSON-mode compatible models:

- **OpenAI**: GPT-4.1 Nano, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku
- **Google**: Gemini Pro, Gemini Flash
- **And many more via OpenRouter**

## 📚 Examples

### E-commerce Product Catalog

```bash
# Input: products.json with Picsum placeholder images
npx ai-generate-mock products.json --images --preferences "Generate luxury Italian fashion items from Milano" --count 25

# Output: Real product images uploaded to cloud storage
# - Product photos with Italian fashion context
# - Thumbnails and gallery images  
# - Banner images for promotional content
```

### Restaurant Menu with Food Images

```bash
npx ai-generate-mock menu.json --images --preferences "Traditional Italian cuisine from different regions" --count 15

# Generates:
# - Professional food photography for dishes
# - Restaurant interior images
# - Chef portrait photos
```

### User Profiles with Avatars

```bash
npx ai-generate-mock users.json --images --preferences "Italian professionals from major cities" --count 50

# Creates:
# - Professional headshot portraits
# - Contextual background images
# - Company logos for businesses
```

## 🎯 Use Cases

### Development & Testing
- Generate realistic test data for frontend applications
- Create demo content for presentations and prototypes
- Populate databases with meaningful sample data

### Design & Prototyping  
- Generate product catalogs with real imagery
- Create user interfaces with contextual content
- Build complete application mockups

### Marketing & Content
- Generate sample content for marketing campaigns
- Create diverse product showcases
- Build realistic user testimonials and reviews

## 💡 Custom Preferences Examples

```bash
# E-commerce products
--preferences "Generate luxury Italian fashion items with designer brands and premium pricing"

# Restaurant menu
--preferences "Create traditional Italian dishes with regional specialties and wine pairings"

# User data  
--preferences "Generate Italian professionals from Milano, Roma, and Napoli with realistic demographics"

# Events
--preferences "Create cultural events and festivals typical of Italian regions with local traditions"

# Real estate
--preferences "Generate Italian properties in historic city centers with authentic architectural details"
```

## Smart Features

### Dynamic Batch Sizing
The generator analyzes data complexity and automatically adjusts batch sizes:
- Simple items: Up to 10 per batch
- Complex nested structures: 1-3 per batch
- Prevents API timeouts and ensures quality

## 🎨 AI Image Processing

The system can automatically replace placeholder images (Picsum URLs) with contextually appropriate AI-generated images:

### How It Works

1. **Detection**: Scans JSON data for Picsum URLs (`https://picsum.photos/...`)
2. **Context Analysis**: Analyzes surrounding data to understand image context
3. **Smart Optimization**: Groups similar images to reduce generation costs
4. **AI Generation**: Creates images using Hugging Face models (FLUX.1-dev, Qwen-Image)
5. **Cloud Upload**: Uploads to AWS S3 or DigitalOcean Spaces with CDN URLs
6. **URL Replacement**: Replaces original URLs with new cloud URLs

### Supported Image Types

- **Product Images**: Professional product photography
- **Avatars & Profiles**: Portrait photography  
- **Banners & Headers**: Wide format promotional images
- **Thumbnails**: Small preview images
- **Logos & Icons**: Brand identity elements
- **Backgrounds**: Texture and pattern images

### Optimization Features

- **Smart Duplication Detection**: Reuses similar images (up to 30% cost savings)
- **Contextual Descriptions**: Generated in Italian with local context
- **Batch Processing**: Concurrent generation with rate limiting
- **Fallback Support**: Graceful degradation if generation fails

### Italian Locale Support
- Realistic Italian names and surnames
- Italian addresses and cities
- Euro currency formatting
- Italian business names and contexts

## 🔧 Troubleshooting

### Image Processing Issues

**Problem**: AI image processing not working
```bash
# Check configuration
npx ai-init

# Test with explicit flag
npx ai-generate-mock data.json --images --count 1
```

**Problem**: Images not uploading to cloud storage
```bash
# Verify storage configuration
cat .env | grep -E "(STORAGE_PROVIDER|AWS_|DO_)"

# Test cloud connectivity
npx spaces-manager test  # For DigitalOcean
```

**Problem**: Hugging Face API errors
```bash
# Verify API key permissions at https://huggingface.co/settings/tokens
# Ensure "Make calls to the serverless Inference API" is enabled
```

### Generation Issues

**Problem**: JSON parsing errors
- Check input file format with `npx ai-generate-mock input.json --analyze`
- Ensure input contains valid JSON arrays

**Problem**: Rate limiting
- Reduce batch size with smaller `--count` values
- Check OpenRouter/Hugging Face usage limits

### Configuration Issues

**Problem**: Environment variables not loading
```bash
# Check .env file format (no spaces around =)
OPENROUTER_API_KEY=your-key-here

# Not: OPENROUTER_API_KEY = your-key-here
```

## ❓ FAQ

**Q: Do I need both OpenRouter and Hugging Face API keys?**
A: OpenRouter is required for text generation. Hugging Face is optional for AI image processing.

**Q: Can I use AWS S3 and DigitalOcean Spaces simultaneously?**
A: No, choose one storage provider in the configuration.

**Q: How much does image generation cost?**
A: Hugging Face Inference API has free tier with rate limits. Cloud storage costs depend on usage.

**Q: Can I process existing mock data with AI images?**
A: Yes, use the `PostProcessingOrchestrator` programmatically or re-run generation with `--images`.

**Q: What image formats are supported?**
A: The system generates PNG images and supports various dimensions based on context.

**Q: How does the optimization work?**
A: The system detects similar images by content and context, reusing generated images to reduce costs.

## 🚀 Advanced Features

### Microservices Architecture

The image processing system uses a modular microservices approach:

- **ImageUrlExtractor**: Finds and categorizes image URLs
- **DescriptionGenerator**: Creates contextual AI prompts  
- **ImageProcessingAnalyzer**: Optimizes generation strategy
- **UrlReplacer**: Updates JSON with new image URLs
- **PostProcessingOrchestrator**: Coordinates all services

### Cloud Storage Features

- **CDN Integration**: Automatic CDN URL generation
- **Public Access**: Images configured for public viewing
- **Organized Structure**: Date-based folder organization
- **Fallback Support**: Graceful handling of upload failures

## 📊 Performance

- **Optimization**: Up to 30% cost savings through smart image reuse
- **Concurrency**: Configurable concurrent image generation
- **Batch Processing**: Automatic batching based on data complexity
- **Rate Limiting**: Built-in protection against API limits

## License

MIT

## Author

bramato

---

**🌟 If this project helps you, please consider starring it on GitHub!**