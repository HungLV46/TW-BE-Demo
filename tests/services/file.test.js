jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3: class S3 {
      // eslint-disable-next-line class-methods-use-this
      send() {}

      // eslint-disable-next-line class-methods-use-this
      headObject() {}
    },
    PutObjectCommand: class PutObjectCommand {},
  };
});

const { ServiceBroker, Context } = require('moleculer');
const ApiServiceSchema = require('@services/api.service');
const FileServiceSchema = require('@services/file.service');

const crypto = require('crypto');
const Readable = require('stream').Readable;
const { sleep } = require('../helpers/test-utility');

describe('Test File', () => {
  let broker = new ServiceBroker({ logger: false });
  const context = new Context(broker, { logger: false });
  broker.createService(ApiServiceSchema);
  const fileService = broker.createService(FileServiceSchema);
  jest.spyOn(fileService.s3, 'send');

  beforeAll(async () => {
    await broker.start();
  });

  afterAll(async () => {
    await broker.stop();
  });

  describe('Test POST /upload/photos', () => {
    it('Upload ipfs success, random filename by default', async () => {
      // setup
      const filename = 'testfile.jpg';
      context.meta.filename = filename;
      const testString = crypto.randomBytes(8).toString('base64');
      const readable = new Readable();
      readable.push(testString);
      readable.push(null);

      // execute.
      const result = await context.call('file.save', readable);

      // verify.
      const expectedPrefix = 'https://S3DummyBucket.s3.S3DummyRegion.amazonaws.com/S3DummyFolder/';
      expect(result.startsWith(expectedPrefix)).toBeTruthy();
      expect(result.slice(expectedPrefix.length)).not.toBe(filename);

      expect(fileService.s3.send).toHaveBeenCalledTimes(1);
    }, 100000);

    it('Unsupported file extension, normalize original filename', async () => {
      const filename = 'Test%&^#&$#*$&    File2.jpg';
      context.meta.filename = filename;
      context.meta.keep_original_filename = true;
      const testString = crypto.randomBytes(8).toString('base64');
      const readable = new Readable();
      readable.push(testString);
      readable.push(null);

      // execute.
      const result = await context.call('file.save', readable);

      // verify.
      const expectedPrefix = 'https://S3DummyBucket.s3.S3DummyRegion.amazonaws.com/S3DummyFolder/';
      expect(result.startsWith(expectedPrefix)).toBeTruthy();
      expect(result.slice(expectedPrefix.length)).toBe('Test-File2.jpg');

      expect(fileService.s3.send).toHaveBeenCalledTimes(1);
    }, 100000);

    it('Unsupported file extension, only generate URL', async () => {
      const filename = 'Test%&^#&$#*$&    File2.jpg';
      context.meta.filename = filename;
      context.meta.keep_original_filename = true;
      context.meta.url_only = true;
      const testString = crypto.randomBytes(8).toString('base64');
      const readable = new Readable();
      readable.push(testString);
      readable.push(null);

      // execute.
      const result = await context.call('file.save', readable);

      // verify.
      const expectedPrefix = 'https://S3DummyBucket.s3.S3DummyRegion.amazonaws.com/S3DummyFolder/';
      expect(result.startsWith(expectedPrefix)).toBeTruthy();
      expect(result.slice(expectedPrefix.length)).toBe('Test-File2.jpg');

      expect(fileService.s3.send).not.toHaveBeenCalled();
    }, 100000);
  });

  describe('Test POST /upload/ipfs/photos', () => {
    it('Upload ipfs success', async () => {
      // setup
      context.meta.filename = 'testfile.jpg';
      const testString = crypto.randomBytes(8).toString('base64');
      const readable = new Readable();
      readable.push(testString);
      readable.push(null);

      // execute.
      const result = await context.call('file.ipfs_save', readable);

      await sleep(1000);
      // verify.
      expect(result.ipfs_path.length).toBeGreaterThan(0);

      const readable2 = await fileService.ipfs.cat(result.ipfs_path); // verify uploaded to ipfs
      expect((await readable2.next()).value.toString()).toBe(testString);
    }, 100000);

    it('Unsupported file extension', async () => {
      try {
        // setup.
        context.meta.filename = 'testfile.txt';
        const readable = Readable.from(['testString']);

        // execute.
        await context.call('file.ipfs_save', readable);
      } catch (error) {
        // verify.
        expect(error.code).toBe(422);
        expect(error.message).toBe('Unsupported file extension!');
      }
    }, 100000);
  });
});
