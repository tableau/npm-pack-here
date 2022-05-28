import * as path from 'path';
import { fileSystemOperations } from './fileSystemOperations';

export function doesPackageLockFileExist(workingDirectory: string): Promise<boolean> {
  const absolutePathToDestinationProjectPackageLock = path.resolve(workingDirectory, 'package-lock.json');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectPackageLock);
}
export function doesYarnLockFileExist(workingDirectory: string): Promise<boolean> {
  const absolutePathToDestinationProjectYarnLock = path.resolve(workingDirectory, 'yarn.lock');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectYarnLock);
}
