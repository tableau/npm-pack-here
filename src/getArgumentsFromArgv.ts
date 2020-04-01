import * as path from 'path';
import * as cliConstants from './cliConstants';
import { getLogLevel, LogLevel } from './logLevel';
import { getUserGlobalCacheDirectory } from './userDirectories';

export interface ExpectedArguments {
  target: unknown;
  destinations: unknown;
  useGlobalCache: unknown;
  updateRelativeNodeModulesDirectory: unknown;
  excludedDestinationPaths: unknown;
  info: unknown;
  debug: unknown;
}

export interface GetArgumentsFromArgvOptions {
  workingDirectory: string;
}

export function getArgumentsFromArgv(
  argv: ExpectedArguments,
  options?: GetArgumentsFromArgvOptions
): {
  targetProjectDirectoryPaths: string[];
  directoriesToCopyTo: string[];
  excludedDestinationPaths: string[];
  tryToCopyToLocalNodeModulesDirectory: boolean;
  maybeDestinationDirectoryToAddDependencyOn?: string;
  logLevel: LogLevel;
} {
  const givenOrDefaultOptions = options || { workingDirectory: process.cwd() };

  const target = argv.target;
  if (!isArrayOfStringsWithAtLeastOneString(target)) {
    throw new Error(
      `Expected required argument '${cliConstants.targetProjectArg}' to be an array of paths with at least one path supplied`
    );
  }

  const givenDestinationDirectories = argv.destinations;
  if (!(givenDestinationDirectories === undefined || isArrayOfStringsWithAtLeastOneString(givenDestinationDirectories))) {
    throw new Error(
      `Expected argument '${cliConstants.destinationDirectoriesArg}' to be an array of paths with at least one path supplied`
    );
  }

  const givenUseGlobalCacheOption = argv.useGlobalCache;
  if (!(givenUseGlobalCacheOption === undefined || typeof givenUseGlobalCacheOption === 'boolean')) {
    throw new Error(`Expected argument '${cliConstants.packToGlobalLocationArg}' to be a boolean`);
  }

  const givenUpdateRelativeNodeModulesDirectoryOptionValue = argv.updateRelativeNodeModulesDirectory;
  if (
    givenUpdateRelativeNodeModulesDirectoryOptionValue === undefined ||
    typeof givenUpdateRelativeNodeModulesDirectoryOptionValue !== 'boolean'
  ) {
    throw new Error(`Expected argument '${cliConstants.updateRelativeNodeModulesDirectoryArgument}' to be a boolean`);
  }

  const givenExcludedDestinationPaths = argv.excludedDestinationPaths;
  if (!isEmptyArrayOrAnArrayOfStrings(givenExcludedDestinationPaths)) {
    throw new Error(`Expected argument '${cliConstants.excludedDestinationPathsArg}' to be an array of globs`);
  }

  const shouldLogAtInfo = argv.info;
  if (shouldLogAtInfo === undefined || typeof shouldLogAtInfo !== 'boolean') {
    throw new Error(`Expected argument '${cliConstants.infoLogLevelArg}' to be a boolean`);
  }

  const shouldLogAtDebug = argv.debug;
  if (shouldLogAtDebug === undefined || typeof shouldLogAtDebug !== 'boolean') {
    throw new Error(`Expected argument '${cliConstants.debugLogLevelArg}' to be a boolean`);
  }

  const targetProjectDirectoryPaths = target.map(targetProjectPath =>
    path.resolve(givenOrDefaultOptions.workingDirectory, targetProjectPath)
  );

  const { destinationDirectories: directoriesToCopyTo, maybeDestinationDirectoryToAddDependencyOn } = getDestinationDirectories(
    givenDestinationDirectories,
    givenUseGlobalCacheOption,
    givenOrDefaultOptions.workingDirectory
  );

  const logLevel = getLogLevel(shouldLogAtInfo, shouldLogAtDebug);

  return {
    targetProjectDirectoryPaths,
    directoriesToCopyTo,
    excludedDestinationPaths: givenExcludedDestinationPaths,
    tryToCopyToLocalNodeModulesDirectory: givenUpdateRelativeNodeModulesDirectoryOptionValue,
    maybeDestinationDirectoryToAddDependencyOn,
    logLevel,
  };
}

function isArrayOfStringsWithAtLeastOneString(array: unknown): array is string[] {
  return array !== undefined && Array.isArray(array) && array.length > 0 && typeof array[0] === 'string';
}

function isEmptyArrayOrAnArrayOfStrings(array: unknown): array is string[] {
  return array !== undefined && Array.isArray(array) && (array.length === 0 || (array.length > 0 && typeof array[0] === 'string'));
}

function getDestinationDirectories(
  givenDestinationDirectories: string[] | undefined,
  givenUseGlobalCacheValue: boolean | undefined,
  workingDirectory: string
): {
  destinationDirectories: string[];
  maybeDestinationDirectoryToAddDependencyOn?: string;
} {
  const ensurePathUsesForwardSlashes = (somePath: string) => {
    if (process.platform === 'win32') {
      return path.normalize(somePath).replace(/\\/g, '/');
    }
    return path.normalize(somePath);
  };
  const resolvePaths = (destinationDirectory: string) => path.resolve(workingDirectory, destinationDirectory);

  if (givenUseGlobalCacheValue !== undefined && givenUseGlobalCacheValue === true) {
    const globalCacheLocation = getUserGlobalCacheDirectory();
    return {
      destinationDirectories: [globalCacheLocation].map(resolvePaths),
      maybeDestinationDirectoryToAddDependencyOn: ensurePathUsesForwardSlashes(globalCacheLocation),
    };
  }

  return givenDestinationDirectories !== undefined
    ? { destinationDirectories: givenDestinationDirectories.map(resolvePaths) }
    : {
        destinationDirectories: cliConstants.defaultDestinationDirectories.map(resolvePaths),
        maybeDestinationDirectoryToAddDependencyOn: ensurePathUsesForwardSlashes(cliConstants.defaultLocalModulesFolderPath),
      };
}
