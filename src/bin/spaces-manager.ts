#!/usr/bin/env node

import { readFileSync } from 'fs';
import { join } from 'path';
import { DigitalOceanSpaces } from '../services/digitalocean-spaces';

interface SpacesConfig {
  DO_SPACES_ACCESS_KEY: string;
  DO_SPACES_SECRET_KEY: string;
  DO_SPACES_REGION: string;
  DO_SPACES_NAME?: string;
}

class SpacesManagerCLI {
  private doSpaces?: DigitalOceanSpaces;
  private config: any = {};

  async run(): Promise<void> {
    try {
      const command = process.argv[2];
      
      if (!command) {
        this.showHelp();
        return;
      }

      this.loadConfiguration();
      
      if (!this.hasValidConfig()) {
        console.error('❌ DigitalOcean Spaces configuration not found. Run "ai-init" first.');
        process.exit(1);
      }

      this.initializeSpaces();

      switch (command) {
        case 'list':
        case 'ls':
          await this.listSpaces();
          break;
        case 'create':
          await this.createSpace();
          break;
        case 'info':
          await this.showSpaceInfo();
          break;
        case 'test':
          await this.testConnection();
          break;
        case 'regions':
          this.showRegions();
          break;
        default:
          console.error(`❌ Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }

    } catch (error) {
      console.error('❌ Command failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private loadConfiguration(): void {
    try {
      const envPath = join(process.cwd(), '.env');
      const envContent = readFileSync(envPath, 'utf8');
      
      envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          this.config[key.trim()] = value.trim();
        }
      });
    } catch (error) {
      console.error('❌ Could not load .env file. Run "ai-init" first.');
      process.exit(1);
    }
  }

  private hasValidConfig(): boolean {
    return !!(
      this.config.DO_SPACES_ACCESS_KEY &&
      this.config.DO_SPACES_SECRET_KEY &&
      this.config.DO_SPACES_REGION
    );
  }

  private initializeSpaces(): void {
    this.doSpaces = new DigitalOceanSpaces({
      accessKeyId: this.config.DO_SPACES_ACCESS_KEY,
      secretAccessKey: this.config.DO_SPACES_SECRET_KEY,
      region: this.config.DO_SPACES_REGION,
      spaceName: this.config.DO_SPACES_NAME
    });
  }

  private async listSpaces(): Promise<void> {
    if (!this.doSpaces) return;

    console.log('🔄 Fetching Spaces list...');
    
    try {
      const spaces = await this.doSpaces.listSpaces();
      
      if (spaces.length === 0) {
        console.log('📭 No Spaces found in region:', this.config.DO_SPACES_REGION);
        return;
      }

      console.log(`\n📁 Found ${spaces.length} Space(s) in region ${this.config.DO_SPACES_REGION}:\n`);
      
      spaces.forEach((space, index) => {
        console.log(`${index + 1}. ${space.name}`);
        console.log(`   📍 Region: ${space.region}`);
        console.log(`   🌐 URL: ${space.endpoint}`);
        console.log(`   📡 CDN: ${space.cdnEndpoint}`);
        if (space.createdAt) {
          console.log(`   📅 Created: ${new Date(space.createdAt).toLocaleDateString()}`);
        }
        console.log('');
      });

    } catch (error) {
      console.error('❌ Failed to list Spaces:', error);
    }
  }

  private async createSpace(): Promise<void> {
    if (!this.doSpaces) return;

    const spaceName = process.argv[3];
    const region = process.argv[4] || this.config.DO_SPACES_REGION;

    if (!spaceName) {
      console.error('❌ Space name is required');
      console.log('Usage: ai-spaces-manager create <space-name> [region]');
      process.exit(1);
    }

    // Validate space name
    if (!/^[a-z0-9-]+$/.test(spaceName)) {
      console.error('❌ Space name must contain only lowercase letters, numbers, and hyphens');
      process.exit(1);
    }

    console.log(`🔄 Creating Space "${spaceName}" in region ${region}...`);

    try {
      const space = await this.doSpaces.createSpace(spaceName, region, true);
      
      console.log(`✅ Space created successfully!`);
      console.log(`📍 Name: ${space.name}`);
      console.log(`📍 Region: ${space.region}`);
      console.log(`🌐 URL: ${space.endpoint}`);
      console.log(`📡 CDN: ${space.cdnEndpoint}`);
      
    } catch (error) {
      console.error('❌ Failed to create Space:', error);
    }
  }

  private async showSpaceInfo(): Promise<void> {
    const spaceName = process.argv[3] || this.config.DO_SPACES_NAME;

    if (!spaceName) {
      console.error('❌ Space name is required');
      console.log('Usage: ai-spaces-manager info <space-name>');
      console.log('Or configure default space with ai-init');
      process.exit(1);
    }

    console.log(`📋 Space Information: ${spaceName}\n`);
    console.log(`📍 Region: ${this.config.DO_SPACES_REGION}`);
    console.log(`🌐 Endpoint: https://${spaceName}.${this.config.DO_SPACES_REGION}.digitaloceanspaces.com`);
    console.log(`📡 CDN Endpoint: https://${spaceName}.${this.config.DO_SPACES_REGION}.cdn.digitaloceanspaces.com`);
    console.log(`🔑 Access Key: ${this.config.DO_SPACES_ACCESS_KEY.substring(0, 8)}...`);
    
    // Test if space exists and is accessible
    await this.testConnection();
  }

  private async testConnection(): Promise<void> {
    if (!this.doSpaces) return;

    console.log('🔄 Testing connection to DigitalOcean Spaces...');

    try {
      const isConnected = await this.doSpaces.testConnection();
      
      if (isConnected) {
        console.log('✅ Connection successful!');
        console.log('📡 Spaces API is accessible and credentials are valid');
      } else {
        console.log('❌ Connection failed');
        console.log('Please check your credentials and region configuration');
      }
    } catch (error) {
      console.error('❌ Connection test failed:', error);
    }
  }

  private showRegions(): void {
    const regions = DigitalOceanSpaces.getAvailableRegions();
    
    console.log('🌍 Available DigitalOcean Spaces Regions:\n');
    
    regions.forEach((region, index) => {
      console.log(`${index + 1}. ${region.code} - ${region.name}`);
      console.log(`   📍 ${region.location}`);
      console.log('');
    });
    
    console.log(`Current configured region: ${this.config.DO_SPACES_REGION || 'Not configured'}`);
  }

  private showHelp(): void {
    console.log(`
🌊 DigitalOcean Spaces Manager

USAGE:
  ai-spaces-manager <command> [options]

COMMANDS:
  list, ls                  List all Spaces in configured region
  create <name> [region]    Create a new Space
  info [space-name]         Show Space information
  test                      Test connection to Spaces
  regions                   Show available regions

EXAMPLES:
  # List all Spaces
  ai-spaces-manager list

  # Create a new Space
  ai-spaces-manager create my-images-space

  # Create Space in specific region
  ai-spaces-manager create my-space ams3

  # Show info about configured Space
  ai-spaces-manager info

  # Show info about specific Space  
  ai-spaces-manager info my-space-name

  # Test connection
  ai-spaces-manager test

  # Show available regions
  ai-spaces-manager regions

SETUP:
  Run 'ai-init' first to configure your DigitalOcean Spaces credentials.
`);
  }
}

// Run CLI
const cli = new SpacesManagerCLI();
cli.run();