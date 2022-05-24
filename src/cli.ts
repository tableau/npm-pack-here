#!/usr/bin/env node

import * as path from 'path';
import * as yargs from 'yargs';
import {
  executePackageTargetAndCopyToDestinationDirectoriesCalls,
  getPackAndCopyCallsForTargets,
  watchForChangesToPackagedFilesAndCopyUpdates,
} from '.';
import * as cliConstants from './cliConstants';
import { fileSystemOperations } from './fileSystemOperations';
import { ExpectedArguments, getArgumentsFromArgv } from './getArgumentsFromArgv';
import { getLoggerInstance, Logger } from './logger';
import { maybeOutputNextStepsText } from './nextStepCliText';
import { tryGetProjectPackageJsonContent } from './packageJson';
import { PackageTargetAndCopyToDestinationDirectoriesCalls } from './packTargetAndCopyToDestinationDirectories';
import { prettyPrintError } from './prettyPrintError';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

// tslint:disable-next-line:no-unused-expression
yargs
  // add the --version and --help parameters
  .version()
  .alias(cliConstants.versionArg, 'v')
  .help()
  .alias(cliConstants.helpArg, 'h')
  .group([cliConstants.versionArg, cliConstants.helpArg], 'Global:')
  // don't accept any unknown commands or arguments
  .strict()
  // by default wrapping happens at column 80, which is a little too small
  // we wrap source code at 120 lines, let's use that
  .wrap(Math.min(120, yargs.terminalWidth()))
  // print failures in a pretty red color
  .fail((msg: string, err: Error) => {
    yargs.showHelp();
    getLoggerInstance('warning').error(() => prettyPrintError(msg, err));
    process.exit(1);
  })
  .command(
    '*',
    cliConstants.baseDescriptionString,
    cmdYargs => {
      return cmdYargs
        .option(cliConstants.targetProjectArg, cliConstants.targetProjectOptionsParams)
        .option(cliConstants.destinationDirectoriesArg, cliConstants.destinationDirectoriesOptions)
        .option(cliConstants.packToGlobalLocationArg, cliConstants.packToGlobalLocationOptions)
        .option(cliConstants.updateRelativeNodeModulesDirectoryArgument, cliConstants.updateRelativeNodeModulesDirectoryOptions)
        .option(cliConstants.excludedDestinationPathsArg, cliConstants.excludedDestinationPathsOptions)
        .option(cliConstants.infoLogLevelArg, cliConstants.infoLogLevelArgOptions)
        .option(cliConstants.debugLogLevelArg, cliConstants.debugLogLevelArgOptions);
    },
    async argv => {
      await performFirstPackAndCopyToCallForGivenArguments(true /* outputPostCommandMessages */, argv);
    }
  )
  .command(
    cliConstants.watchCommandArg,
    `Continually ${cliConstants.baseDescriptionString.toLowerCase()}`,
    cmdYargs => {
      return cmdYargs
        .option(cliConstants.targetProjectArg, cliConstants.targetProjectOptionsParams)
        .option(cliConstants.destinationDirectoriesArg, cliConstants.destinationDirectoriesOptions)
        .option(cliConstants.packToGlobalLocationArg, cliConstants.packToGlobalLocationOptions)
        .option(cliConstants.updateRelativeNodeModulesDirectoryArgument, cliConstants.updateRelativeNodeModulesDirectoryOptions)
        .option(cliConstants.excludedDestinationPathsArg, cliConstants.excludedDestinationPathsOptions)
        .option(cliConstants.infoLogLevelArg, cliConstants.infoLogLevelArgOptions)
        .option(cliConstants.debugLogLevelArg, cliConstants.debugLogLevelArgOptions);
    },
    async argv => {
      const { packAndCopyCalls, excludedDestinationPaths, logger } = await performFirstPackAndCopyToCallForGivenArguments(
        false /* outputPostCommandMessages */,
        argv
      );

      const watchOperations = packAndCopyCalls.map(async packAndCopyCall => {
        return await watchForChangesToPackagedFilesAndCopyUpdates(
          packAndCopyCall.absolutePathToTargetProjectDirectory,
          packAndCopyCall.absolutePathsToDestinationDirectoriesToCopyTo,
          excludedDestinationPaths,
          logger
        );
      });
      await Promise.all(watchOperations);

      const exitCommand = process.platform === 'darwin' ? '`⌘ + c`' : '`ctrl + c`';
      logger.info(() => `Watch started, ${exitCommand} to exit`);
    }
  ).argv;

function doesPackageLockFileExist(): Promise<boolean> {
  const absolutePathToDestinationProjectPackageLock = path.resolve('package-lock.json');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectPackageLock);
}

function doesYarnLockFileExist(): Promise<boolean> {
  const absolutePathToDestinationProjectYarnLock = path.resolve('yarn.lock');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectYarnLock);
}

function doesYarnrcYmlFileExist(): Promise<boolean> {
  const absolutePathToDestinationProjectYarnrcYml = path.resolve('.yarnrc.yml');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectYarnrcYml);
}

async function performFirstPackAndCopyToCallForGivenArguments(
  outputPostCommandMessages: boolean,
  argv: ExpectedArguments
): Promise<{
  packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls;
  excludedDestinationPaths: string[];
  logger: Logger;
}> {
  const {
    targetProjectDirectoryPaths,
    directoriesToCopyTo,
    excludedDestinationPaths,
    tryToCopyToLocalNodeModulesDirectory,
    maybeDestinationDirectoryToAddDependencyOn,
    logLevel,
  } = getArgumentsFromArgv(argv);

  const logger = getLoggerInstance(logLevel);

  const { packAndCopyCalls, rootTargets } = await getPackAndCopyCallsForTargets(
    targetProjectDirectoryPaths,
    directoriesToCopyTo,
    tryToCopyToLocalNodeModulesDirectory,
    logger
  );

  await executePackageTargetAndCopyToDestinationDirectoriesCalls(excludedDestinationPaths, logger, packAndCopyCalls);

  await maybeOutputNextStepsText(
    maybeDestinationDirectoryToAddDependencyOn,
    rootTargets,
    outputPostCommandMessages,
    logger,
    process.cwd(),
    doesPackageLockFileExist,
    doesYarnLockFileExist,
    doesYarnrcYmlFileExist,
    () => tryGetProjectPackageJsonContent(path.resolve('./'))
  );

  return { packAndCopyCalls, excludedDestinationPaths, logger };
}
