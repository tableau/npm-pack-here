import * as path from 'path';

export async function validateThatTargetCanBePackagedAndCopiedToDestination(
  absolutePathToTargetProjectDirectory: string,
  absolutePathsToDestinationDirectories: string[],
  targetProjectPackageJsonContent: { name?: unknown }
): Promise<{
  absolutePathsToDestinationDirectoriesToCopyTo: string[];
  targetProjectName: string;
}> {
  const packageName: unknown | undefined = targetProjectPackageJsonContent.name;

  if (packageName === undefined || typeof packageName !== 'string') {
    throw new Error(
      `Could not get target package name from package.json in '${absolutePathToTargetProjectDirectory}', check that this is a valid package.json.`
    );
  }

  const invalidDestinationDirectories = absolutePathsToDestinationDirectories.filter(destinationDirectoryToCopyTo => {
    const relativePathFromTargetToDestination = path.relative(absolutePathToTargetProjectDirectory, destinationDirectoryToCopyTo);
    return !relativePathFromTargetToDestination.startsWith('..') && !path.isAbsolute(relativePathFromTargetToDestination);
  });
  if (invalidDestinationDirectories.length > 0) {
    throw new Error(
      `Cannot set destination directories as a child of the target project directory.\n` +
        `These directories are invalid [${invalidDestinationDirectories.join(', ')}].`
    );
  }

  const absolutePathsToDestinationDirectoriesToCopyTo = absolutePathsToDestinationDirectories.map(directoryPath =>
    path.join(directoryPath, packageName)
  );

  return { absolutePathsToDestinationDirectoriesToCopyTo, targetProjectName: packageName };
}
