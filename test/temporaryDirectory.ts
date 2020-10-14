import { fromNullable, Option } from 'fp-ts/lib/Option';
import * as path from 'path';
import * as tmp from 'tmp';
import { fileSystemOperations } from '../src/fileSystemOperations';

export type FileSystemItemFileType = 'file';
export type FileSystemItemDirectoryType = 'directory';
export type FileSystemItemSymlinkType = 'symlink';

export function fileDescription(contents: string, stats?: FileStatistics): FileDescription {
  return {
    type: 'file',
    contents: contents,
    stats: fromNullable(stats),
  };
}

export interface FileStatistics {
  readonly modifiedTime: Date;
}

export interface FileDescription {
  type: FileSystemItemFileType;
  contents: string;
  stats: Option<FileStatistics>;
}

export function directoryDescription(dirContents: DirectoryContents): DirectoryDescription {
  return {
    type: 'directory',
    dirContents: dirContents,
  };
}

export interface DirectoryDescription {
  type: FileSystemItemDirectoryType;
  dirContents: DirectoryContents;
}

export function symlinkDescription(targetRelativePath: string): SymlinkDescription {
  if (path.isAbsolute(targetRelativePath)) {
    throw new Error(`Symlink description requires a relative path, was given an absolute one '${targetRelativePath}'`);
  }
  return {
    type: 'symlink',
    targetRelativePath: targetRelativePath,
  };
}

export interface SymlinkDescription {
  type: FileSystemItemSymlinkType;
  targetRelativePath: string;
}

export type FileSystemItemDescription = FileDescription | DirectoryDescription | SymlinkDescription;

export interface DirectoryContents {
  [name: string]: FileSystemItemDescription | undefined;
}

export async function createTestDirectoryWithContents(directoryContents: DirectoryContents): Promise<string> {
  const pathToTmpDir = createTemporaryDirectory();

  await fillDirectoryWithContents(directoryContents, pathToTmpDir);
  await setupSymlinks(directoryContents, pathToTmpDir);

  return pathToTmpDir;
}

export function createTemporaryDirectory(): string {
  tmp.setGracefulCleanup();
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempDirName = tempDir.name;

  return tempDirName;
}

async function fillDirectoryWithContents(directoryContents: DirectoryContents, basePath: string): Promise<void> {
  await Promise.all(
    Object.keys(directoryContents).map(async itemName => {
      const itemPath = path.join(basePath, itemName);
      const itemDescription = directoryContents[itemName] as FileSystemItemDescription;

      if (itemDescription.type === 'file') {
        await fileSystemOperations.writeFile(itemPath, itemDescription.contents);
        if (itemDescription.stats.isSome()) {
          await fileSystemOperations.setTimes(itemPath, { modifiedTime: itemDescription.stats.value.modifiedTime });
        }
        return;
      }

      if (itemDescription.type === 'symlink') {
        return;
      }

      await fileSystemOperations.ensureDirectory(itemPath);
      await fillDirectoryWithContents(itemDescription.dirContents, itemPath);
    })
  );
}

async function setupSymlinks(directoryContents: DirectoryContents, basePath: string): Promise<void> {
  await Promise.all(
    Object.keys(directoryContents).map(async itemName => {
      const itemPath = path.join(basePath, itemName);
      const itemDescription = directoryContents[itemName] as FileSystemItemDescription;

      if (itemDescription.type === 'file') {
        return;
      }

      if (itemDescription.type === 'symlink') {
        await fileSystemOperations.ensureSymlink(itemPath, path.resolve(basePath, itemDescription.targetRelativePath));
        return;
      }

      await setupSymlinks(itemDescription.dirContents, itemPath);
    })
  );
}

export async function getAllPathsToFilesInDirectory(absoluteDirectoryPath: string): Promise<string[]> {
  const subItems = await fileSystemOperations.getItemNames(absoluteDirectoryPath);

  const subItemPaths = await Promise.all(
    subItems.map(async subItemName => {
      const subItemPath = path.join(absoluteDirectoryPath, subItemName);

      if (await fileSystemOperations.isFile(subItemPath)) {
        return [subItemPath];
      }

      if (await fileSystemOperations.isDirectory(subItemPath)) {
        return getAllPathsToFilesInDirectory(subItemPath);
      }

      throw new Error('Only support getting file and directory paths in given directory');
    })
  );

  return ([] as string[]).concat(...subItemPaths);
}

export async function assertPathDoesNotExist(absolutePath: string): Promise<void> {
  const doesPathExist = await fileSystemOperations.pathExists(absolutePath);

  expect(doesPathExist).toEqual(false, `Expected '${absolutePath}' to not exist`);
}

export async function assertPathExists(absolutePath: string): Promise<void> {
  const doesPathExist = await fileSystemOperations.pathExists(absolutePath);

  expect(doesPathExist).toEqual(true, `Expected '${absolutePath}' to exist`);
}

export async function assertPathIsDirectory(absolutePath: string): Promise<void> {
  await assertPathExists(absolutePath);

  expect(await fileSystemOperations.isDirectory(absolutePath)).toEqual(true, `Expected '${absolutePath}' to be a directory`);
}

export async function assertPathIsFile(absolutePath: string): Promise<void> {
  await assertPathExists(absolutePath);

  expect(await fileSystemOperations.isFile(absolutePath)).toEqual(true, `Expected '${absolutePath}' to be a file`);
}

export async function assertFileHasContents(absolutePathToFile: string, expectedContents: string): Promise<void> {
  await assertPathIsFile(absolutePathToFile);

  const fileContents = await fileSystemOperations.readFile(absolutePathToFile);

  expect(fileContents).toEqual(expectedContents, `Expected '${absolutePathToFile}' to have contents '${expectedContents}'`);
}
