import {
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { logger } from '@lukittu/shared';
import 'server-only';

const publicS3Client = new S3Client({
  endpoint: process.env.PUBLIC_OBJECT_STORAGE_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.PUBLIC_OBJECT_STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.PUBLIC_OBJECT_STORAGE_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const privateS3Client = new S3Client({
  endpoint: process.env.PRIVATE_OBJECT_STORAGE_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.PRIVATE_OBJECT_STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.PRIVATE_OBJECT_STORAGE_SECRET_KEY!,
  },
  forcePathStyle: true,
});

export const deleteFileFromPublicS3 = async (
  bucket: string,
  fileKey: string,
) => {
  try {
    const deleteParams: DeleteObjectCommandInput = {
      Bucket: bucket,
      Key: fileKey,
    };
    return publicS3Client.send(new DeleteObjectCommand(deleteParams));
  } catch (error) {
    logger.error('Error deleting file from object storage:', error);
  }
};

export const uploadFileToPublicS3 = async (
  bucket: string,
  fileKey: string,
  file: ReadableStream | Buffer,
  contentType: string,
) => {
  try {
    if (file instanceof Buffer) {
      const uploadParams: PutObjectCommandInput = {
        Bucket: bucket,
        Key: fileKey,
        Body: file,
        ContentType: contentType,
      };
      return publicS3Client.send(new PutObjectCommand(uploadParams));
    } else {
      const upload = new Upload({
        client: publicS3Client,
        params: {
          Bucket: bucket,
          Key: fileKey,
          Body: file,
          ContentType: contentType,
        },
      });
      return upload.done();
    }
  } catch (error) {
    logger.error('Error uploading file to object storage:', error);
  }
};

export const deleteFileFromPrivateS3 = async (
  bucket: string,
  fileKey: string,
) => {
  try {
    const deleteParams: DeleteObjectCommandInput = {
      Bucket: bucket,
      Key: fileKey,
    };
    return privateS3Client.send(new DeleteObjectCommand(deleteParams));
  } catch (error) {
    logger.error('Error deleting file from object storage:', error);
  }
};

export const uploadFileToPrivateS3 = async (
  bucket: string,
  fileKey: string,
  file: ReadableStream | Buffer,
  contentType: string,
) => {
  try {
    if (file instanceof Buffer) {
      const uploadParams: PutObjectCommandInput = {
        Bucket: bucket,
        Key: fileKey,
        Body: file,
        ContentType: contentType,
      };
      return privateS3Client.send(new PutObjectCommand(uploadParams));
    } else {
      const upload = new Upload({
        client: privateS3Client,
        params: {
          Bucket: bucket,
          Key: fileKey,
          Body: file,
          ContentType: contentType,
        },
      });
      return upload.done();
    }
  } catch (error) {
    logger.error('Error uploading file to object storage:', error);
  }
};

export const getFileFromPrivateS3 = async (bucket: string, fileKey: string) => {
  try {
    const getObjectParams: GetObjectCommandInput = {
      Bucket: bucket,
      Key: fileKey,
    };

    return privateS3Client.send(new GetObjectCommand(getObjectParams));
  } catch (error) {
    logger.error('Error getting file from object storage:', error);
  }
};
