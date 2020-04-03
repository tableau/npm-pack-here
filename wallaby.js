module.exports = function(_wallaby) {
  const testFiles = 'test/**/*.test.ts';

  return {
    files: ['src/**/*.ts', 'test/**/*.ts', `!${testFiles}`],
    
    // some of the tests do file system operations so don't run them as part of wallaby
    tests: [
      testFiles,
      '!test/endToEnd.test.ts',
      '!test/replaceDirectoryContentsWithFiles.test.ts',
      '!test/packTargetAndCopyToDestinationDirectories.test.ts'
    ],

    env: {
      type: 'node',
      runner: 'node',
    },

    testFramework: 'jasmine',
  };
};
