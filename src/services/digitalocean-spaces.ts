import { createHash } from 'crypto';

export interface DigitalOceanConfig {
  apiToken?: string; // Per API DigitalOcean (se disponibile)
  accessKeyId: string; // Spaces Access Key
  secretAccessKey: string; // Spaces Secret Key
  region: string;
  spaceName?: string; // Nome dello Space da creare/usare
  endpoint?: string; // Calcolato automaticamente da region
}

export interface SpaceInfo {
  name: string;
  region: string;
  endpoint: string;
  cdnEndpoint?: string;
  createdAt?: string;
  size?: number;
  objectCount?: number;
}

export interface UploadResult {
  url: string;
  key: string;
  cdnUrl?: string;
  etag?: string;
}

export class DigitalOceanSpaces {
  private config: DigitalOceanConfig;
  private endpoint: string;
  private cdnEndpoint: string;

  // Regioni disponibili per DigitalOcean Spaces
  public static readonly AVAILABLE_REGIONS = [
    { code: 'nyc3', name: 'New York 3', location: 'New York, USA' },
    { code: 'ams3', name: 'Amsterdam 3', location: 'Amsterdam, Netherlands' },
    { code: 'lon1', name: 'London 1', location: 'London, UK' },
    { code: 'sgp1', name: 'Singapore 1', location: 'Singapore' },
    { code: 'sfo2', name: 'San Francisco 2', location: 'San Francisco, USA' },
    { code: 'sfo3', name: 'San Francisco 3', location: 'San Francisco, USA' },
    { code: 'tor1', name: 'Toronto 1', location: 'Toronto, Canada' },
    { code: 'fra1', name: 'Frankfurt 1', location: 'Frankfurt, Germany' },
    { code: 'blr1', name: 'Bangalore 1', location: 'Bangalore, India' },
    { code: 'syd1', name: 'Sydney 1', location: 'Sydney, Australia' }
  ];

  constructor(config: DigitalOceanConfig) {
    this.config = config;
    this.endpoint = config.endpoint || `https://${config.region}.digitaloceanspaces.com`;
    this.cdnEndpoint = `https://${config.spaceName}.${config.region}.cdn.digitaloceanspaces.com`;
  }

  static getAvailableRegions() {
    return this.AVAILABLE_REGIONS;
  }

  async listSpaces(): Promise<SpaceInfo[]> {
    try {
      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      const headers = {
        'Host': `${this.config.region}.digitaloceanspaces.com`,
        'x-amz-date': timestamp,
        'x-amz-content-sha256': this.sha256('')
      };

      const authorization = this.generateAuthHeader(
        'GET',
        '/',
        headers,
        timestamp,
        date
      );

      const response = await fetch(`${this.endpoint}/`, {
        method: 'GET',
        headers: {
          ...headers,
          'Authorization': authorization
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to list spaces: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseListBucketsResponse(xmlText);

    } catch (error) {
      console.error('Error listing spaces:', error);
      throw error;
    }
  }

  async createSpace(spaceName: string, region?: string, makePublic: boolean = true): Promise<SpaceInfo> {
    const targetRegion = region || this.config.region;
    const spaceEndpoint = `https://${targetRegion}.digitaloceanspaces.com`;
    
    try {
      const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      const headers: Record<string, string> = {
        'Host': `${spaceName}.${targetRegion}.digitaloceanspaces.com`,
        'x-amz-date': timestamp,
        'x-amz-content-sha256': this.sha256('')
      };

      if (makePublic) {
        headers['x-amz-acl'] = 'public-read';
      }

      const authorization = this.generateAuthHeader(
        'PUT',
        '/',
        headers,
        timestamp,
        date,
        targetRegion
      );

      const response = await fetch(`https://${spaceName}.${targetRegion}.digitaloceanspaces.com/`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Authorization': authorization
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create space: ${response.status} ${response.statusText}\n${errorText}`);
      }

      console.log(`✅ Space "${spaceName}" created successfully in region ${targetRegion}`);

      return {
        name: spaceName,
        region: targetRegion,
        endpoint: `https://${spaceName}.${targetRegion}.digitaloceanspaces.com`,
        cdnEndpoint: `https://${spaceName}.${targetRegion}.cdn.digitaloceanspaces.com`,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error creating space "${spaceName}":`, error);
      throw error;
    }
  }

  async uploadImage(
    imageData: string | Buffer,
    filename: string,
    contentType: string = 'image/png',
    makePublic: boolean = true
  ): Promise<UploadResult> {
    if (!this.config.spaceName) {
      throw new Error('Space name is required for upload');
    }

    const buffer = typeof imageData === 'string' 
      ? Buffer.from(imageData, 'base64') 
      : imageData;

    const key = this.generateImageKey(filename);
    
    try {
      const url = await this.uploadToSpace(buffer, key, contentType, makePublic);
      
      return {
        url,
        key,
        cdnUrl: `${this.cdnEndpoint}/${key}`
      };
    } catch (error) {
      console.error('Failed to upload image to DigitalOcean Space:', error);
      throw new Error(`Space upload failed: ${error}`);
    }
  }

  async uploadMultipleImages(
    images: { data: string | Buffer; filename: string; contentType?: string }[]
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    
    for (const image of images) {
      try {
        const result = await this.uploadImage(
          image.data, 
          image.filename, 
          image.contentType
        );
        results.push(result);
      } catch (error) {
        console.error(`Failed to upload ${image.filename}:`, error);
        results.push({
          url: '',
          key: '',
          etag: `ERROR: ${error}`
        });
      }
    }
    
    return results;
  }

  private async uploadToSpace(
    buffer: Buffer, 
    key: string, 
    contentType: string,
    makePublic: boolean = true
  ): Promise<string> {
    const url = `https://${this.config.spaceName}.${this.config.region}.digitaloceanspaces.com/${key}`;
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'x-amz-content-sha256': this.sha256(buffer),
      'x-amz-date': timestamp,
      'Host': `${this.config.spaceName}.${this.config.region}.digitaloceanspaces.com`
    };

    if (makePublic) {
      headers['x-amz-acl'] = 'public-read';
    }

    const authorization = this.generateAuthHeader(
      'PUT',
      `/${key}`,
      headers,
      timestamp,
      date
    );

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...headers,
        'Authorization': authorization
      },
      body: buffer
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Space upload failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return url;
  }

  private generateImageKey(filename: string): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    const hash = createHash('md5').update(filename + Date.now()).digest('hex').slice(0, 8);
    const extension = filename.split('.').pop() || 'png';
    
    return `generated-images/${timestamp}/${hash}.${extension}`;
  }

  private generateAuthHeader(
    method: string,
    path: string,
    headers: Record<string, string>,
    timestamp: string,
    date: string,
    region?: string
  ): string {
    const targetRegion = region || this.config.region;
    const service = 's3';
    
    // Create canonical request
    const canonicalHeaders = Object.entries(headers)
      .map(([k, v]) => `${k.toLowerCase()}:${v}`)
      .sort()
      .join('\n');
    
    const signedHeaders = Object.keys(headers)
      .map(k => k.toLowerCase())
      .sort()
      .join(';');
    
    const canonicalRequest = [
      method,
      path,
      '',
      canonicalHeaders,
      '',
      signedHeaders,
      headers['x-amz-content-sha256']
    ].join('\n');

    // Create string to sign
    const credentialScope = `${date}/${targetRegion}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      this.sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const signature = this.calculateSignature(stringToSign, date, targetRegion, service);

    // Return authorization header
    return `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }

  private calculateSignature(stringToSign: string, date: string, region: string, service: string): string {
    const kDate = this.hmacSha256(`AWS4${this.config.secretAccessKey}`, date);
    const kRegion = this.hmacSha256(kDate, region);
    const kService = this.hmacSha256(kRegion, service);
    const kSigning = this.hmacSha256(kService, 'aws4_request');
    
    return this.hmacSha256(kSigning, stringToSign).toString('hex');
  }

  private hmacSha256(key: string | Buffer, data: string): Buffer {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  private sha256(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private parseListBucketsResponse(xmlText: string): SpaceInfo[] {
    const spaces: SpaceInfo[] = [];
    
    // Simple XML parsing per estrarre i bucket
    const bucketMatches = xmlText.match(/<Bucket>[\s\S]*?<\/Bucket>/g);
    
    if (bucketMatches) {
      bucketMatches.forEach(bucketXml => {
        const nameMatch = bucketXml.match(/<Name>(.*?)<\/Name>/);
        const dateMatch = bucketXml.match(/<CreationDate>(.*?)<\/CreationDate>/);
        
        if (nameMatch) {
          spaces.push({
            name: nameMatch[1],
            region: this.config.region,
            endpoint: `https://${nameMatch[1]}.${this.config.region}.digitaloceanspaces.com`,
            cdnEndpoint: `https://${nameMatch[1]}.${this.config.region}.cdn.digitaloceanspaces.com`,
            createdAt: dateMatch ? dateMatch[1] : undefined
          });
        }
      });
    }
    
    return spaces;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.listSpaces();
      return true;
    } catch (error) {
      console.error('DigitalOcean Spaces connection test failed:', error);
      return false;
    }
  }

  async enableCDN(spaceName?: string): Promise<string> {
    const targetSpace = spaceName || this.config.spaceName;
    if (!targetSpace) {
      throw new Error('Space name is required to enable CDN');
    }
    
    // Note: CDN enabling typically requires DigitalOcean API, not Spaces API
    // For now, return the CDN URL format
    const cdnUrl = `https://${targetSpace}.${this.config.region}.cdn.digitaloceanspaces.com`;
    console.log(`📡 CDN URL for space "${targetSpace}": ${cdnUrl}`);
    console.log('💡 Enable CDN manually in DigitalOcean Control Panel for optimal performance');
    
    return cdnUrl;
  }
}