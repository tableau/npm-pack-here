import * as chokidar from 'chokidar';
import { DelayThenRun } from './delay';
import { Logger } from './logger';
import { packageTargetAndCopyToDestinationDirectories } from './packTargetAndCopyToDestinationDirectories';

export { Logger } from './logger';
export {
  PackageTargetAndCopyToDestinationDirectoriesCall,
  PackageTargetAndCopyToDestinationDirectoriesCalls,
  getPackAndCopyCallsForTargets,
  packageTargetAndCopyToDestinationDirectories,
  executePackageTargetAndCopyToDestinationDirectoriesCalls,
} from './packTargetAndCopyToDestinationDirectories';

export { TargetProjectNameAndAbsolutePath } from './nextStepCliText';

export async function watchForChangesToPackagedFilesAndCopyUpdates(
  absolutePathToTargetProjectDirectory: string,
  absolutePathsToDestinationDirectoriesToCopyTo: string[],
  pathGlobsToExclude: string[],
  logger: Logger
): Promise<void> {
  const countdownLengthInMs = 2000;
  const delayThenRun = DelayThenRun.getInstance(
    countdownLengthInMs,
    async () => {
      await packageTargetAndCopyToDestinationDirectories(
        absolutePathToTargetProjectDirectory,
        absolutePathsToDestinationDirectoriesToCopyTo,
        pathGlobsToExclude,
        logger
      );
    },
    logger
  );

  return new Promise(resolve => {
    chokidar
      .watch(absolutePathToTargetProjectDirectory, {
        cwd: absolutePathToTargetProjectDirectory,
        ignored: pathGlobsToExclude,
        followSymlinks: false,
        ignorePermissionErrors: true,
      })
      .on('add', relativeFilePath => {
        logger.info(() => `add detected - ${relativeFilePath}`);
        delayThenRun.startDelayAndCallbackOrRestartDelayOrSchedulCallbackToBeRunAgain();
      })
      .on('change', relativeFilePath => {
        logger.info(() => `change detected - ${relativeFilePath}`);
        delayThenRun.startDelayAndCallbackOrRestartDelayOrSchedulCallbackToBeRunAgain();
      })
      .on('unlink', relativeFilePath => {
        logger.info(() => `delete detected - ${relativeFilePath}`);
        delayThenRun.startDelayAndCallbackOrRestartDelayOrSchedulCallbackToBeRunAgain();
      })
      .on('ready', () => {
        logger.log(() => `Watching for changes to packed files in - ${absolutePathToTargetProjectDirectory}`);
        resolve();
      })
      .on('error', error => {
        throw error;
      });
  });
}
