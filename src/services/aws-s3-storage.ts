import { createHash } from 'crypto';

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  endpoint?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  etag?: string;
}

export class AWSS3Storage {
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  async uploadImage(
    imageData: string | Buffer, 
    filename: string,
    contentType: string = 'image/png'
  ): Promise<UploadResult> {
    const buffer = typeof imageData === 'string' 
      ? Buffer.from(imageData, 'base64') 
      : imageData;

    const key = this.generateImageKey(filename);
    
    try {
      const url = await this.uploadToS3(buffer, key, contentType);
      
      return {
        url,
        key
      };
    } catch (error) {
      console.error('Failed to upload image to S3:', error);
      throw new Error(`S3 upload failed: ${error}`);
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
        // Continue with other images even if one fails
        results.push({
          url: '',
          key: '',
          etag: `ERROR: ${error}`
        });
      }
    }
    
    return results;
  }

  private generateImageKey(filename: string): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    const hash = createHash('md5').update(filename + Date.now()).digest('hex').slice(0, 8);
    const extension = filename.split('.').pop() || 'png';
    
    return `generated-images/${timestamp}/${hash}.${extension}`;
  }

  private async uploadToS3(
    buffer: Buffer, 
    key: string, 
    contentType: string
  ): Promise<string> {
    const endpoint = this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;
    const url = `${endpoint}/${this.config.bucketName}/${key}`;
    
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    
    const headers = {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'x-amz-acl': 'public-read',
      'x-amz-content-sha256': this.sha256(buffer),
      'x-amz-date': timestamp,
      'Host': `${this.config.bucketName}.s3.${this.config.region}.amazonaws.com`
    };

    const authorization = this.generateAuthHeader(
      'PUT',
      key,
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
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    // Return public URL
    return `https://${this.config.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  private generateAuthHeader(
    method: string,
    key: string,
    headers: Record<string, string>,
    timestamp: string,
    date: string
  ): string {
    const region = this.config.region;
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
      `/${key}`,
      '',
      canonicalHeaders,
      '',
      signedHeaders,
      headers['x-amz-content-sha256']
    ].join('\n');

    // Create string to sign
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      credentialScope,
      this.sha256(canonicalRequest)
    ].join('\n');

    // Calculate signature
    const signature = this.calculateSignature(stringToSign, date, region, service);

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

  async testConnection(): Promise<boolean> {
    try {
      // Test with a small dummy upload
      const testBuffer = Buffer.from('test', 'utf8');
      const testKey = `test-connection-${Date.now()}.txt`;
      
      await this.uploadToS3(testBuffer, testKey, 'text/plain');
      
      // Cleanup test file (optional)
      await this.deleteObject(testKey);
      
      return true;
    } catch (error) {
      console.error('S3 connection test failed:', error);
      return false;
    }
  }

  private async deleteObject(key: string): Promise<void> {
    const endpoint = this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;
    const url = `${endpoint}/${this.config.bucketName}/${key}`;
    
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    const headers = {
      'x-amz-date': timestamp,
      'Host': `${this.config.bucketName}.s3.${this.config.region}.amazonaws.com`
    };

    const authorization = this.generateAuthHeader(
      'DELETE',
      key,
      { ...headers, 'x-amz-content-sha256': this.sha256('') },
      timestamp,
      date
    );

    await fetch(url, {
      method: 'DELETE',
      headers: {
        ...headers,
        'Authorization': authorization
      }
    });
  }
}