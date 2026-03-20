/**
 * This file is executed after jest environment setup and before each test files.
 */
const { createClient } = require('redis');
const queueConfig = require('@config/queue').QueueConfig;

const redisClient = createClient({ url: queueConfig.url });

beforeAll(async () => {
  await redisClient.connect();
  // Flush redis DB before each test file. Due to the suspection that unfinished jobs left over after running each test file
  // are causing failures in subsequence ones.
  await redisClient.flushDb();
}, 3000);

afterAll(async () => {
  await redisClient.disconnect();
}, 3000);
