import { failure, success, Validation } from 'fp-ts/lib/Validation';
import { constants } from 'fs';
import * as fsExtra from 'fs-extra';
import * as jsYaml from 'js-yaml';

export type FileSystemItemFileType = 'file';
export const FileSystemItemFileType = 'file';
export type FileSystemItemDirectoryType = 'directory';
export const FileSystemItemDirectoryType = 'directory';
export type FileSystemItemSymlinkType = 'symlink';
export const FileSystemItemSymlinkType = 'symlink';

export interface FileSystemItemStatistics {
  readonly type: FileSystemItemFileType | FileSystemItemDirectoryType | FileSystemItemSymlinkType;
  readonly modifiedTime: Date;
  readonly size: number;
}

export interface CopyOptions {
  /**
   * When true, will set last modification and access times to the ones of the original source files.
   * When false, timestamp behavior is OS-dependent. Default is false.
   */
  readonly preserveTimestamps: boolean;
}

export interface ItemTimes {
  readonly modifiedTime: Date;
}

export interface FileSystemReadOperations {
  access(path: string): Promise<Validation<string, null>>;
  copyTo(srcPath: string, destPath: string, options?: Partial<CopyOptions> | undefined): Promise<void>;
  remove(itemPath: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  readJson(filePath: string): Promise<unknown>;
  readYaml(filePath: string): Promise<unknown>;
  pathExists(path: string): Promise<boolean>;
  getStatistics(path: string): Promise<FileSystemItemStatistics>;
  getItemNames(rootDir: string): Promise<string[]>;
  isFile(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
}

export interface FileSystemWriteOperations {
  writeFile(path: string, contents: string): Promise<void>;
  setTimes(itemPath: string, times: ItemTimes): Promise<void>;
  ensureDirectory(dirPath: string): Promise<void>;
  ensureSymlink(symlinkLocationPath: string, symlinkTargetPath: string): Promise<void>;
}

export const fileSystemOperations: FileSystemReadOperations & FileSystemWriteOperations = {
  access: (path: string): Promise<Validation<string, null>> => {
    return fsExtra
      .access(path, constants.F_OK)
      .then(() => {
        return success<string, null>(null);
      })
      .catch(error => {
        return failure<string, null>(error!.code);
      });
  },
  copyTo: async (srcPath: string, destPath: string, options?: Partial<CopyOptions> | undefined): Promise<void> => {
    try {
      const copyOptions = Object.assign(
        {
          overwrite: true,
          errorOnExist: false,
          filter: () => true,
          preserveTimestamps: false,
        },
        options
      );

      await fsExtra.copy(srcPath, destPath, copyOptions);
    } catch (error) {
      console.error(`Unable to copy item ${srcPath} to ${destPath}`);
      console.error(error);
    }
  },
  remove: async (itemPath: string): Promise<void> => {
    return fsExtra.remove(itemPath);
  },
  readFile: async (filePath: string): Promise<string> => {
    return fsExtra.readFile(filePath, 'utf-8');
  },
  readJson: async (filePath: string): Promise<unknown> => {
    return fsExtra.readJson(filePath, { encoding: 'utf-8' });
  },
  readYaml: async (filePath: string): Promise<unknown> => {
    return fileSystemOperations.readFile(filePath).then(content => jsYaml.load(content));
  },
  pathExists: (path: string): Promise<boolean> => {
    return fsExtra.pathExists(path);
  },
  getStatistics: async (path: string): Promise<FileSystemItemStatistics> => {
    const itemStats = await fsExtra.lstat(path);
    const type = itemStats.isDirectory() ? 'directory' : itemStats.isSymbolicLink() ? 'symlink' : 'file';

    return {
      modifiedTime: itemStats.mtime,
      size: itemStats.size,
      type: type,
    };
  },
  getItemNames: (rootDir: string): Promise<string[]> => {
    return fsExtra.readdir(rootDir);
  },
  isFile: async (path: string): Promise<boolean> => {
    return (await fsExtra.stat(path)).isFile();
  },
  isDirectory: async (path: string): Promise<boolean> => {
    return (await fsExtra.stat(path)).isDirectory();
  },
  writeFile: (path: string, contents: string): Promise<void> => {
    return fsExtra.outputFile(path, contents);
  },
  setTimes: (itemPath: string, times: ItemTimes): Promise<void> => {
    return fsExtra.utimes(itemPath, new Date(Date.now()), times.modifiedTime);
  },
  ensureDirectory: (dirPath: string): Promise<void> => {
    return fsExtra.ensureDir(dirPath);
  },
  ensureSymlink: (symlinkLocationPath: string, symlinkTargetPath: string): Promise<void> => {
    // https://nodejs.org/api/fs.html#fs_fs_symlink_target_path_type_callback
    // target of symlink is the first parameter then symlink's actual location
    return fsExtra.symlink(symlinkTargetPath, symlinkLocationPath);
  },
};
