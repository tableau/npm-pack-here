import { fromNullable, isSome, none, Option, some } from 'fp-ts/lib/Option';
import * as npmPackList from 'npm-packlist';
import * as path from 'path';
import { FileSystemAbsolutePath } from './fileSystemAbsolutePath';
import { fileSystemOperations } from './fileSystemOperations';
import { Logger } from './logger';
import { TargetProjectNameAndAbsolutePath, TargetProjectsNameAndAbsolutePaths } from './nextStepCliText';
import { tryGetProjectPackageJsonContent } from './packageJson';
import { replaceDirectoryContentsWithFiles } from './replaceDirectoryContentsWithFiles';
import { validateThatTargetCanBePackagedAndCopiedToDestination } from './validateThatTargetCanBePackagedAndCopiedToDestination';

export interface PackageTargetAndCopyToDestinationDirectoriesCall {
  absolutePathToTargetProjectDirectory: string;
  absolutePathsToDestinationDirectoriesToCopyTo: string[];
}

export type PackageTargetAndCopyToDestinationDirectoriesCalls = Array<PackageTargetAndCopyToDestinationDirectoriesCall>;

export async function packageTargetAndCopyToDestinationDirectories(
  absolutePathToTargetProjectDirectory: string,
  absolutePathsToDestinationDirectoriesToCopyTo: string[],
  pathGlobsToExclude: string[],
  logger: Logger
): Promise<void> {
  const destinationDirectoriesToCopyTo = absolutePathsToDestinationDirectoriesToCopyTo.map(destinationDirectoryAbsolutePath =>
    FileSystemAbsolutePath.getInstance(destinationDirectoryAbsolutePath, fileSystemOperations)
  );
  const sourceDirectoryToCopyFrom = FileSystemAbsolutePath.getInstance(absolutePathToTargetProjectDirectory, fileSystemOperations);

  const statusToOutput = destinationDirectoriesToCopyTo.reduce((messageSoFar, currentDirectoryPath) => {
    return `${messageSoFar}\n  to - ${currentDirectoryPath.AbsolutePath}`;
  }, `Copying packed files\n  from - ${sourceDirectoryToCopyFrom.AbsolutePath}`);
  logger.log(() => statusToOutput);

  logger.info(() => `calling npmPackList to get files to pack`);

  const relativePathsOfFilesToCopy = await npmPackList({ path: sourceDirectoryToCopyFrom.AbsolutePath });

  logger.info(() => `finished calling npmPackList in ${sourceDirectoryToCopyFrom.AbsolutePath}`);
  logger.debug(() => `[${relativePathsOfFilesToCopy.join(',\n')}]`);

  await replaceDirectoryContentsWithFiles(
    sourceDirectoryToCopyFrom,
    destinationDirectoriesToCopyTo,
    relativePathsOfFilesToCopy,
    logger,
    pathGlobsToExclude
  );

  logger.success(() => `Done copying packed files from - ${absolutePathToTargetProjectDirectory}`);
}

export async function getPackAndCopyCallsForTargets(
  targetProjectDirectoryPaths: string[],
  directoriesToCopyTo: string[],
  tryToCopyToLocalNodeModulesDirectory: boolean,
  logger: Logger,
  workingDirectory: string = process.cwd()
): Promise<{ packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls; rootTargets: TargetProjectsNameAndAbsolutePaths }> {
  const operationsToGetRootTargetsAndPackAndCopyCalls = targetProjectDirectoryPaths.map(async targetProjectDirectoryPath =>
    getPackAndCopyCallsForTarget(
      targetProjectDirectoryPath,
      directoriesToCopyTo,
      tryToCopyToLocalNodeModulesDirectory,
      logger,
      workingDirectory
    )
  );

  const rootTargetsAndPackAndCopyCalls = await Promise.all(operationsToGetRootTargetsAndPackAndCopyCalls);

  const allPackAndCopyCalls = rootTargetsAndPackAndCopyCalls.reduce((aggregatedPackAndCopyCalls, currentTargetProject) => {
    return aggregatedPackAndCopyCalls.concat(...currentTargetProject.packAndCopyCalls);
  }, [] as PackageTargetAndCopyToDestinationDirectoriesCalls);

  const reducedPackAndCopyCalls = mergeAndRemoveDuplicatePackAndCopyCalls(allPackAndCopyCalls);

  assertThatNoDuplicateDestinationDirectoriesExist(reducedPackAndCopyCalls);

  return {
    packAndCopyCalls: reducedPackAndCopyCalls,
    rootTargets: rootTargetsAndPackAndCopyCalls.map(rootTargetAndPackAndCopyCalls => rootTargetAndPackAndCopyCalls.rootTarget),
  };
}

async function getPackAndCopyCallsForTarget(
  targetProjectDirectoryPath: string,
  directoriesToCopyTo: string[],
  tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory: boolean,
  logger: Logger,
  workingDirectory: string
): Promise<{ rootTarget: TargetProjectNameAndAbsolutePath; packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls }> {
  const targetPackageJsonContent = await tryGetProjectPackageJsonContent(targetProjectDirectoryPath);

  if (targetPackageJsonContent.isNone()) {
    throw new Error(`No npm project at given target location '${targetProjectDirectoryPath}', check that the given path is correct.`);
  }

  const { absolutePathsToDestinationDirectoriesToCopyTo, targetProjectName } = await validateThatTargetCanBePackagedAndCopiedToDestination(
    targetProjectDirectoryPath,
    directoriesToCopyTo,
    targetPackageJsonContent.value
  );

  const maybeNodeModulesDirectoryToCopyTo = await tryGetNodeModulesDestinationDirectory(
    tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory,
    targetProjectName,
    logger,
    workingDirectory
  );

  const nodeModulesDirectoriesToCopyTo = maybeNodeModulesDirectoryToCopyTo.map(directory => [directory]).getOrElse([]);

  const packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls = [
    {
      absolutePathToTargetProjectDirectory: targetProjectDirectoryPath,
      absolutePathsToDestinationDirectoriesToCopyTo: absolutePathsToDestinationDirectoriesToCopyTo.concat(nodeModulesDirectoriesToCopyTo),
    },
  ];

  if (maybeNodeModulesDirectoryToCopyTo.isSome()) {
    const childDependencyPackOperations = await getProjectsLocalDependenciesPackAndCopyCalls(
      targetProjectDirectoryPath,
      maybeNodeModulesDirectoryToCopyTo.value,
      logger
    );

    packAndCopyCalls.push(
      ...childDependencyPackOperations.map(childDependencyPackOperation => {
        return {
          absolutePathToTargetProjectDirectory: childDependencyPackOperation.targetProjectPath,
          absolutePathsToDestinationDirectoriesToCopyTo: [childDependencyPackOperation.nodeModulesDestinationPath],
        };
      })
    );
  }

  return {
    rootTarget: {
      targetProjectAbsolutePath: targetProjectDirectoryPath,
      targetProjectName: targetProjectName,
    },
    packAndCopyCalls: packAndCopyCalls,
  };
}

export async function executePackageTargetAndCopyToDestinationDirectoriesCalls(
  excludedDestinationPaths: string[],
  logger: Logger,
  packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls
): Promise<void> {
  const packAndCopyOperations = packAndCopyCalls.map(call =>
    packageTargetAndCopyToDestinationDirectories(
      call.absolutePathToTargetProjectDirectory,
      call.absolutePathsToDestinationDirectoriesToCopyTo,
      excludedDestinationPaths,
      logger
    )
  );

  await Promise.all(packAndCopyOperations);
}

async function tryGetNodeModulesDestinationDirectory(
  shouldPerformSearch: boolean,
  targetProjectName: string,
  logger: Logger,
  workingDirectory: string
): Promise<Option<string>> {
  if (shouldPerformSearch === false) {
    return none;
  }

  const localPackageJsonContent = await tryGetProjectPackageJsonContent(workingDirectory);

  return localPackageJsonContent
    .chain(content => {
      const targetIsDependency = content.dependencies !== undefined && content.dependencies[targetProjectName] !== undefined;
      const targetIsDevDependency = content.devDependencies !== undefined && content.devDependencies[targetProjectName] !== undefined;
      return targetIsDependency || targetIsDevDependency ? some(true) : none;
    })
    .chain(() => {
      return tryGetNodeModulesDirectoryPathForTargetDependency(targetProjectName, workingDirectory, logger);
    })
    .map(foundPathToTargetProjectInNodeModules => {
      const relativePathToFoundPath = path.relative(workingDirectory, foundPathToTargetProjectInNodeModules);
      if (relativePathToFoundPath.startsWith('..') || path.isAbsolute(relativePathToFoundPath)) {
        throw new Error(
          `Tried to find the node_modules location to place packed content for '${targetProjectName}' but instead` +
            ` found a location '${foundPathToTargetProjectInNodeModules}' not contained within '${workingDirectory}'` +
            `\nNote: this is a super common error when running 'npm-pack-here' after` +
            ` yarn link or npm link have been used in the past,` +
            ` to resolve this try unlinking '${targetProjectName}' from within '${workingDirectory}'.`
        );
      }
      return foundPathToTargetProjectInNodeModules;
    });
}

function tryGetNodeModulesDirectoryPathForTargetDependency(
  targetDependency: string,
  pathToSearchFrom: string,
  logger: Logger
): Option<string> {
  try {
    const pathToTargetProjectPackageJsonInNodeModulesDirectory = require.resolve(path.posix.join(targetDependency, 'package.json'), {
      paths: [pathToSearchFrom],
    });

    return some(path.dirname(pathToTargetProjectPackageJsonInNodeModulesDirectory));
  } catch (error) {
    logger.warning(
      () =>
        `Tried to find target package '${targetDependency}' location in the node_modules directory but failed\n` +
        `this likely means you need to run yarn/npm install to populate the node_modules directory`
    );
  }

  return none;
}

async function getProjectsLocalDependenciesPackAndCopyCalls(
  projectDirectory: string,
  projectsLocationInNodeModulesDirectory: string,
  logger: Logger
): Promise<
  {
    targetProjectPath: string;
    nodeModulesDestinationPath: string;
  }[]
> {
  const maybePackageJson = await tryGetProjectPackageJsonContent(projectDirectory);

  if (maybePackageJson.isNone()) {
    throw new Error(
      `Failed to find expected package.json in '${projectDirectory}' when attempting to find child dependency local dependencies`
    );
  }

  const maybeDependencies = fromNullable(maybePackageJson.value.dependencies);

  if (maybeDependencies.isNone()) {
    return [];
  }

  const localDependencies = Object.keys(maybeDependencies.value)
    .map(dependency => ({
      name: dependency,
      version: maybeDependencies.value[dependency] as string,
    }))
    .filter(dependency => {
      return dependency.version.startsWith('file:');
    })
    .map(dependency => {
      return {
        targetProjectName: dependency.name,
        targetProjectPath: path.resolve(projectDirectory, dependency.version.substring(5)),
      };
    })
    .map(dependency => {
      const maybeNodeModulesDestinationPath = tryGetNodeModulesDirectoryPathForTargetDependency(
        dependency.targetProjectName,
        projectsLocationInNodeModulesDirectory,
        logger
      );

      return maybeNodeModulesDestinationPath.map(nodeModulesDestinationPath => ({
        nodeModulesDestinationPath,
        ...dependency,
      }));
    })
    .filter(isSome)
    .map(dependency => dependency.value)
    .map(dependency => ({
      targetProjectPath: dependency.targetProjectPath,
      nodeModulesDestinationPath: dependency.nodeModulesDestinationPath,
    }));

  const childDependencies = await Promise.all(
    localDependencies.map(({ targetProjectPath, nodeModulesDestinationPath }) => {
      return getProjectsLocalDependenciesPackAndCopyCalls(targetProjectPath, nodeModulesDestinationPath, logger);
    })
  );

  return localDependencies.concat(...childDependencies);
}

function mergeAndRemoveDuplicatePackAndCopyCalls(
  packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls
): PackageTargetAndCopyToDestinationDirectoriesCalls {
  const targetToDestinationsMap = packAndCopyCalls.reduce((aggregate, current) => {
    const valueInAggregate =
      aggregate[current.absolutePathToTargetProjectDirectory] !== undefined ? aggregate[current.absolutePathToTargetProjectDirectory] : [];
    const destinationDirectories = removeDuplicates(
      [...valueInAggregate, ...current.absolutePathsToDestinationDirectoriesToCopyTo],
      (value1, value2) => {
        return value1 === value2;
      }
    );

    return {
      ...aggregate,
      [current.absolutePathToTargetProjectDirectory]: destinationDirectories,
    };
  }, {} as { [target: string]: string[] });

  return Object.entries(targetToDestinationsMap).map(([target, destinations]) => {
    return {
      absolutePathToTargetProjectDirectory: target,
      absolutePathsToDestinationDirectoriesToCopyTo: destinations,
    };
  });
}

function removeDuplicates<T>(values: T[], isEqualFunction: (value1: T, value2: T) => boolean): T[] {
  const result: T[] = [];

  values.forEach(valueToAddIfNotAlreadyPresent => {
    const maybeDuplicate = result.find(existingResult => isEqualFunction(existingResult, valueToAddIfNotAlreadyPresent));
    if (maybeDuplicate === undefined) {
      result.push(valueToAddIfNotAlreadyPresent);
    }
  });

  return result;
}

function assertThatNoDuplicateDestinationDirectoriesExist(packAndCopyCalls: PackageTargetAndCopyToDestinationDirectoriesCalls): void {
  const destinationToTargetMap = packAndCopyCalls
    .map(packAndCopyCall => {
      return packAndCopyCall.absolutePathsToDestinationDirectoriesToCopyTo.map(destination => {
        return {
          destination: destination,
          target: packAndCopyCall.absolutePathToTargetProjectDirectory,
        };
      });
    })
    .reduce((aggregate, current) => [...aggregate, ...current], [])
    .reduce((aggregate, current) => {
      const valueInAggregate = aggregate[current.destination] !== undefined ? aggregate[current.destination] : [];
      return { ...aggregate, [current.destination]: [...valueInAggregate, current.target] };
    }, {} as { [destination: string]: string[] });

  const maybeErrorMessages = Object.entries(destinationToTargetMap)
    .map(([destination, targets]) => {
      if (targets.length > 1) {
        return `multiple targets are trying to pack to destination '${destination}', targets: [${targets.join(', ')}]`;
      }
      return null;
    })
    .filter((value: string | null): value is string => value !== null);

  if (maybeErrorMessages.length > 0) {
    throw new Error(maybeErrorMessages.join('\n'));
  }
}
