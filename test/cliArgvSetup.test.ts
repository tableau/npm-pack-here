import * as path from 'path';
import * as cliConstants from '../src/cliConstants';
import { getArgumentsFromArgv } from '../src/getArgumentsFromArgv';
import { getUserGlobalCacheDirectory } from '../src/userDirectories';

const validArgv = {
  target: ['target'],
  destinations: ['destination1', 'destination2'],
  useGlobalCache: false,
  updateRelativeNodeModulesDirectory: false,
  excludedDestinationPaths: cliConstants.defaultExcludedDestinationPaths,
  info: false,
  debug: false,
};

describe(`getArgumentsFromArgv`, () => {
  it(`throws an error if target is not set or is not a string array`, () => {
    const errorMessage = `Expected required argument '${cliConstants.targetProjectArg}' to be an array of paths with at least one path supplied`;
    expect(() => getArgumentsFromArgv({ ...validArgv, target: undefined })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, target: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, target: [] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, target: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, target: ['target-path'] })).not.toThrowError();
  });

  it(`throws an error if destinations is not undefined or not a string array`, () => {
    const errorMessage = `Expected argument '${cliConstants.destinationDirectoriesArg}' to be an array of paths with at least one path supplied`;

    expect(() => getArgumentsFromArgv({ ...validArgv, destinations: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, destinations: [] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, destinations: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, destinations: undefined })).not.toThrowError();

    expect(() => getArgumentsFromArgv({ ...validArgv, destinations: ['some-destination'] })).not.toThrowError();
  });

  it(`throws an error if useGlobalCache is not undefined or not a boolean`, () => {
    const errorMessage = `Expected argument '${cliConstants.packToGlobalLocationArg}' to be a boolean`;

    expect(() => getArgumentsFromArgv({ ...validArgv, useGlobalCache: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, useGlobalCache: [] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, useGlobalCache: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, useGlobalCache: undefined })).not.toThrowError();

    expect(() => getArgumentsFromArgv({ ...validArgv, useGlobalCache: false })).not.toThrowError();
  });

  it(`throws an error if updateRelativeNodeModulesDirectory is undefined or is not a boolean`, () => {
    const errorMessage = `Expected argument '${cliConstants.updateRelativeNodeModulesDirectoryArgument}' to be a boolean`;

    expect(() => getArgumentsFromArgv({ ...validArgv, updateRelativeNodeModulesDirectory: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, updateRelativeNodeModulesDirectory: [] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, updateRelativeNodeModulesDirectory: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, updateRelativeNodeModulesDirectory: undefined })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, updateRelativeNodeModulesDirectory: false })).not.toThrowError();
  });

  it(`throws an error if excludedDestinationPaths is undefined or is not a string array`, () => {
    const errorMessage = `Expected argument '${cliConstants.excludedDestinationPathsArg}' to be an array of globs`;

    expect(() => getArgumentsFromArgv({ ...validArgv, excludedDestinationPaths: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, excludedDestinationPaths: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, excludedDestinationPaths: undefined })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, excludedDestinationPaths: [] })).not.toThrowError();

    expect(() => getArgumentsFromArgv({ ...validArgv, excludedDestinationPaths: ['node_modules'] })).not.toThrowError();
  });

  it(`throws an error if info is undefined or is not a boolean`, () => {
    const errorMessage = `Expected argument '${cliConstants.infoLogLevelArg}' to be a boolean`;

    expect(() => getArgumentsFromArgv({ ...validArgv, info: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, info: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, info: undefined })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, info: false })).not.toThrowError();
  });

  it(`throws an error if debug is undefined or is not a boolean`, () => {
    const errorMessage = `Expected argument '${cliConstants.debugLogLevelArg}' to be a boolean`;

    expect(() => getArgumentsFromArgv({ ...validArgv, debug: 8 })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, debug: [8] })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, debug: undefined })).toThrowError(errorMessage);

    expect(() => getArgumentsFromArgv({ ...validArgv, debug: false })).not.toThrowError();
  });

  describe('logLevel parsing', () => {
    it(`is warning if debug and info are both false`, () => {
      const { logLevel } = getArgumentsFromArgv({ ...validArgv, info: false, debug: false });

      expect(logLevel).toEqual('warning');
    });

    it(`is debug if debug is true`, () => {
      const { logLevel: logLevelWhenInfoIsFalse } = getArgumentsFromArgv({
        ...validArgv,
        info: false,
        debug: true,
      });

      expect(logLevelWhenInfoIsFalse).toEqual('debug');

      const { logLevel: logLevelWhenInfoIsTrue } = getArgumentsFromArgv({
        ...validArgv,
        info: true,
        debug: true,
      });

      expect(logLevelWhenInfoIsTrue).toEqual('debug');
    });

    it(`is info if info is true but debug is false`, () => {
      const { logLevel } = getArgumentsFromArgv({ ...validArgv, info: true, debug: false });

      expect(logLevel).toEqual('info');
    });
  });

  describe('targetProjectDirectoryPaths', () => {
    it(`is the input targets resolved relative to the working directory`, () => {
      const relativeTargetPaths = ['target', 'target2'];
      const workingDirectory = __dirname;
      const { targetProjectDirectoryPaths } = getArgumentsFromArgv({ ...validArgv, target: relativeTargetPaths }, { workingDirectory });

      expect(targetProjectDirectoryPaths).toEqual(relativeTargetPaths.map(targetPath => path.resolve(workingDirectory, targetPath)));
    });
  });

  describe('excludedDestinationPaths', () => {
    it(`is the passed excludedDestinationPathsArgument`, () => {
      const excludedDestinationPathsArgument = ['node_modules', '.git'];
      const { excludedDestinationPaths } = getArgumentsFromArgv({
        ...validArgv,
        excludedDestinationPaths: excludedDestinationPathsArgument,
      });

      expect(excludedDestinationPaths).toEqual(excludedDestinationPathsArgument);
    });
  });

  describe('tryToCopyToLocalNodeModulesDirectory', () => {
    it(`is the passed updateRelativeNodeModulesDirectory`, () => {
      const { tryToCopyToLocalNodeModulesDirectory } = getArgumentsFromArgv({
        ...validArgv,
        updateRelativeNodeModulesDirectory: true,
      });

      expect(tryToCopyToLocalNodeModulesDirectory).toEqual(true);
    });
  });

  describe('maybeDestinationDirectoryToAddDependencyOn and directoriesToCopyTo', () => {
    it(`are set to the global cache location if useGlobalCache is passed`, () => {
      const { maybeDestinationDirectoryToAddDependencyOn, directoriesToCopyTo } = getArgumentsFromArgv({
        ...validArgv,
        useGlobalCache: true,
      });

      expect(maybeDestinationDirectoryToAddDependencyOn).not.toBeUndefined();
      expect(maybeDestinationDirectoryToAddDependencyOn).toEqual(getUserGlobalCacheDirectory().replace(/\\/g, '/'));

      expect(directoriesToCopyTo).toEqual([getUserGlobalCacheDirectory()]);
    });

    it(`are set to local_modules constant if useGlobalCache is undefined and destinations is undefined`, () => {
      const { maybeDestinationDirectoryToAddDependencyOn, directoriesToCopyTo } = getArgumentsFromArgv({
        ...validArgv,
        useGlobalCache: undefined,
        destinations: undefined,
      });

      expect(maybeDestinationDirectoryToAddDependencyOn).not.toBeUndefined();
      expect(maybeDestinationDirectoryToAddDependencyOn).toEqual(path.normalize(cliConstants.defaultLocalModulesFolderPath));

      expect(directoriesToCopyTo).toEqual([path.resolve(cliConstants.defaultLocalModulesFolderPath)]);
    });

    it(`are set to local_modules constant if useGlobalCache is false and destinations is undefined`, () => {
      const { maybeDestinationDirectoryToAddDependencyOn, directoriesToCopyTo } = getArgumentsFromArgv({
        ...validArgv,
        useGlobalCache: false,
        destinations: undefined,
      });

      expect(maybeDestinationDirectoryToAddDependencyOn).not.toBeUndefined();
      expect(maybeDestinationDirectoryToAddDependencyOn).toEqual(path.normalize(cliConstants.defaultLocalModulesFolderPath));

      expect(directoriesToCopyTo).toEqual([path.resolve(cliConstants.defaultLocalModulesFolderPath)]);
    });

    it(`should be set so that the give destination will be copied to but none of them are specified as a location to add a dependency on`, () => {
      const { maybeDestinationDirectoryToAddDependencyOn, directoriesToCopyTo } = getArgumentsFromArgv({
        ...validArgv,
        useGlobalCache: false,
        destinations: ['destination'],
      });

      expect(maybeDestinationDirectoryToAddDependencyOn).toBeUndefined();

      expect(directoriesToCopyTo).toEqual([path.resolve('destination')]);
    });
  });
});
