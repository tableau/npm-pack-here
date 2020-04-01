import { Validation } from 'fp-ts/lib/Validation';
import * as path from 'path';
import { delay } from './delay';
import {
  DirectoryContents,
  FileSystemItemDescription,
  filterContents,
  getAllItemsInDirectory,
  getSourceDirectoryContents,
  mergeIntoSourceDirectoryTheDirectoryContentsToNotOverwrite,
  prettyPrintDirectoryContents,
  SourceDirectoryContents,
  SourceItemDescription,
  StatsInfo,
} from './directoryContents';
import { FileSystemAbsolutePath } from './fileSystemAbsolutePath';
import { FileSystemItemDirectoryType, FileSystemItemFileType, FileSystemItemStatistics } from './fileSystemOperations';
import { Logger } from './logger';

export async function replaceDirectoryContentsWithFiles(
  sourceDirectory: FileSystemAbsolutePath,
  destinationDirectories: FileSystemAbsolutePath[],
  filesRelativePaths: string[],
  logger: Logger,
  pathGlobsToExclude: string[] = []
): Promise<void> {
  const itemsInSourceDirectory = await getSourceDirectoryContents(sourceDirectory, filesRelativePaths, logger);

  const directoryCopyOperations = destinationDirectories.map(async destinationDirectory => {
    await replaceContentsOfDirectoryWithFilesFrom(
      destinationDirectory,
      sourceDirectory,
      itemsInSourceDirectory,
      pathGlobsToExclude,
      logger
    );
  });
  await Promise.all(directoryCopyOperations);
}

async function replaceContentsOfDirectoryWithFilesFrom(
  destinationDirectory: FileSystemAbsolutePath,
  sourceDirectory: FileSystemAbsolutePath,
  sourceDirectoryContents: SourceDirectoryContents,
  pathGlobsToExclude: string[],
  logger: Logger
): Promise<void> {
  logger.info(() => `(${destinationDirectory.AbsolutePath}) getting contents of destination directory`);
  const itemsInDestinationDirectory = await getAllItemsInDirectory(destinationDirectory);

  logger.info(
    () => `(${destinationDirectory.AbsolutePath}) excluding [${pathGlobsToExclude.join(', ')}] from destination directory file contents`
  );
  const itemsInDestinationToNotOverwrite = filterContents(pathGlobsToExclude, itemsInDestinationDirectory, '');

  const itemsInSourceDirectoryWithOverwriteInfo = mergeIntoSourceDirectoryTheDirectoryContentsToNotOverwrite(
    sourceDirectoryContents,
    itemsInDestinationToNotOverwrite
  );

  logger.info(() => `(${destinationDirectory.AbsolutePath}) finished excluding destination directory file contents`);
  logger.debug(() =>
    prettyPrintDirectoryContents(itemsInSourceDirectoryWithOverwriteInfo, () => `(${destinationDirectory.AbsolutePath}) `)
  );

  logger.info(
    () => `(${destinationDirectory.AbsolutePath}) about to diff items in the source directory against those in the destination directory`
  );
  const itemDiffResults = await diffItemsInDirectories(
    sourceDirectory,
    itemsInSourceDirectoryWithOverwriteInfo,
    destinationDirectory,
    itemsInDestinationDirectory
  );
  logger.info(() => `(${destinationDirectory.AbsolutePath}) finished diff`);

  const itemsThatAreNew: ItemAddedDiffResult[] = [];
  const itemsWithChangedContents: ItemChangedContentsDiffResult[] = [];
  const itemsWithChangedTypes: ItemChangedTypesDiffResult[] = [];
  const itemsToRemove: ItemRemovedDiffResult[] = [];
  for (const itemDiffResult of itemDiffResults) {
    // tslint:disable-next-line:switch-default
    switch (itemDiffResult.type) {
      case ItemAddedDiffResultType:
        itemsThatAreNew.push(itemDiffResult);
        break;
      case ItemChangedContentsDiffResultType:
        itemsWithChangedContents.push(itemDiffResult);
        break;
      case ItemChangedTypesDiffResultType:
        itemsWithChangedTypes.push(itemDiffResult);
        break;
      case ItemEqualDiffResultType:
        break;
      case ItemRemovedDiffResultType:
        itemsToRemove.push(itemDiffResult);
        break;
    }
  }

  logger.info(() => `(${destinationDirectory.AbsolutePath}) copying new items from the source directory to the destination directory`);
  logger.debug(
    () =>
      `(${destinationDirectory.AbsolutePath}) copying these items to destination directory` +
      `\n[${itemsThatAreNew.map(item => item.itemRelativePath).join(',\n')}]`
  );
  await copyItems(
    sourceDirectory,
    destinationDirectory,
    itemsThatAreNew.map(item => ({ relativePath: item.itemRelativePath, sourceItemDescription: item.sourceItemInfo }))
  );

  logger.info(() => `(${destinationDirectory.AbsolutePath}) copying changed items from the source directory to the destination directory`);
  logger.debug(
    () =>
      `(${destinationDirectory.AbsolutePath}) copying these items to destination directory` +
      `\n[${itemsWithChangedContents.map(item => item.itemRelativePath).join(',\n')}]`
  );
  await copyItems(
    sourceDirectory,
    destinationDirectory,
    itemsWithChangedContents.map(item => ({ relativePath: item.itemRelativePath, sourceItemDescription: item.sourceItemInfo }))
  );

  logger.info(() => `(${destinationDirectory.AbsolutePath}) removing items that changed type from destination directory`);
  logger.debug(
    () =>
      `(${destinationDirectory.AbsolutePath}) removing these items from destination directory` +
      `\n[${itemsWithChangedTypes.map(item => item.itemRelativePath).join(',\n')}]`
  );
  await removeItems(
    destinationDirectory,
    itemsWithChangedTypes.map(item => item.itemRelativePath),
    logger,
    ensureItemRemoved
  );
  logger.info(() => `(${destinationDirectory.AbsolutePath}) copying items that changed type to destination directory`);
  logger.debug(
    () =>
      `(${destinationDirectory.AbsolutePath}) copying these items to destination directory` +
      `\n[${itemsWithChangedTypes.map(item => item.itemRelativePath).join(',\n')}]`
  );
  await copyItems(
    sourceDirectory,
    destinationDirectory,
    itemsWithChangedTypes.map(item => ({ relativePath: item.itemRelativePath, sourceItemDescription: item.sourceItemInfo }))
  );

  logger.info(
    () =>
      `(${destinationDirectory.AbsolutePath}) removing items from destination directory that are no longer present in the source directory`
  );
  logger.debug(
    () =>
      `(${destinationDirectory.AbsolutePath}) removing these items from destination directory` +
      `\n[${itemsToRemove.map(item => item.itemRelativePath).join(',\n')}]`
  );
  await removeItems(
    destinationDirectory,
    itemsToRemove.map(item => item.itemRelativePath),
    logger
  );
}

type ItemAddedDiffResultType = 'added';
const ItemAddedDiffResultType = 'added';

type ItemChangedTypesDiffResultType = 'changed-types';
const ItemChangedTypesDiffResultType = 'changed-types';

type ItemChangedContentsDiffResultType = 'changed-contents';
const ItemChangedContentsDiffResultType = 'changed-contents';

type ItemEqualDiffResultType = 'equal';
const ItemEqualDiffResultType = 'equal';

type ItemRemovedDiffResultType = 'removed';
const ItemRemovedDiffResultType = 'removed';

interface ItemAddedDiffResult {
  type: ItemAddedDiffResultType;
  itemRelativePath: string;
  sourceItemInfo: FileSystemItemDescription<unknown>;
}

interface ItemChangedTypesDiffResult {
  type: ItemChangedTypesDiffResultType;
  itemRelativePath: string;
  sourceItemInfo: FileSystemItemDescription<unknown>;
}

interface ItemChangedContentsDiffResult {
  type: ItemChangedContentsDiffResultType;
  itemRelativePath: string;
  sourceItemInfo: FileSystemItemDescription<unknown>;
}

interface ItemEqualDiffResult {
  type: ItemEqualDiffResultType;
  itemRelativePath: string;
}

interface ItemRemovedDiffResult {
  type: ItemRemovedDiffResultType;
  itemRelativePath: string;
}

type ItemDiffResult =
  | ItemAddedDiffResult
  | ItemChangedTypesDiffResult
  | ItemChangedContentsDiffResult
  | ItemEqualDiffResult
  | ItemRemovedDiffResult;

async function diffItemsInDirectories(
  sourceDirectoryPath: FileSystemAbsolutePath,
  sourceDirectoryContents: SourceDirectoryContents,
  destinationDirectoryPath: FileSystemAbsolutePath,
  destinationDirectoryContents: DirectoryContents<StatsInfo>
): Promise<ItemDiffResult[]> {
  const itemDiffsForEachItemInSourceDirectoryPromises = Object.keys(sourceDirectoryContents).map(async itemName => {
    const sourceItemDescription: SourceItemDescription = sourceDirectoryContents[itemName]!;
    const destinationItemDescription: FileSystemItemDescription<StatsInfo> | undefined = destinationDirectoryContents[itemName];

    return await diffItemInDirectory(
      sourceDirectoryPath,
      destinationDirectoryPath,
      itemName,
      sourceItemDescription,
      destinationItemDescription
    );
  });
  const itemDiffsForItemsInSourceDirectory = (await Promise.all(itemDiffsForEachItemInSourceDirectoryPromises)).reduce(
    (prev, curr) => prev.concat(curr),
    []
  );

  const itemDiffResults: ItemDiffResult[] = itemDiffsForItemsInSourceDirectory;

  const itemsToRemove = Object.keys(destinationDirectoryContents).reduce((results, itemName) => {
    const sourceDirectoryItemDescription = sourceDirectoryContents[itemName];
    return sourceDirectoryItemDescription === undefined
      ? results.concat({ itemRelativePath: itemName, type: ItemRemovedDiffResultType })
      : results;
  }, [] as ItemDiffResult[]);

  return itemDiffResults.concat(itemsToRemove);
}

async function diffItemInDirectory(
  sourceDirectoryPath: FileSystemAbsolutePath,
  destinationDirectoryPath: FileSystemAbsolutePath,
  itemName: string,
  sourceItemDescription: SourceItemDescription,
  destinationItemDescription: FileSystemItemDescription<StatsInfo> | undefined
): Promise<ItemDiffResult[]> {
  if (destinationItemDescription === undefined) {
    return [
      {
        itemRelativePath: itemName,
        type: ItemAddedDiffResultType,
        sourceItemInfo: sourceItemDescription,
      },
    ];
  }

  const sourceItemAbsolutePath = sourceDirectoryPath.getAbsolutePathRelativeFromHere(itemName);
  const destinationItemAbsolutePath = destinationDirectoryPath.getAbsolutePathRelativeFromHere(itemName);

  if (sourceItemDescription.type === FileSystemItemDirectoryType && destinationItemDescription.type === FileSystemItemDirectoryType) {
    const subDiffResults = await diffItemsInDirectories(
      sourceItemAbsolutePath,
      sourceItemDescription.dirContents,
      destinationItemAbsolutePath,
      destinationItemDescription.dirContents
    );
    const appendCurrentRelativePath = (subItemRelativePath: string) => path.join(itemName, subItemRelativePath);

    return subDiffResults.map(result => ({
      ...result,
      itemRelativePath: appendCurrentRelativePath(result.itemRelativePath),
    }));
  }

  if (sourceItemDescription.type === FileSystemItemFileType) {
    if (!sourceItemDescription.extraInfo.shouldReplaceInDestination) {
      return [];
    }

    if (destinationItemDescription.type === FileSystemItemFileType) {
      const sourceItem: FileSystemFile = {
        absolutePath: sourceItemAbsolutePath,
        stats: sourceItemDescription.extraInfo.stats,
      };

      const destinationItem: FileSystemFile = {
        absolutePath: destinationItemAbsolutePath,
        stats: destinationItemDescription.extraInfo.stats,
      };

      const itemDiffType = await diffFiles(sourceItem, destinationItem);

      const diffResult =
        itemDiffType === ItemChangedContentsDiffResultType
          ? {
              sourceItemInfo: { ...sourceItemDescription },
              itemRelativePath: itemName,
              type: itemDiffType,
            }
          : { itemRelativePath: itemName, type: itemDiffType };

      return [diffResult];
    }
  }

  return [
    {
      sourceItemInfo: { ...sourceItemDescription },
      itemRelativePath: itemName,
      type: ItemChangedTypesDiffResultType,
    },
  ];
}

interface FileSystemFile {
  absolutePath: FileSystemAbsolutePath;
  stats: FileSystemItemStatistics;
}

async function diffFiles(
  itemAtSource: FileSystemFile,
  itemAtDestination: FileSystemFile
): Promise<ItemEqualDiffResultType | ItemChangedContentsDiffResultType> {
  if (
    itemAtDestination.stats.modifiedTime.getTime() === itemAtSource.stats.modifiedTime.getTime() &&
    itemAtDestination.stats.size === itemAtSource.stats.size
  ) {
    const contentsForItemAtDestination = await itemAtDestination.absolutePath.read();
    const contentsForItemAtSource = await itemAtSource.absolutePath.read();

    if (contentsForItemAtDestination === contentsForItemAtSource) {
      return ItemEqualDiffResultType;
    }
  }

  return ItemChangedContentsDiffResultType;
}

interface ItemsToCopy {
  relativePath: string;
  sourceItemDescription: FileSystemItemDescription<unknown>;
}

async function copyItems(dirToCopyFrom: FileSystemAbsolutePath, dirToCopyTo: FileSystemAbsolutePath, items: ItemsToCopy[]): Promise<void> {
  const itemsToCopy = items.map(async item => {
    const itemDescription = item.sourceItemDescription;
    if (itemDescription.type === 'file') {
      const sourceItemPath = dirToCopyFrom.getAbsolutePathRelativeFromHere(item.relativePath);
      const destinationItemPath = dirToCopyTo.getAbsolutePathRelativeFromHere(item.relativePath);

      return await sourceItemPath.copyTo(destinationItemPath, { preserveTimestamps: true });
    }

    return await copyItems(
      dirToCopyFrom,
      dirToCopyTo,
      Object.keys(itemDescription.dirContents).map(itemName => {
        const subItemPath = path.posix.join(item.relativePath, itemName);

        return {
          relativePath: subItemPath,
          sourceItemDescription: itemDescription.dirContents[itemName]!,
        };
      })
    );
  });
  await Promise.all(itemsToCopy);
}

async function removeItems(
  dirToRemoveFrom: FileSystemAbsolutePath,
  itemsRelativePaths: string[],
  logger: Logger,
  removeItemFunction: (itemAbsolutePath: FileSystemAbsolutePath, logger: Logger) => Promise<void> = removeItem
): Promise<void> {
  const removeItemsPromises = itemsRelativePaths.map(async itemRelativePath => {
    const pathToItem = dirToRemoveFrom.getAbsolutePathRelativeFromHere(itemRelativePath);
    await removeItemFunction(pathToItem, logger);
  });
  await Promise.all(removeItemsPromises);
}

async function removeItem(itemAbsolutePath: FileSystemAbsolutePath, logger: Logger): Promise<void> {
  try {
    await itemAbsolutePath.remove();
  } catch (error) {
    reportUnableToRemoveItem(itemAbsolutePath, logger, error);
  }
}

async function ensureItemRemoved(itemAbsolutePath: FileSystemAbsolutePath, logger: Logger): Promise<void> {
  try {
    await itemAbsolutePath.remove();
    let accessCallResult = await itemAbsolutePath.access();
    if (doesAccessResultIndicateItemHasBeenRemoved(accessCallResult)) {
      return;
    }

    // try once again after 100 ms, this should be rarely needed
    await delay(100);
    accessCallResult = await itemAbsolutePath.access();

    if (doesAccessResultIndicateItemHasBeenRemoved(accessCallResult)) {
      return;
    }

    if (accessCallResult.isSuccess()) {
      throw new Error(`Path exists ${itemAbsolutePath.AbsolutePath}`);
    }

    if (accessCallResult.value === AccessErrorOperationNotPermitted) {
      throw new Error(
        `Path exists ${itemAbsolutePath.AbsolutePath} but received ${AccessErrorOperationNotPermitted} when accessing it. ` +
          `If a remove call has just been made this likely means the item is in a 'PENDING DELETE' state due to another process still accessing it.`
      );
    }

    throw new Error(`Unexpected error '${accessCallResult.value}' accessing ${itemAbsolutePath.AbsolutePath}`);
  } catch (error) {
    reportUnableToRemoveItem(itemAbsolutePath, logger, error);
  }
}

// tslint:disable-next-line:no-any
function reportUnableToRemoveItem(itemAbsolutePath: FileSystemAbsolutePath, logger: Logger, error: any): void {
  logger.error(() => `Unable to remove item ${itemAbsolutePath.AbsolutePath}`);
  throw error;
}

function doesAccessResultIndicateItemHasBeenRemoved(accessCallResult: Validation<string, null>): boolean {
  return accessCallResult.isFailure() && accessCallResult.value === AccessErrorNoSuchFileOrDirectory ? true : false;
}

export const AccessErrorNoSuchFileOrDirectory = 'ENOENT';
export const AccessErrorOperationNotPermitted = 'EPERM';
