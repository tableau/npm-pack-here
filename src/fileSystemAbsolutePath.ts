import { Validation } from 'fp-ts/lib/Validation';
import * as path from 'path';
import { FileSystemItemStatistics, fileSystemOperations, FileSystemReadOperations } from './fileSystemOperations';

export interface CopyOptions {
  /**
   * When true, will set last modification and access times to the ones of the original source files.
   * When false, timestamp behavior is OS-dependent. Default is false.
   */
  readonly preserveTimestamps: boolean;
}

export class FileSystemAbsolutePath {
  public static getInstance(fileSystemPath: string, fileSystem: FileSystemReadOperations = fileSystemOperations): FileSystemAbsolutePath {
    return new FileSystemAbsolutePath(path.resolve(fileSystemPath), fileSystem);
  }

  private absolutePath: string;
  private fileSystemOperations: FileSystemReadOperations;

  private constructor(absolutePath: string, fileSystem: FileSystemReadOperations) {
    this.absolutePath = absolutePath;
    this.fileSystemOperations = fileSystem;
  }

  public get AbsolutePath(): string {
    return this.absolutePath;
  }

  public async access(): Promise<Validation<string, null>> {
    return this.fileSystemOperations.access(this.AbsolutePath);
  }

  public async copyTo(destination: FileSystemAbsolutePath, options?: Partial<CopyOptions>): Promise<void> {
    return this.fileSystemOperations.copyTo(this.AbsolutePath, destination.AbsolutePath, options);
  }

  public async remove(): Promise<void> {
    return this.fileSystemOperations.remove(this.AbsolutePath);
  }

  public relativePathFrom(basePath: FileSystemAbsolutePath): string {
    return path.relative(basePath.absolutePath, this.AbsolutePath);
  }

  public read(): Promise<string> {
    return this.fileSystemOperations.readFile(this.AbsolutePath);
  }

  public getAbsolutePathRelativeFromHere(relativePath: string): FileSystemAbsolutePath {
    return FileSystemAbsolutePath.getInstance(path.resolve(this.absolutePath, relativePath), this.fileSystemOperations);
  }

  public get Exists(): Promise<boolean> {
    return this.fileSystemOperations.pathExists(this.AbsolutePath);
  }

  public get Stats(): Promise<FileSystemItemStatistics> {
    return this.fileSystemOperations.getStatistics(this.AbsolutePath);
  }

  public get ContainedItemNames(): Promise<string[]> {
    return this.fileSystemOperations.getItemNames(this.AbsolutePath);
  }

  public toString(): string {
    return this.AbsolutePath;
  }
}
