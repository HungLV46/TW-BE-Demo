const { defaults } = require('jest-config');

module.exports = {
  clearMocks: true,
  coverageDirectory: './coverage',
  coverageReporters: ['lcov', 'text'],
  coveragePathIgnorePatterns: ['/node_modules', '<rootDir>/seeds/', '<rootDir>/tests/', '<rootDir>/config/', '<rootDir>/services/api.service.js'],
  globalSetup: '<rootDir>/tests/setup/jest_global_setup.js',
  globalTeardown: '<rootDir>/tests/setup/jest_global_teardown.js',
  setupFiles: ['<rootDir>/tests/setup/jest_setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest_setup_after_env.js'],
  rootDir: '.',
  testPathIgnorePatterns: ['sample.*'],
  roots: ['./tests'],
  moduleNameMapper: {
    '@root': '.',
    '^@models(.*)$': '<rootDir>/app/models$1',
    '^@helpers(.*)$': '<rootDir>/app/helpers$1',
    '^@mixins(.*)$': '<rootDir>/mixins$1',
    '^@services(.*)$': '<rootDir>/services$1',
    '^@config(.*)$': '<rootDir>/config$1',
  },
};
