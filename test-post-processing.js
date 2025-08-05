const { PostProcessingOrchestrator } = require('./dist/services/post-processing-orchestrator');
const fs = require('fs');

async function testPostProcessing() {
  try {
    console.log('🧪 Testing Post-Processing System\n');
    
    // Carica dati mock
    const data = JSON.parse(fs.readFileSync('mock-generated-data.json', 'utf8'));
    console.log(`📋 Loaded ${data.length} mock items`);
    
    // Inizializza post-processor con chiave HuggingFace
    const processor = new PostProcessingOrchestrator(
      process.env.HUGGINGFACE_API_KEY,
      {
        verbose: true,
        enableOptimization: true,
        uploadToCloud: true,
        maxConcurrentGenerations: 2
      }
    );
    
    console.log('\n🚀 Starting post-processing...\n');
    
    // Processa i dati
    const result = await processor.processData(data);
    
    if (result.success) {
      console.log('\n✅ Post-processing completed successfully!');
      console.log(`📊 Results:`);
      console.log(`   • Original images: ${result.originalImageCount}`);
      console.log(`   • Processed images: ${result.processedImageCount}`);
      console.log(`   • Generated images: ${result.generatedImageCount}`);
      console.log(`   • Optimization savings: ${result.optimizationSavings.toFixed(1)}%`);
      console.log(`   • Processing time: ${(result.processingTimeMs / 1000).toFixed(1)}s`);
      
      // Salva risultati
      fs.writeFileSync('test-post-processed-output.json', JSON.stringify(result.processedData, null, 2));
      console.log(`\n📁 Processed data saved to: test-post-processed-output.json`);
      
    } else {
      console.error('\n❌ Post-processing failed:');
      result.errors.forEach(error => console.error(`   • ${error}`));
    }
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    console.error(error.stack);
  }
}

// Esegui test se le chiavi API sono disponibili
if (process.env.HUGGINGFACE_API_KEY) {
  testPostProcessing();
} else {
  console.error('❌ HUGGINGFACE_API_KEY not found. Please set it before running this test.');
}