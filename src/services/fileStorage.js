const { S3Client } = require('@aws-sdk/client-s3');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const settingsService = require('./settings');

function normalizeCloudfront(domain) {
  if (!domain) return null;
  return String(domain).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

class FileStorageService {
  constructor() {
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB
    this.allowedTypes = (process.env.ALLOWED_IMAGE_TYPES || 'jpg,jpeg,png,gif,webp').split(',');
    
    // S3 configuration will be initialized dynamically
    this.s3 = null;
    this.s3Bucket = null;
    this.s3Region = null;
    this.cloudfrontDomain = null;
    
    this.ensureUploadDirectory();
  }

  async ensureUploadDirectory() {
    try {
      await fs.access(this.uploadPath);
    } catch (error) {
      await fs.mkdir(this.uploadPath, { recursive: true });
      console.log(`📁 Created upload directory: ${this.uploadPath}`);
    }
  }

  async initializeS3() {
    try {
      const s3cfg = settingsService.getS3FromEnv();

      if (!s3cfg.enabled) {
        this.s3 = null;
        this.s3Bucket = null;
        this.s3Region = null;
        this.cloudfrontDomain = null;
        console.log('📁 Using local file storage');
        return false;
      }

      const validation = settingsService.validateS3Settings(s3cfg);
      if (!validation.isValid) {
        console.error('S3 validation failed:', validation.errors);
        this.s3 = null;
        return false;
      }

      this.s3 = new S3Client({
        region: s3cfg.region,
        credentials: {
          accessKeyId: s3cfg.accessKey,
          secretAccessKey: s3cfg.secretKey
        }
      });

      this.s3Bucket = s3cfg.bucket;
      this.s3Region = s3cfg.region;
      this.cloudfrontDomain = normalizeCloudfront(s3cfg.cloudfrontUrl);

      console.log('✅ S3 storage configured');
      return true;
    } catch (error) {
      console.error('Failed to initialize S3:', error);
      this.s3 = null;
      return false;
    }
  }

  async getUploadLimits() {
    const maxFileSize = await settingsService.getSetting(
      'changelog_max_image_size_bytes',
      parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024
    );
    const typesStr = await settingsService.getSetting(
      'changelog_allowed_image_types',
      process.env.ALLOWED_IMAGE_TYPES || 'jpg,jpeg,png,gif,webp'
    );
    const allowedTypes = String(typesStr)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return { maxFileSize, allowedTypes };
  }

  validateFile(file, limits) {
    const maxFileSize = limits?.maxFileSize ?? this.maxFileSize;
    const allowedTypes = limits?.allowedTypes ?? this.allowedTypes;

    if (!file) {
      throw new Error('No file provided');
    }

    if (!file.buffer || file.buffer.length === 0) {
      return false;
    }

    if (file.size > maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${maxFileSize / 1024 / 1024}MB`);
    }

    const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
    if (!allowedTypes.includes(fileExtension)) {
      throw new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    return true;
  }

  async processImage(buffer) {
    try {
      // Resize and optimize image
      const processedBuffer = await sharp(buffer)
        .resize(1200, 1200, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 100 })
        .toBuffer();
      
      return processedBuffer;
    } catch (error) {
      console.error('Image processing failed:', error);
      return buffer; // Return original if processing fails
    }
  }

  async uploadFile(file) {
    const limits = await this.getUploadLimits();
    const isValid = this.validateFile(file, limits);
    
    // Skip upload if file is empty or invalid
    if (!isValid) {
      return null;
    }

    // Initialize S3 if not already done
    if (!this.s3) {
      await this.initializeS3();
    }

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const filename = `${uuidv4()}${fileExtension}`;
    
    // Process image
    const processedBuffer = await this.processImage(file.buffer);

    if (this.s3) {
      return await this.uploadToS3(processedBuffer, filename, file.mimetype);
    } else {
      return await this.uploadToLocal(processedBuffer, filename, file.originalname, file.mimetype, file.size);
    }
  }

  async uploadToS3(buffer, filename, mimetype) {
    const s3Key = `uploads/${filename}`;
    
    const uploadParams = {
      Bucket: this.s3Bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: mimetype,
      ACL: 'public-read',
      CacheControl: 'max-age=31536000' // 1 year cache
    };

    try {
      await this.s3.send(new PutObjectCommand(uploadParams));
      
      const fileUrl = this.cloudfrontDomain 
        ? `https://${this.cloudfrontDomain}/${s3Key}`
        : `https://${this.s3Bucket}.s3.amazonaws.com/${s3Key}`;

      return {
        filename,
        originalName: filename,
        mimeType: mimetype,
        size: buffer.length,
        storageType: 's3',
        s3Key,
        url: fileUrl
      };
    } catch (error) {
      console.error('S3 upload failed, falling back to local storage:', error);
      return await this.uploadToLocal(buffer, filename, filename, mimetype, buffer.length);
    }
  }

  async uploadToLocal(buffer, filename, originalName, mimetype, size) {
    const filePath = path.join(this.uploadPath, filename);
    
    try {
      await fs.writeFile(filePath, buffer);
      
      return {
        filename,
        originalName,
        mimeType: mimetype,
        size,
        storageType: 'local',
        s3Key: null,
        url: `/uploads/${filename}`
      };
    } catch (error) {
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }

  async deleteFile(fileInfo) {
    if (fileInfo.storageType === 's3' && this.s3) {
      try {
        await this.s3.send(new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: fileInfo.s3Key
        }));
      } catch (error) {
        console.error('Failed to delete S3 file:', error);
      }
    } else if (fileInfo.storageType === 'local') {
      try {
        const filePath = path.join(this.uploadPath, fileInfo.filename);
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Failed to delete local file:', error);
      }
    }
  }

  getFileUrl(fileInfo) {
    if (fileInfo.storageType === 's3') {
      return this.cloudfrontDomain 
        ? `https://${this.cloudfrontDomain}/${fileInfo.s3Key}`
        : `https://${this.s3Bucket}.s3.amazonaws.com/${fileInfo.s3Key}`;
    } else {
      return `/uploads/${fileInfo.filename}`;
    }
  }

  async reinitializeS3() {
    this.s3 = null;
    this.s3Bucket = null;
    this.s3Region = null;
    this.cloudfrontDomain = null;
    return await this.initializeS3();
  }
}

module.exports = new FileStorageService(); 