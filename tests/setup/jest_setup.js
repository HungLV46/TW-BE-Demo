const path = require('path');
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

// blockchain
process.env.CHAIN_ID = 'local';

// IPFS server
process.env.IPFS_GATEWAY = 'http://localhost:5001';
process.env.IPFS_GATEWAY_1 = 'http://localhost:5001';
process.env.IPFS_GATEWAY_2 = 'http://localhost:5001';

process.env.S3_BUCKET = 'S3DummyBucket';
process.env.S3_REGION = 'S3DummyRegion';
process.env.S3_BUCKET_FOLDER = 'S3DummyFolder';
process.env.S3_DOMAIN_NAME = 'S3DummyBucket.s3.S3DummyRegion.amazonaws.com';

// TODO Remove when dynamic import can be used freely without failing jest test
jest.mock('@helpers/ipfs/is_ipfs_getter');

process.env.HOROSCOPE_GRAPHQL_URL = 'https://horoscope.example.com/graphql';
process.env.HOROSCOPE_DATABASE_NAME = 'test_database';
