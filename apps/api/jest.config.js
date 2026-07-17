module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreCodes: [151001] } }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@content-hub/platform-sdk$': '<rootDir>/../../packages/platform-sdk/src/index.ts',
    '^@content-hub/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.service.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 80,
      lines: 80,
      statements: 85,
    },
  },
};
