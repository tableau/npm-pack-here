import { none, Option, some } from 'fp-ts/lib/Option';
import * as path from 'path';
import { fileSystemOperations } from './fileSystemOperations';

export type PackageJsonContent = {
  name?: unknown;
  dependencies?: { [name: string]: string | undefined };
  devDependencies?: { [name: string]: string | undefined };
};

export async function tryGetProjectPackageJsonContent(absolutePathToProjectDirectory: string): Promise<Option<PackageJsonContent>> {
  const doesTargetProjectDirectoryPathExist = await fileSystemOperations.pathExists(absolutePathToProjectDirectory);
  if (!doesTargetProjectDirectoryPathExist) {
    return none;
  }

  const targetProjectPackageJsonPath = path.join(absolutePathToProjectDirectory, 'package.json');
  const isTargetProjectAnNpmProject = await fileSystemOperations.pathExists(targetProjectPackageJsonPath);

  return isTargetProjectAnNpmProject
    ? some((await fileSystemOperations.readJson(targetProjectPackageJsonPath)) as PackageJsonContent)
    : none;
}
