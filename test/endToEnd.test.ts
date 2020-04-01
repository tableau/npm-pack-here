import * as fs from 'fs-extra';
import * as path from 'path';
import { defaultExcludedDestinationPaths } from '../src/cliConstants';
import { executePackageTargetAndCopyToDestinationDirectoriesCalls, getPackAndCopyCallsForTargets } from '../src/index';
import { createTestDirectoryWithContents, directoryDescription, fileDescription } from './temporaryDirectory';
import { getVirtualLoggerInstance } from './virtualLogger';

describe('end to end', () => {
  it(`should run pack and copy for valid arguments`, async done => {
    const targetDirectory = 'target';
    const targetDependencyDirectory = 'target-dependency';
    const destinationDirectory = 'destination';
    const workingDirectory = 'working-directory';
    const targetDirectoryPackageJson = fileDescription(JSON.stringify({ name: targetDirectory }));
    const targetDependencyDirectoryPackageJson = fileDescription(JSON.stringify({ name: targetDependencyDirectory }));
    const packageJsonFileName = 'package.json';
    const pathToTestDirectories = await createTestDirectoryWithContents({
      [targetDirectory]: directoryDescription({
        [packageJsonFileName]: targetDirectoryPackageJson,
        'target-directory-new-file': fileDescription(''),
      }),
      [targetDependencyDirectory]: directoryDescription({
        [packageJsonFileName]: targetDependencyDirectoryPackageJson,
        'target-dependency-directory-new-file': fileDescription(''),
      }),
      [destinationDirectory]: directoryDescription({}),
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({
          [targetDirectory]: directoryDescription({ [packageJsonFileName]: targetDirectoryPackageJson }),
          [targetDependencyDirectory]: directoryDescription({ [packageJsonFileName]: targetDependencyDirectoryPackageJson }),
        }),
        [packageJsonFileName]: fileDescription(JSON.stringify({ name: 'working', dependencies: { [targetDirectory]: '0.0.0' } })),
      }),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, targetDirectory);
    const absolutePathToTargetDependency = path.resolve(pathToTestDirectories, targetDependencyDirectory);
    await fs.writeJSON(path.join(absolutePathToTarget, packageJsonFileName), {
      name: targetDirectory,
      dependencies: {
        [targetDependencyDirectory]: `file:${absolutePathToTargetDependency}`,
        'some-random-dependency': '0.0.0',
      },
    });
    const absolutePathToDestination = path.resolve(pathToTestDirectories, destinationDirectory);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();

    // get and execute pack and copy commands
    const { packAndCopyCalls, rootTargets } = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      [absolutePathToDestination],
      true /** tryToCopyToLocalNodeModulesDirectory */,
      logger,
      absolutePathToWorkingDirectory
    );
    await executePackageTargetAndCopyToDestinationDirectoriesCalls(defaultExcludedDestinationPaths, logger, packAndCopyCalls);

    expect(rootTargets).toEqual([{ targetProjectName: targetDirectory, targetProjectAbsolutePath: absolutePathToTarget }]);
    expect(await fs.pathExists(path.join(absolutePathToDestination, targetDirectory, 'target-directory-new-file'))).toBe(true);
    expect(
      await fs.pathExists(path.join(absolutePathToDestination, targetDependencyDirectory, 'target-dependency-directory-new-file'))
    ).toBe(false);
    expect(
      await fs.pathExists(path.join(absolutePathToWorkingDirectory, 'node_modules', targetDirectory, 'target-directory-new-file'))
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(absolutePathToWorkingDirectory, 'node_modules', targetDependencyDirectory, 'target-dependency-directory-new-file')
      )
    ).toBe(true);

    done();
  });
});
