import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3: AWS.S3;
  private bucket: string;
  private isConfigured = false;

  constructor(private configService: ConfigService) {
    const accessKey = this.configService.get<string>('s3.accessKey');
    const secretKey = this.configService.get<string>('s3.secretKey');
    const region = this.configService.get<string>('s3.region');
    this.bucket = this.configService.get<string>('s3.bucket') || '';

    if (accessKey && secretKey && this.bucket) {
      this.s3 = new AWS.S3({
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        region: region || 'ap-southeast-2',
      });
      this.isConfigured = true;
      this.logger.log(`✅ S3 configured for bucket: ${this.bucket} in ${region}`);
    } else {
      this.logger.warn('⚠️ S3 not configured - files will only be stored in database');
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ url: string; key: string } | null> {
    if (!this.isConfigured) {
      this.logger.warn('S3 not configured, skipping upload');
      return null;
    }

    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      };

      await this.s3.upload(params).promise();
      
      const url = `https://${this.bucket}.s3.amazonaws.com/${key}`;
      this.logger.log(`Uploaded file to S3: ${key}`);
      
      return { url, key };
    } catch (error) {
      this.logger.error(`Failed to upload to S3: ${error.message}`);
      return null;
    }
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string | null> {
    if (!this.isConfigured) return null;

    try {
      const url = await this.s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucket,
        Key: key,
        Expires: expiresIn,
      });
      return url;
    } catch (error) {
      this.logger.error(`Failed to get signed URL: ${error.message}`);
      return null;
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    if (!this.isConfigured) return false;

    try {
      await this.s3.deleteObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
      
      this.logger.log(`Deleted file from S3: ${key}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete from S3: ${error.message}`);
      return false;
    }
  }

  async getFile(key: string): Promise<Buffer | null> {
    if (!this.isConfigured) return null;

    try {
      const result = await this.s3.getObject({
        Bucket: this.bucket,
        Key: key,
      }).promise();
      
      return result.Body as Buffer;
    } catch (error) {
      this.logger.error(`Failed to get file from S3: ${error.message}`);
      return null;
    }
  }
}
