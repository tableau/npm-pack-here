import { failure, success } from 'fp-ts/lib/Validation';
import * as path from 'path';
import { FileSystemAbsolutePath } from '../src/fileSystemAbsolutePath';
import { fileSystemOperations } from '../src/fileSystemOperations';
import {
  AccessErrorNoSuchFileOrDirectory,
  AccessErrorOperationNotPermitted,
  replaceDirectoryContentsWithFiles,
} from '../src/replaceDirectoryContentsWithFiles';
import {
  assertFileHasContents,
  assertPathDoesNotExist,
  assertPathIsDirectory,
  assertPathIsFile,
  createTestDirectoryWithContents,
  directoryDescription,
  fileDescription,
  getAllPathsToFilesInDirectory,
} from './temporaryDirectory';
import { getVirtualLoggerInstance } from './virtualLogger';

describe(`replace directory contents with files`, () => {
  it(`should throw if called with a file as the source or destination directory path`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';

    const pathToTestDirectoryWithSourcePathAsFile = await createTestDirectoryWithContents({
      [sourceDirRoot]: fileDescription(''),
    });

    try {
      await replaceDirectoryContentsWithFiles(
        FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectoryWithSourcePathAsFile, sourceDirRoot)),
        [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectoryWithSourcePathAsFile, destinationDirRoot))],
        [],
        getVirtualLoggerInstance()
      );
      fail('expect replaceDirectoryContentsWithFiles to throw');
    } catch (error) {
      expect(error).not.toBeNull();
    }

    const pathToTestDirectoryWithDestinationPathAsFile = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({}),
      [destinationDirRoot]: fileDescription(''),
    });

    try {
      await replaceDirectoryContentsWithFiles(
        FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectoryWithDestinationPathAsFile, sourceDirRoot)),
        [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectoryWithDestinationPathAsFile, destinationDirRoot))],
        [],
        getVirtualLoggerInstance()
      );
      fail('expect replaceDirectoryContentsWithFiles to throw');
    } catch (error) {
      expect(error).not.toBeNull();
    }

    done();
  });

  it(`should copy all files into an empty directory`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const packageJsonInRoot = 'package.json';
    const folderInRoot = 'folder';
    const folder2InRoot = 'folder2';
    const nestedFolderInFolder2 = 'nested';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
        [folderInRoot]: directoryDescription({
          [txtFile]: fileDescription(''),
          'file.md': fileDescription(''),
        }),
        [folder2InRoot]: directoryDescription({
          [nestedFolderInFolder2]: directoryDescription({
            [txtFile]: fileDescription(''),
          }),
          [txtFile]: fileDescription(''),
        }),
        [packageJsonInRoot]: fileDescription(JSON.stringify({ name: 'dep-package', version: '1.0.0' }, null, 2)),
      }),
    });

    const filesToCopy = [
      txtFile,
      path.posix.join(folderInRoot, txtFile),
      path.posix.join(folder2InRoot, txtFile),
      path.posix.join(folder2InRoot, nestedFolderInFolder2, txtFile),
      packageJsonInRoot,
    ];

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      filesToCopy,
      getVirtualLoggerInstance()
    );

    const appendDestinationDir = (filePath: string) => path.join(destinationDirRoot, filePath);
    const appendTestDirectory = (relativeFilePath: string) => path.join(pathToTestDirectory, relativeFilePath);

    expect(await getAllPathsToFilesInDirectory(path.join(pathToTestDirectory, destinationDirRoot))).toEqual(
      jasmine.arrayContaining(filesToCopy.map(appendDestinationDir).map(appendTestDirectory))
    );
    done();
  });

  it(`should not copy unlisted files`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const mdFile = 'file.md';
    const folderInRoot = 'folder';
    const folder2InRoot = 'folder2';
    const nestedFolderInFolder2 = 'nested';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
        [mdFile]: fileDescription(''),
        [folderInRoot]: directoryDescription({
          [txtFile]: fileDescription(''),
          [mdFile]: fileDescription(''),
        }),
        [folder2InRoot]: directoryDescription({
          [nestedFolderInFolder2]: directoryDescription({
            [txtFile]: fileDescription(''),
            [mdFile]: fileDescription(''),
          }),
          [txtFile]: fileDescription(''),
          [mdFile]: fileDescription(''),
        }),
      }),
    });

    const filesToCopy = [
      txtFile,
      path.posix.join(folderInRoot, txtFile),
      path.posix.join(folder2InRoot, txtFile),
      path.posix.join(folder2InRoot, nestedFolderInFolder2, txtFile),
    ];

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      filesToCopy,
      getVirtualLoggerInstance()
    );

    await assertPathDoesNotExist(path.join(pathToTestDirectory, destinationDirRoot, mdFile));
    await assertPathDoesNotExist(path.join(pathToTestDirectory, destinationDirRoot, folderInRoot, mdFile));
    await assertPathDoesNotExist(path.join(pathToTestDirectory, destinationDirRoot, folder2InRoot, mdFile));
    await assertPathDoesNotExist(path.join(pathToTestDirectory, destinationDirRoot, folder2InRoot, nestedFolderInFolder2, mdFile));

    done();
  });

  it(`should update files contents of files changed in the source directory`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const packageJsonInRoot = 'package.json';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
        [packageJsonInRoot]: fileDescription(JSON.stringify({ name: 'dep-package', version: '1.0.0' }, null, 2)),
      }),
    });

    const txtFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, txtFile);
    const filesToCopy = [txtFile, packageJsonInRoot];

    // Initial folder copy
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      filesToCopy,
      getVirtualLoggerInstance()
    );
    await assertFileHasContents(txtFileInDestination, '');

    const newTxtFileContents = 'Some content!';
    await fileSystemOperations.writeFile(path.join(pathToTestDirectory, sourceDirRoot, txtFile), newTxtFileContents);

    // Second folder copy
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      filesToCopy,
      getVirtualLoggerInstance()
    );
    await assertFileHasContents(txtFileInDestination, newTxtFileContents);
    done();
  });

  it(`should remove any extra files in destination directory`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const packageJsonInRoot = 'package.json';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
        [packageJsonInRoot]: fileDescription(JSON.stringify({ name: 'dep-package', version: '1.0.0' }, null, 2)),
      }),
    });

    const txtFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, txtFile);
    const filesToCopy = [txtFile, packageJsonInRoot];
    // Initial folder copy
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      filesToCopy,
      getVirtualLoggerInstance()
    );
    await assertFileHasContents(txtFileInDestination, '');

    // Second folder copy
    const newFilesToCopy = [packageJsonInRoot];
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      newFilesToCopy,
      getVirtualLoggerInstance()
    );
    await assertPathDoesNotExist(txtFileInDestination);
    done();
  });

  it(`should replace a file with a directory, if one of the same name exists and has the same modified time`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: directoryDescription({
          [txtFile]: fileDescription(''),
        }),
      }),
      [destinationDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
      }),
    });

    const txtFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, txtFile);
    const txtFolderInSource = path.join(pathToTestDirectory, sourceDirRoot, txtFile);

    await assertFileHasContents(txtFileInDestination, '');
    const txtFileInDestinationStats = await fileSystemOperations.getStatistics(txtFileInDestination);
    await fileSystemOperations.setTimes(txtFolderInSource, { modifiedTime: txtFileInDestinationStats.modifiedTime });

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [path.posix.join(txtFile, txtFile)],
      getVirtualLoggerInstance()
    );

    await assertPathIsDirectory(txtFileInDestination);
    done();
  });

  it(`should replace a directory with a file, if one of the same name exists and has the same modified time`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [txtFile]: fileDescription(''),
      }),
      [destinationDirRoot]: directoryDescription({
        [txtFile]: directoryDescription({
          [txtFile]: fileDescription(''),
        }),
      }),
    });

    const txtFolderInDestination = path.join(pathToTestDirectory, destinationDirRoot, txtFile);
    const txtFileInSource = path.join(pathToTestDirectory, sourceDirRoot, txtFile);

    await assertPathIsDirectory(txtFolderInDestination);
    const txtFolderInDestinationStats = await fileSystemOperations.getStatistics(txtFolderInDestination);
    await fileSystemOperations.setTimes(txtFileInSource, { modifiedTime: txtFolderInDestinationStats.modifiedTime });

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [path.posix.join(txtFile, txtFile)],
      getVirtualLoggerInstance()
    );

    await assertFileHasContents(txtFolderInDestination, '');
    done();
  });

  it(`should prevent the overwriting or deleting of files or directories in destination using globs`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({}),
      [destinationDirRoot]: directoryDescription({
        node_modules: directoryDescription({
          [txtFile]: fileDescription(''),
        }),
        node_modules2: directoryDescription({
          [txtFile]: fileDescription(''),
          'file2.txt': fileDescription(''),
        }),
      }),
    });

    const logger = getVirtualLoggerInstance();

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [],
      logger,
      ['node_modules', `node_modules2/${txtFile}`]
    );

    await assertPathIsFile(path.join(pathToTestDirectory, destinationDirRoot, 'node_modules', txtFile));
    await assertPathIsFile(path.join(pathToTestDirectory, destinationDirRoot, 'node_modules2', txtFile));
    await assertPathDoesNotExist(path.join(pathToTestDirectory, destinationDirRoot, 'node_modules2', 'file2.txt'));

    done();
  });

  it(`should not overwrite a file in destination folder when marked as excluded`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const txtFile = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        node_modules: directoryDescription({
          [txtFile]: fileDescription('hello'),
        }),
      }),
      [destinationDirRoot]: directoryDescription({
        node_modules: directoryDescription({
          [txtFile]: fileDescription(''),
        }),
      }),
    });

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [path.join('node_modules', txtFile)],
      getVirtualLoggerInstance(),
      ['node_modules']
    );

    await assertFileHasContents(path.join(pathToTestDirectory, destinationDirRoot, 'node_modules', txtFile), '');

    done();
  });

  it(`should not re-copy files with no changes`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const unchangedFile = 'file.txt';
    const changedFile = 'file1.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        a: directoryDescription({ [unchangedFile]: fileDescription('hello') }),
        [changedFile]: fileDescription(''),
      }),
    });
    const relativePathToUnchangedFile = path.join('a', unchangedFile);

    const txtFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, relativePathToUnchangedFile);
    // initial call
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [relativePathToUnchangedFile, changedFile],
      getVirtualLoggerInstance()
    );
    await assertFileHasContents(txtFileInDestination, 'hello');

    const copySpy = spyOn(fileSystemOperations, 'copyTo');

    // second call
    await fileSystemOperations.writeFile(path.join(pathToTestDirectory, sourceDirRoot, changedFile), 'content');
    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot)),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot))],
      [relativePathToUnchangedFile, changedFile],
      getVirtualLoggerInstance()
    );

    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(copySpy).toHaveBeenCalledWith(
      path.resolve(pathToTestDirectory, sourceDirRoot, changedFile),
      path.resolve(pathToTestDirectory, destinationDirRoot, changedFile),
      jasmine.anything()
    );

    done();
  });

  it(`should wait to make sure file has been removed if access call indicates permission error after remove call`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const file = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [file]: fileDescription(''),
      }),
      [destinationDirRoot]: directoryDescription({
        [file]: directoryDescription({}),
      }),
    });
    const pathToFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, file);

    let itemAtDestinationState: 'isDirectory' | 'removalPending' | 'removed' | 'isFile' = 'isDirectory';

    // tslint:disable-next-line:no-any
    const removeSpy = spyOn(fileSystemOperations, 'remove').and.callFake(async (fileAbsolutePath: any) => {
      expect(fileAbsolutePath).toEqual(pathToFileInDestination);
      itemAtDestinationState = 'removalPending';
    });

    // tslint:disable-next-line:no-any
    spyOn(fileSystemOperations, 'access').and.callFake(async (fileAbsolutePath: any) => {
      expect(fileAbsolutePath).toEqual(pathToFileInDestination);
      if (itemAtDestinationState === 'removalPending') {
        // First call to access after removal should throw with an EPERM error
        // this simulates when the OS has not removed the file yet
        itemAtDestinationState = 'removed';
        return failure(AccessErrorOperationNotPermitted);
      } else if (itemAtDestinationState === 'removed') {
        // Second call to access after remove should throw file/directory does not exist error ENOENT
        // this is simulating the OS actually removing the file
        return failure(AccessErrorNoSuchFileOrDirectory);
      }

      return success(null);
    });

    const copySpy = spyOn(fileSystemOperations, 'copyTo').and.callFake(
      // tslint:disable-next-line:no-any variable-name
      async (_srcFileAbsolutePath: any, destinationFileAbsolutePath: any) => {
        expect(destinationFileAbsolutePath).toEqual(pathToFileInDestination);
        expect(itemAtDestinationState).toEqual('removed', `Item at ${destinationFileAbsolutePath} has not been removed`);
        itemAtDestinationState = 'isFile';
      }
    );

    await replaceDirectoryContentsWithFiles(
      FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot), fileSystemOperations),
      [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot), fileSystemOperations)],
      [file],
      getVirtualLoggerInstance()
    );

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(itemAtDestinationState).toEqual('isFile');

    done();
  });

  it(`should return a helpful error in the case when the file system does not remove the file after a remove call`, async done => {
    const sourceDirRoot = 'source';
    const destinationDirRoot = 'destination';
    const file = 'file.txt';
    const pathToTestDirectory = await createTestDirectoryWithContents({
      [sourceDirRoot]: directoryDescription({
        [file]: fileDescription(''),
      }),
      [destinationDirRoot]: directoryDescription({
        [file]: directoryDescription({}),
      }),
    });
    const pathToFileInDestination = path.join(pathToTestDirectory, destinationDirRoot, file);

    // tslint:disable-next-line:no-any
    const removeSpy = spyOn(fileSystemOperations, 'remove').and.callFake(async (fileAbsolutePath: any) => {
      expect(fileAbsolutePath).toEqual(pathToFileInDestination);
    });

    // tslint:disable-next-line:no-any
    spyOn(fileSystemOperations, 'access').and.callFake(async (fileAbsolutePath: any) => {
      expect(fileAbsolutePath).toEqual(pathToFileInDestination);
      // OS will throw EPERM errors when the file is in a 'pending delete' state
      return failure(AccessErrorOperationNotPermitted);
    });

    const logger = getVirtualLoggerInstance();
    const loggerErrorSpy = spyOn(logger, 'error').and.callThrough();

    try {
      await replaceDirectoryContentsWithFiles(
        FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, sourceDirRoot), fileSystemOperations),
        [FileSystemAbsolutePath.getInstance(path.join(pathToTestDirectory, destinationDirRoot), fileSystemOperations)],
        [file],
        logger
      );
      fail('expected replaceDirectoryContentsWithFiles to throw an error');
    } catch (error) {
      expect(error.message).toEqual(
        `Path exists ${pathToFileInDestination} but received ${AccessErrorOperationNotPermitted} when accessing it. ` +
          `If a remove call has just been made this likely means the item is in a 'PENDING DELETE' state due to another process still accessing it.`
      );
    }

    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    expect(logger.lastMessage()).toMatch(/Unable to remove item.*/);
    expect(removeSpy).toHaveBeenCalledTimes(1);

    done();
  });
});
