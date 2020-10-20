import { none, Option, some } from 'fp-ts/lib/Option';
import * as micromatch from 'micromatch';
import * as path from 'path';
import { FileSystemAbsolutePath } from './fileSystemAbsolutePath';
import {
  FileSystemItemDirectoryType,
  FileSystemItemFileType,
  FileSystemItemStatistics,
  FileSystemItemSymlinkType,
} from './fileSystemOperations';
import { Logger } from './logger';

export interface ShouldNotReplaceInDestinationSourceFileExtraInfo {
  shouldReplaceInDestination: false;
}

export interface ShouldReplaceInDestinationSourceFileExtraInfo extends StatsInfo {
  shouldReplaceInDestination: true;
}

export type SourceFileExtraInfo = ShouldNotReplaceInDestinationSourceFileExtraInfo | ShouldReplaceInDestinationSourceFileExtraInfo;

export type SourceFileDescription = FileDescription<SourceFileExtraInfo>;

export type SourceDirectoryDescription = DirectoryDescription<SourceFileExtraInfo>;

export type SourceItemDescription = FileSystemItemDescription<SourceFileExtraInfo>;

export type SourceDirectoryContents = DirectoryContents<SourceFileExtraInfo>;

export interface StatsInfo {
  stats: FileSystemItemStatistics;
}

export interface FileDescription<T> {
  type: FileSystemItemFileType;
  extraInfo: T;
}

export interface DirectoryDescription<FileExtraInfo> {
  type: FileSystemItemDirectoryType;
  dirContents: DirectoryContents<FileExtraInfo>;
}

export type FileSystemItemDescription<FileExtraInfo> = FileDescription<FileExtraInfo> | DirectoryDescription<FileExtraInfo>;

export interface DirectoryContents<FileExtraInfo> {
  [name: string]: FileSystemItemDescription<FileExtraInfo> | undefined;
}

export async function getAllItemsInDirectory(
  directoryPath: FileSystemAbsolutePath,
  shouldIncludeItem?: (itemPathRelativeToDirectory: string) => boolean
): Promise<DirectoryContents<StatsInfo>> {
  if (!(await directoryPath.Exists)) {
    return {};
  }

  const rootDirPathStats = await directoryPath.Stats;
  if (rootDirPathStats.type === 'symlink') {
    throw new Error(
      `Cannot get items from given path '${directoryPath.AbsolutePath}' because it is a symlink, reading and/or writing to a symlink is not supported.`
    );
  }
  if (rootDirPathStats.type !== 'directory') {
    throw new Error(`Cannot get items from given path '${directoryPath.AbsolutePath}' because it is not a directory`);
  }

  return await getDirectoryContents(directoryPath, item => {
    const itemPath = item.absolutePath.relativePathFrom(directoryPath);
    return shouldIncludeItem !== undefined ? shouldIncludeItem(itemPath) : true;
  });
}

export async function getSourceDirectoryContents(
  sourceDirectory: FileSystemAbsolutePath,
  filesToIncludeRelativePaths: string[],
  logger: Logger
): Promise<SourceDirectoryContents> {
  logger.info(() => `getting item contents for source directory ${sourceDirectory.AbsolutePath}`);

  // make sure that there is no difference in slashes when comparing these file paths so normalize all the paths
  const allFilesToIncludeAndParentDirectoryPaths = new Set(
    expandListOfFilesToIncludeParentDirectoryPaths(filesToIncludeRelativePaths.map(filePath => path.normalize(filePath)))
  );
  const itemsInSourceDirectory = await getAllItemsInDirectory(sourceDirectory, itemPathRelativeToDirectory => {
    return allFilesToIncludeAndParentDirectoryPaths.has(path.normalize(itemPathRelativeToDirectory));
  });

  logger.info(() => `got item contents of source directory`);
  logger.debug(() => prettyPrintDirectoryContents(itemsInSourceDirectory, () => ''));

  return convertIntoSourceDirectoryContents(itemsInSourceDirectory);
}

async function getDirectoryContents(
  directoryPath: FileSystemAbsolutePath,
  shouldIncludeItem: (item: { absolutePath: FileSystemAbsolutePath; stats: FileSystemItemStatistics }) => boolean
): Promise<DirectoryContents<StatsInfo>> {
  const relativeItemPaths = await directoryPath.ContainedItemNames;

  const fileOperations = relativeItemPaths.map(async itemRelativePath => {
    const absolutePath = directoryPath.getAbsolutePathRelativeFromHere(itemRelativePath);
    const stats = await absolutePath.Stats;
    return {
      itemName: itemRelativePath,
      absolutePath: absolutePath,
      stats: stats,
    };
  });

  type ItemNameAndDescription = {
    itemName: string;
    description: FileSystemItemDescription<StatsInfo>;
  };

  const contents = (await Promise.all(fileOperations))
    .filter(item => {
      return shouldIncludeItem(item);
    })
    .map(async item => {
      const itemDescription = await getFileSystemItemDescriptionIfFileOrDirectory(item, shouldIncludeItem);
      if (itemDescription === null) {
        return null;
      }

      return {
        itemName: item.itemName,
        description: itemDescription,
      } as ItemNameAndDescription;
    });

  const allContents = (await Promise.all(contents)).filter((item): item is ItemNameAndDescription => {
    return item !== null;
  });

  return allContents.reduce((contentsSoFar, item) => {
    return { ...contentsSoFar, [item.itemName]: item.description };
  }, {} as DirectoryContents<StatsInfo>);
}

async function getFileSystemItemDescriptionIfFileOrDirectory(
  item: { stats: FileSystemItemStatistics; absolutePath: FileSystemAbsolutePath },
  shouldIncludeFunc: (item: { absolutePath: FileSystemAbsolutePath; stats: FileSystemItemStatistics }) => boolean
): Promise<FileSystemItemDescription<StatsInfo> | null> {
  if (item.stats.type === FileSystemItemDirectoryType) {
    const subDirItems = await getDirectoryContents(item.absolutePath, shouldIncludeFunc);

    return {
      dirContents: subDirItems,
      type: item.stats.type,
    };
  } else if (item.stats.type === FileSystemItemSymlinkType) {
    return null;
  }
  return {
    type: item.stats.type,
    extraInfo: { stats: item.stats },
  };
}

export function prettyPrintDirectoryContents(contents: DirectoryContents<unknown>, prependText: () => string): string {
  return prependText() + JSON.stringify(getSimplifiedVersionOfDirectoryContents(contents), undefined, 2);
}

export interface SimplifiedDirectoryContents {
  [name: string]: SimplifiedDirectoryContents | string | undefined;
}

function getSimplifiedVersionOfDirectoryContents(directoryContents: DirectoryContents<unknown>): SimplifiedDirectoryContents {
  return mapObjectWithIndexSignatureProps(directoryContents, itemDescription => {
    if (itemDescription.type === 'directory') {
      return getSimplifiedVersionOfDirectoryContents(itemDescription.dirContents);
    }

    return '';
  });
}

function expandListOfFilesToIncludeParentDirectoryPaths(filesRelativePaths: string[]): string[] {
  const parentDirectoryPaths = filesRelativePaths.map(fileRelativePath => {
    return getParentDirectoryNames(fileRelativePath).getOrElse([]);
  });

  const allPaths = filesRelativePaths.concat(...parentDirectoryPaths).reduce((allPathsSoFar, currentPath) => {
    if (allPathsSoFar.has(currentPath)) {
      return allPathsSoFar;
    }
    return new Set(Array.from(allPathsSoFar.values()).concat([currentPath]));
  }, new Set<string>());

  return Array.from(allPaths.values());
}

function getParentDirectoryNames(relativePath: string): Option<string[]> {
  const currentDirectoryPath = path.dirname(relativePath);
  if (currentDirectoryPath === '' || currentDirectoryPath === '.') {
    return none;
  }

  const thisDirectoryAndParents = getParentDirectoryNames(currentDirectoryPath).reduce(
    [currentDirectoryPath],
    (thisDirectory, parentDirectories) => parentDirectories.concat(thisDirectory)
  );
  return some(thisDirectoryAndParents);
}

export function filterContents<FileExtraInfo>(
  includeGlobs: string[],
  directoryContents: DirectoryContents<FileExtraInfo>,
  directoryPath: string
): DirectoryContents<FileExtraInfo> {
  return Object.keys(directoryContents)
    .map<[string, FileSystemItemDescription<FileExtraInfo>] | null>(itemName => {
      const itemDescription: FileSystemItemDescription<FileExtraInfo> = directoryContents[itemName]!;
      const itemPath = path.posix.join(directoryPath, itemName);

      const matchesGlob = micromatch.some(itemPath, includeGlobs);

      if (matchesGlob) {
        return [itemName, itemDescription];
      }

      if (itemDescription.type === 'file') {
        return null;
      }

      const itemDirectoryContents = filterContents(includeGlobs, itemDescription.dirContents, itemPath);

      return Object.keys(itemDirectoryContents).length === 0 ? null : [itemName, { type: 'directory', dirContents: itemDirectoryContents }];
    })
    .filter(<T>(item: T): item is Exclude<T, null> => item !== null)
    .reduce<DirectoryContents<FileExtraInfo>>(
      (previous, [itemName, itemDescription]) => ({ ...previous, [itemName]: itemDescription }),
      {}
    );
}

export function convertIntoSourceDirectoryContents(contents: DirectoryContents<StatsInfo>): SourceDirectoryContents {
  return mapObjectWithIndexSignatureProps(contents, itemDescription => {
    if (itemDescription.type === 'directory') {
      return { ...itemDescription, dirContents: convertIntoSourceDirectoryContents(itemDescription.dirContents), extraInfo: undefined };
    }

    const newExtraInfo = { ...itemDescription.extraInfo, shouldReplaceInDestination: true };
    return { ...itemDescription, extraInfo: newExtraInfo } as SourceFileDescription;
  });
}

function copyDirectoryContents<FileExtraInfo>(contents: DirectoryContents<FileExtraInfo>): DirectoryContents<FileExtraInfo> {
  return mapObjectWithIndexSignatureProps(contents, itemDescription => {
    if (itemDescription.type === 'directory') {
      return { ...itemDescription, dirContents: copyDirectoryContents(itemDescription.dirContents) };
    }

    return itemDescription;
  });
}

interface ObjectWithIndexSignature<T> {
  [name: string]: T | undefined;
}

function mapObjectWithIndexSignatureProps<InObjectValueType, OutObjectValueType>(
  inputObject: ObjectWithIndexSignature<InObjectValueType>,
  mapFunction: (propValue: InObjectValueType, propName: string) => OutObjectValueType
): ObjectWithIndexSignature<OutObjectValueType> {
  return Object.keys(inputObject)
    .map<[string, OutObjectValueType]>(propName => {
      const propValue: InObjectValueType = inputObject[propName]!;

      return [propName, mapFunction(propValue, propName)];
    })
    .reduce<ObjectWithIndexSignature<OutObjectValueType>>((previous, [propName, propValue]) => {
      return { ...previous, [propName]: propValue };
    }, {});
}

export function mergeIntoSourceDirectoryTheDirectoryContentsToNotOverwrite<FileExtraInfo>(
  baseContents: SourceDirectoryContents,
  contentsToNotOverwrite: DirectoryContents<FileExtraInfo>
): SourceDirectoryContents {
  return mergeDirectoryContents(baseContents, contentsToNotOverwrite, () => ({ shouldReplaceInDestination: false } as SourceFileExtraInfo));
}

export function mergeDirectoryContents<BaseFileExtraInfo, MergeFileExtraInfo>(
  baseContents: DirectoryContents<BaseFileExtraInfo>,
  contentsToCopyInto: DirectoryContents<MergeFileExtraInfo>,
  mergeFileFunction: (newItem: FileDescription<MergeFileExtraInfo>, currentItem?: FileDescription<BaseFileExtraInfo>) => BaseFileExtraInfo
): DirectoryContents<BaseFileExtraInfo> {
  const copyOfBaseContents = copyDirectoryContents(baseContents);
  setDirectoryContentsOnBase(copyOfBaseContents, contentsToCopyInto, mergeFileFunction);

  return copyOfBaseContents;
}

function setDirectoryContentsOnBase<BaseFileExtraInfo, MergeFileExtraInfo>(
  baseContents: DirectoryContents<BaseFileExtraInfo>,
  contentsToCopyInto: DirectoryContents<MergeFileExtraInfo>,
  mergeFileFunction: (newItem: FileDescription<MergeFileExtraInfo>, currentItem?: FileDescription<BaseFileExtraInfo>) => BaseFileExtraInfo
): void {
  // tslint:disable-next-line:forin
  for (const contentsToCopyItemName in contentsToCopyInto) {
    const contentsToCopyItemDescription: FileSystemItemDescription<MergeFileExtraInfo> = contentsToCopyInto[contentsToCopyItemName]!;

    const baseItemDescription = baseContents[contentsToCopyItemName];
    if (baseItemDescription !== undefined && contentsToCopyItemDescription.type !== baseItemDescription.type) {
      throw new Error('Cannot merge two directories with different content structures');
    }

    if (contentsToCopyItemDescription.type === 'file') {
      const newFileExtraInfo = mergeFileFunction(contentsToCopyItemDescription, baseItemDescription as FileDescription<BaseFileExtraInfo>);
      baseContents[contentsToCopyItemName] = {
        ...contentsToCopyItemDescription,
        extraInfo: newFileExtraInfo,
      } as FileDescription<BaseFileExtraInfo>;
      continue;
    }

    const newBaseContentsItemDescription = {
      type: 'directory',
      dirContents: baseItemDescription ? (baseItemDescription as DirectoryDescription<BaseFileExtraInfo>).dirContents : {},
    } as DirectoryDescription<BaseFileExtraInfo>;
    baseContents[contentsToCopyItemName] = newBaseContentsItemDescription;

    setDirectoryContentsOnBase(newBaseContentsItemDescription.dirContents, contentsToCopyItemDescription.dirContents, mergeFileFunction);
  }
}
