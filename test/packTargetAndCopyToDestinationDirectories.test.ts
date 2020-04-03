import * as fs from 'fs-extra';
import * as path from 'path';
import { getPackAndCopyCallsForTargets } from '../src/packTargetAndCopyToDestinationDirectories';
import { createTestDirectoryWithContents, directoryDescription, fileDescription } from './temporaryDirectory';
import { getVirtualLoggerInstance } from './virtualLogger';

describe(`getPackAndCopyCallsForTargets`, () => {
  it(`should generate a packAndCopy call for all destinations`, async done => {
    const targetDirectory = 'target';
    const destination1Directory = 'destination1';
    const destination2Directory = 'destination2';

    const pathToTestDirectories = await createTestDirectoryWithContents({
      [targetDirectory]: directoryDescription({
        'package.json': fileDescription(JSON.stringify({ name: 'project' })),
      }),
      [destination1Directory]: directoryDescription({}),
      [destination2Directory]: directoryDescription({}),
    });

    const absolutePathToTarget = path.resolve(pathToTestDirectories, targetDirectory);
    const absolutePathsToDestinations = [
      path.resolve(pathToTestDirectories, destination1Directory),
      path.resolve(pathToTestDirectories, destination2Directory),
    ];
    const logger = getVirtualLoggerInstance();
    const targetPackAndCopyToCalls = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      absolutePathsToDestinations,
      false,
      logger
    );

    expect(targetPackAndCopyToCalls.rootTargets).toEqual([
      { targetProjectName: 'project', targetProjectAbsolutePath: absolutePathToTarget },
    ]);
    expect(targetPackAndCopyToCalls.packAndCopyCalls).toEqual([
      {
        absolutePathToTargetProjectDirectory: absolutePathToTarget,
        absolutePathsToDestinationDirectoriesToCopyTo: absolutePathsToDestinations.map(destination => path.join(destination, 'project')),
      },
    ]);

    done();
  });

  it(`should generate a pack and copy calls into the local node_modules directory for the target and its local file path dependencies`, async done => {
    const targetDirectory = 'target';
    const workingDirectory = 'working-directory';
    const targetDependencyInLocalModules = 'target-dependency-in-local-modules';
    const targetDependencyNotInLocalModules = 'target-dependency-not-in-local-modules';

    const targetDependencyInLocalModulesDirectoryContents = directoryDescription({
      'package.json': fileDescription('{}'),
    });
    const targetDependencyNotInLocalModulesDirectoryContents = directoryDescription({
      'package.json': fileDescription(JSON.stringify({ name: targetDependencyNotInLocalModules })),
    });
    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription('{}'),
      local_modules: directoryDescription({ [targetDependencyInLocalModules]: targetDependencyInLocalModulesDirectoryContents }),
    });

    const pathToTestDirectories = await createTestDirectoryWithContents({
      [targetDirectory]: targetProjectDirectoryContents,
      [targetDependencyNotInLocalModules]: targetDependencyNotInLocalModulesDirectoryContents,
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({
          [targetDirectory]: targetProjectDirectoryContents,
          [targetDependencyInLocalModules]: targetDependencyInLocalModulesDirectoryContents,
          [targetDependencyNotInLocalModules]: targetDependencyNotInLocalModulesDirectoryContents,
        }),
        'package.json': fileDescription(JSON.stringify({ dependencies: { [targetDirectory]: `0.0.0` } })),
      }),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, targetDirectory);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();
    await fs.writeJSON(path.join(absolutePathToTarget, 'package.json'), {
      name: targetDirectory,
      dependencies: {
        [targetDependencyInLocalModules]: `file:local_modules/${targetDependencyInLocalModules}`,
        'some-other-non-local-dep': '0.0.0',
      },
    });
    await fs.writeJSON(path.join(absolutePathToTarget, 'local_modules', targetDependencyInLocalModules, 'package.json'), {
      name: targetDependencyInLocalModules,
      dependencies: {
        [targetDependencyNotInLocalModules]: `file:${path.resolve(pathToTestDirectories, targetDependencyNotInLocalModules)}`,
        'a-dependency': '0.0.0',
      },
    });

    const targetPackAndCopyToCalls = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      [] /** directoriesToCopyTo */,
      true /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
      logger,
      absolutePathToWorkingDirectory
    );

    expect(targetPackAndCopyToCalls.rootTargets).toEqual([
      { targetProjectName: targetDirectory, targetProjectAbsolutePath: absolutePathToTarget },
    ]);
    expect(targetPackAndCopyToCalls.packAndCopyCalls).toEqual([
      {
        absolutePathToTargetProjectDirectory: absolutePathToTarget,
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', targetDirectory)),
        ],
      },
      {
        absolutePathToTargetProjectDirectory: path.resolve(absolutePathToTarget, 'local_modules', targetDependencyInLocalModules),
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', targetDependencyInLocalModules)),
        ],
      },
      {
        absolutePathToTargetProjectDirectory: path.resolve(pathToTestDirectories, targetDependencyNotInLocalModules),
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', targetDependencyNotInLocalModules)),
        ],
      },
    ]);

    done();
  });

  it(`should not generate pack and copy calls into the node_modules directory for a target that is not a dependency`, async done => {
    const target = 'target';
    const workingDirectory = 'working-directory';
    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription(JSON.stringify({ name: target })),
    });
    const pathToTestDirectories = await createTestDirectoryWithContents({
      [target]: targetProjectDirectoryContents,
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({
          [target]: targetProjectDirectoryContents,
        }),
        'package.json': fileDescription(JSON.stringify({ dependencies: {} })),
      }),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, target);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();

    const targetPackAndCopyToCalls = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      [] /** directoriesToCopyTo */,
      true /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
      logger,
      absolutePathToWorkingDirectory
    );

    expect(targetPackAndCopyToCalls.rootTargets).toEqual([{ targetProjectName: target, targetProjectAbsolutePath: absolutePathToTarget }]);
    expect(targetPackAndCopyToCalls.packAndCopyCalls).toEqual([
      {
        absolutePathToTargetProjectDirectory: absolutePathToTarget,
        absolutePathsToDestinationDirectoriesToCopyTo: [],
      },
    ]);

    done();
  });

  it(`should throw an error if local file dependency does not have a package.json but node_modules directory does`, async done => {
    const target = 'target';
    const workingDirectory = 'working-directory';
    const targetDependency = 'target-dependency';
    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription(
        JSON.stringify({
          name: target,
          dependencies: {
            [targetDependency]: `file:local_modules/${targetDependency}`,
          },
        })
      ),
      local_modules: directoryDescription({ [targetDependency]: directoryDescription({}) }),
    });
    const pathToTestDirectories = await createTestDirectoryWithContents({
      [target]: targetProjectDirectoryContents,
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({
          [target]: targetProjectDirectoryContents,
          [targetDependency]: directoryDescription({ 'package.json': fileDescription('{}') }),
        }),
        'package.json': fileDescription(JSON.stringify({ devDependencies: { [target]: `0.0.0` } })),
      }),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, target);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();

    try {
      await getPackAndCopyCallsForTargets(
        [absolutePathToTarget],
        [] /** directoriesToCopyTo */,
        true /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
        logger,
        absolutePathToWorkingDirectory
      );
      expect('unreached').toEqual('true');
    } catch (error) {
      expect(error).toMatch(/Failed to find expected package.json in.*/);
    }

    done();
  });

  it(`should throw an error if target does not have a package.json`, async done => {
    const target = 'target';
    const pathToTestDirectories = await createTestDirectoryWithContents({
      [target]: directoryDescription({}),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, target);
    const logger = getVirtualLoggerInstance();

    try {
      await getPackAndCopyCallsForTargets(
        [absolutePathToTarget],
        [] /** directoriesToCopyTo */,
        false /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
        logger
      );
      expect('unreached').toEqual('true');
    } catch (error) {
      expect(error).toMatch(/No npm project at given target location.*/);
    }

    done();
  });

  it(`should log a warning if target is not already in node_modules directory`, async done => {
    const targetDirectory = 'target';
    const targetProjectName = 'project';
    const workingDirectory = 'working-directory';

    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription(JSON.stringify({ name: targetProjectName })),
    });

    const pathToTestDirectories = await createTestDirectoryWithContents({
      [targetDirectory]: targetProjectDirectoryContents,
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({}),
        'package.json': fileDescription(JSON.stringify({ dependencies: { [targetProjectName]: `0.0.0` } })),
      }),
    });

    const absolutePathToTarget = path.resolve(pathToTestDirectories, targetDirectory);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();
    const targetPackAndCopyToCalls = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      [] /** directoriesToCopyTo */,
      true /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
      logger,
      absolutePathToWorkingDirectory
    );

    expect(targetPackAndCopyToCalls.rootTargets).toEqual([
      { targetProjectName: targetProjectName, targetProjectAbsolutePath: absolutePathToTarget },
    ]);
    expect(targetPackAndCopyToCalls.packAndCopyCalls).toEqual([
      {
        absolutePathToTargetProjectDirectory: absolutePathToTarget,
        absolutePathsToDestinationDirectoriesToCopyTo: [],
      },
    ]);

    const expectedWarningMessage = /Tried to find target package 'project' location in the node_modules directory but failed.*/;
    expect(logger.lastMessage()).toMatch(expectedWarningMessage);

    done();
  });

  it(`should handle a diamond dependency`, async done => {
    const target = 'target';
    const workingDirectory = 'working-directory';
    const targetDependency = 'target-dependency';
    const sharedDependency = 'shared-dependency';

    const targetDependencyDirectoryContents = directoryDescription({
      'package.json': fileDescription('{}'),
    });
    const sharedDependencyDirectoryContents = directoryDescription({
      'package.json': fileDescription(JSON.stringify({ name: sharedDependency })),
    });
    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription('{}'),
    });

    const pathToTestDirectories = await createTestDirectoryWithContents({
      [target]: targetProjectDirectoryContents,
      [targetDependency]: sharedDependencyDirectoryContents,
      [sharedDependency]: sharedDependencyDirectoryContents,
      [workingDirectory]: directoryDescription({
        node_modules: directoryDescription({
          [target]: targetProjectDirectoryContents,
          [targetDependency]: targetDependencyDirectoryContents,
          [sharedDependency]: sharedDependencyDirectoryContents,
        }),
        'package.json': fileDescription(JSON.stringify({ dependencies: { [target]: `0.0.0` } })),
      }),
    });
    const absolutePathToTarget = path.resolve(pathToTestDirectories, target);
    const absolutePathToWorkingDirectory = path.resolve(pathToTestDirectories, workingDirectory);
    const logger = getVirtualLoggerInstance();
    await fs.writeJSON(path.join(absolutePathToTarget, 'package.json'), {
      name: target,
      dependencies: {
        [targetDependency]: `file:${path.resolve(pathToTestDirectories, targetDependency)}`,
        [sharedDependency]: `file:${path.resolve(pathToTestDirectories, sharedDependency)}`,
      },
    });
    await fs.writeJSON(path.join(pathToTestDirectories, targetDependency, 'package.json'), {
      name: targetDependency,
      dependencies: {
        [sharedDependency]: `file:${path.resolve(pathToTestDirectories, sharedDependency)}`,
      },
    });

    const targetPackAndCopyToCalls = await getPackAndCopyCallsForTargets(
      [absolutePathToTarget],
      [] /** directoriesToCopyTo */,
      true /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
      logger,
      absolutePathToWorkingDirectory
    );

    expect(targetPackAndCopyToCalls.rootTargets).toEqual([{ targetProjectName: target, targetProjectAbsolutePath: absolutePathToTarget }]);
    expect(targetPackAndCopyToCalls.packAndCopyCalls).toEqual([
      {
        absolutePathToTargetProjectDirectory: absolutePathToTarget,
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', target)),
        ],
      },
      {
        absolutePathToTargetProjectDirectory: path.resolve(pathToTestDirectories, targetDependency),
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', targetDependency)),
        ],
      },
      {
        absolutePathToTargetProjectDirectory: path.resolve(pathToTestDirectories, sharedDependency),
        absolutePathsToDestinationDirectoriesToCopyTo: [
          await fs.realpath(path.resolve(absolutePathToWorkingDirectory, 'node_modules', sharedDependency)),
        ],
      },
    ]);

    done();
  });

  it(`should throw an error if pack and copy calls occur to the same destination directory`, async done => {
    const target1 = 'target1';
    const target2 = 'target2';
    const targetProjectDirectoryContents = directoryDescription({
      'package.json': fileDescription(
        JSON.stringify({
          name: 'duplicate-target-name',
        })
      ),
    });
    const pathToTestDirectories = await createTestDirectoryWithContents({
      [target1]: targetProjectDirectoryContents,
      [target2]: targetProjectDirectoryContents,
    });
    const logger = getVirtualLoggerInstance();
    const destinationDirectory = path.resolve(pathToTestDirectories, 'destination');

    try {
      await getPackAndCopyCallsForTargets(
        [path.resolve(pathToTestDirectories, target1), path.resolve(pathToTestDirectories, target2)],
        [destinationDirectory] /** directoriesToCopyTo */,
        false /** tryToCopyIntoNodeModulesDirectoryLocatedInCurrentWorkingDirectory */,
        logger
      );
      expect('unreached').toEqual('true');
    } catch (error) {
      expect(error).toMatch(/multiple targets are trying to pack to destination.*/);
    }

    done();
  });
});
