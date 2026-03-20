/* eslint-disable no-await-in-loop */

'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const QueueService = require('moleculer-bull');
const queueConfig = require('@config/queue').QueueConfig;

const randomstring = require('randomstring');
const { S3, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime');

const { create } = require('ipfs-http-client');

const { ValidationError } = require('@helpers/errors.js');

const UPLOAD_DIR = `${process.cwd()}/upload`;
const IPFS_CID_VERSION = 0;
const DEFAULT_PREFIX = 'file';

const FILE_EXTENSION_ALLOW_LIST = [
  '.json',
  '.jpg',
  '.png',
  '.gif',
  '.svg',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.ogg',
  '.glb',
];
const { getIsIpfs, ipfsURL2Path } = require('@helpers/ipfs/is_ipfs_getter');
const filenameToS3Key = (fileName) =>
  (process.env.S3_BUCKET_FOLDER ? `${process.env.S3_BUCKET_FOLDER}/` : '') + fileName;

module.exports = {
  name: 'file',

  mixins: [QueueService(queueConfig.url, queueConfig.opts)],

  settings: {
    s3_base_url: `https://${process.env.S3_DOMAIN_NAME}/`,
  },

  queues: {
    'upload.to_ipfs': {
      concurrency: 1,
      process(job) {
        return this.uploadFileToIpfs(job.data.filename);
      },
    },
  },

  actions: {
    /**
     * Upload file to S3. To avoid overwriting when upload 2 different files with the same name,
     * this function generate a random filename before uploading.
     * Original filename can be kept unchange by specifying keep_original_filename flag
     *
     * Special flags in ctx.meta
     *    keep_original_filename: keep original filename before uploading
     *    url_only: only generate link to corresponing S3 file without actually uploading
     */
    save: {
      async handler(ctx) {
        let fileName = ctx.meta.keep_original_filename
          ? this.normalizeFilename(ctx.meta.filename)
          : this.randomFileName(ctx.meta.filename);
        const s3Url = this.settings.s3_base_url
          + (process.env.S3_BUCKET_FOLDER ? `${process.env.S3_BUCKET_FOLDER}/` : '')
          + fileName;

        if (!ctx.meta.url_only) {
          this.logger.info('---------start push file stream to server-----------');
          try {
            const command = new PutObjectCommand({
              Bucket: process.env.S3_BUCKET,
              Body: await this.stream2buffer(ctx.params),
              Key: filenameToS3Key(fileName),
              ContentType: this.getType(fileName),
            });
            // Upload to s3
            this.logger.info(`Prepare to upload ${fileName}`);
            await this.s3.send(command);
            this.logger.info(`S3 Upload Completed ${fileName}`);
          } catch (error) {
            this.logger.error('Can-not-upload-file', error);
            throw error;
          }
        }

        return s3Url;
      },
    },

    s3_is_exist: {
      params: {
        filename: 'string|min:1',
      },
      async handler(ctx) {
        try {
          let fileName = ctx.params.filename;

          await this.s3.headObject({
            Bucket: process.env.S3_BUCKET,
            Key: filenameToS3Key(fileName),
          });

          return true;
        } catch (error) {
          return false;
        }
      },
    },

    /**
     * Upload file to IPFS then return cid
     * TODO: we could improve this by using a queue to upload to ipfs
     * however we don't know if we can generate cid before uploading for folder
     *   we can also manage files by collections or users
     */
    ipfs_save: {
      openapi: {
        security: [{ bearerAuth: [] }],
      },
      async handler(ctx) {
        try {
          const originalFilename = ctx.meta.filename;

          // verify file extension
          if (!FILE_EXTENSION_ALLOW_LIST.includes(path.extname(originalFilename).toLowerCase())) {
            throw new ValidationError('Unsupported file extension!');
          }

          const filedata = await this.stream2buffer(ctx.params);
          const addResponse = await this.ipfs.add(
            { path: `/${originalFilename}`, content: filedata },
            { wrapWithDirectory: true },
          );

          return {
            ipfs_path: `/ipfs/${addResponse.cid.toString()}/${originalFilename}`,
          };
        } catch (error) {
          this.logger.error('Can-not-upload-file', error);
          throw error;
        }
      },
    },

    /**
     * Get file from multiple ipfs gateways, return data from the first finished gateway.
     */
    ipfs_multi_get: {
      params: {
        ipfs_url: 'string|min:1',
      },
      async handler(ctx) {
        return Promise.any(this.ipfsClients.map((client) =>
          this.getFileFromIpfs(client, ctx.params.ipfs_url)));
      },
    },
  },

  events: {},

  methods: {
    randomFileName(filename) {
      return randomstring.generate(32) + path.extname(filename);
    },

    // TODO make this function more general
    normalizeFilename(filename) {
      const extension = path.extname(filename);
      let prefix = filename.substring(0, filename.length - extension.length).replaceAll(/[^a-zA-Z0-9]+/g, '-');
      prefix = prefix.length === 0 ? DEFAULT_PREFIX : prefix; // incase all characters are removed

      return `${prefix}${extension}`;
    },

    stream2buffer(stream) {
      return new Promise((resolve, reject) => {
        const _buf = [];

        stream.on('data', (chunk) =>
          _buf.push(chunk));
        stream.on('end', () =>
          resolve(Buffer.concat(_buf)));
        stream.on('error', (err) =>
          reject(err));
      });
    },

    getType(filename) {
      const contentType = mime.getType(filename);
      if (contentType === 'model/gltf-binary') {
        return 'application/octet-stream';
      }
      return contentType;
    },

    getUploadFilePath(filename) {
      return `${UPLOAD_DIR}/${filename}`;
    },

    async uploadFileToIpfs(filename) {
      const filepath = this.getUploadFilePath(filename);
      const readStream = fs.createReadStream(filepath);

      const result = await this.ipfs.add(readStream, { cidVersion: IPFS_CID_VERSION });

      readStream.destroy();
      fs.unlinkSync(filepath); // delete file

      return result;
    },

    async getFileFromIpfs(ipfsClient, ipfsURL) {
      const reader = ipfsClient.cat(ipfsURL2Path(this.isIpfs, ipfsURL));
      // just wrap it with a Readable stream
      return Readable.from(reader);
    },
  },

  async created() {
    this.s3 = new S3({
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_ACCESS_KEY,
      },
    });

    this.ipfsClients = [
      create({ url: process.env.IPFS_GATEWAY, timeout: 60000 }),
      create({ url: process.env.IPFS_GATEWAY_1, timeout: 60000 }),
      create({ url: process.env.IPFS_GATEWAY_2, timeout: 60000 }),
    ];
    this.ipfs = this.ipfsClients[0];
    this.isIpfs = await getIsIpfs();
  },

  async started() {
    await this.waitForServices(['api']);
    await this.broker.call('api.add_queue', { queue_name: 'upload.to_ipfs' });
  },

  async stopped() {
    await this.getQueue('upload.to_ipfs').close();
  },
};
