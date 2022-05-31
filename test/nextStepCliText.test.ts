import { some } from 'fp-ts/lib/Option';
import * as path from 'path';
import { maybeOutputNextStepsText } from '../src/nextStepCliText';
import { getVirtualLoggerInstance } from './virtualLogger';

describe(`Next steps cli text`, () => {
  it(`should output yarn commands to run if target project is not setup as a local dependency`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const anotherTargetProject = 'anotherTargetProject';
    const yetAnotherTargetProject = 'yetAnotherTargetProject';
    const destinationDirectoryPath = 'E:/some_path';

    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      destinationDirectoryPath /* maybeDestinationDirectoryToAddDependencyOn */,
      [
        { targetProjectName: targetProject, targetProjectAbsolutePath: targetProject },
        { targetProjectName: anotherTargetProject, targetProjectAbsolutePath: anotherTargetProject },
        { targetProjectName: yetAnotherTargetProject, targetProjectAbsolutePath: yetAnotherTargetProject },
      ],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
            devDependencies: {
              [anotherTargetProject]: '0.0.1',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText =
      `^\n\nSet up target projects as local dependencies with yarn using:\n` +
      `\tyarn add file:E:/some_path/widgets\n` +
      `\tyarn add -D file:E:/some_path/anotherTargetProject file:E:/some_path/yetAnotherTargetProject\n` +
      `\tyarn install --check-files\n\n.*`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should output npm commands to run if target project is not setup as a local dependency`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [{ targetProjectName: targetProject, targetProjectAbsolutePath: targetProject }],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(true) /** doesPackageLockFileExist */,
      Promise.resolve(false) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText =
      `^\n\nSet up target projects as local dependencies with npm using:\n` + `\tnpm install file:local_modules\/widgets\n\n`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should output yarn and npm commands to run if both yarn & npm locks exist and target project is not setup as a local dependency`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [{ targetProjectName: targetProject, targetProjectAbsolutePath: targetProject }],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(true) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText =
      `^\n\nSet up target projects as local dependencies with npm or yarn using:\n` +
      `\tnpm install file:local_modules\/widgets\n` +
      `  and\/or\n` +
      `\tyarn add file:local_modules\/widgets\n` +
      `\tyarn install --check-files\n\n.*`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should output yarn and npm commands to run if neither yarn nor npm locks exist and target project is not setup as a local dependency`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [{ targetProjectName: targetProject, targetProjectAbsolutePath: targetProject }],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(false) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText =
      `^\n\nSet up target projects as local dependencies with npm or yarn using:\n` +
      `\tnpm install file:local_modules\/widgets\n` +
      `  and\/or\n` +
      `\tyarn add file:local_modules\/widgets\n` +
      `\tyarn install --check-files\n\n.*`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should output post message for re-packing and/or using watch`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const anotherTargetProject = 'anotherTargetProject';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    const pathToTargetProject = path.join('..', targetProject);
    const pathToAnotherTargetProject = path.join('..', anotherTargetProject);
    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [
        { targetProjectName: targetProject, targetProjectAbsolutePath: targetProject },
        { targetProjectName: anotherTargetProject, targetProjectAbsolutePath: anotherTargetProject },
      ],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
              [anotherTargetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const regExpEscape = (text: string) => {
      return text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    };

    const escapedTargetProjectPath = regExpEscape(pathToTargetProject);
    const escapedAnotherTargetProjectPath = regExpEscape(pathToAnotherTargetProject);

    const outputMatchRegexText =
      `To get updated changes from target projects, run this command again.\n` +
      `\tnpm-pack-here --target ${escapedTargetProjectPath} ${escapedAnotherTargetProjectPath}\n` +
      `  or watch continually\n` +
      `\tnpm-pack-here watch --target ${escapedTargetProjectPath} ${escapedAnotherTargetProjectPath}\n\n$`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should not output post message if flag set to false`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [{ targetProjectName: targetProject, targetProjectAbsolutePath: targetProject }],
      false /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText = `To get updated changes from target projects, run this command again.\n`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).not.toMatch(outputMatch);
    expect(logger.lastMessage()).toMatch(/.*/);

    done();
  });

  it(`should output an error if yarn 2+ is detected without node_modules linker`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const anotherTargetProject = 'anotherTargetProject';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [
        { targetProjectName: targetProject, targetProjectAbsolutePath: targetProject },
        { targetProjectName: anotherTargetProject, targetProjectAbsolutePath: anotherTargetProject },
      ],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(true) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
              [anotherTargetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch('Error: Detected you are using yarn 2+');

    done();
  });

  it(`should output yarn commands if yarn 2+ is detected`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const anotherTargetProject = 'anotherTargetProject';
    const yetAnotherTargetProject = 'yetAnotherTargetProject';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      '/tmp/build' /* maybeDestinationDirectoryToAddDependencyOn */,
      [
        { targetProjectName: targetProject, targetProjectAbsolutePath: targetProject },
        { targetProjectName: anotherTargetProject, targetProjectAbsolutePath: anotherTargetProject },
        { targetProjectName: yetAnotherTargetProject, targetProjectAbsolutePath: yetAnotherTargetProject },
      ],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(true) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: '0.0.0',
            },
            devDependencies: {
              [anotherTargetProject]: '0.0.0',
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(true) /** isYarnBerryUsingNodeModulesLinker */
    );

    const outputMatchRegexText =
      `^\n\nSet up target projects as local dependencies with yarn using:\n` +
      `\tyarn add widgets@file:/tmp/build/widgets\n` +
      `\tyarn add -D anotherTargetProject@file:/tmp/build/anotherTargetProject yetAnotherTargetProject@file:/tmp/build/yetAnotherTargetProject\n` +
      `\tyarn install\n\n.*`;
    const outputMatch = new RegExp(outputMatchRegexText);

    expect(virtualLoggerLogSpy).toHaveBeenCalled();
    expect(logger.lastMessage()).toMatch(outputMatch);

    done();
  });

  it(`should not output anything if project setup as a local dependency`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const anotherTargetProject = 'anotherTargetProject';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      './local_modules' /* maybeDestinationDirectoryToAddDependencyOn */,
      [
        { targetProjectName: targetProject, targetProjectAbsolutePath: targetProject },
        { targetProjectName: anotherTargetProject, targetProjectAbsolutePath: anotherTargetProject },
      ],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: `file:${targetProject}`,
            },
            devDependencies: {
              [anotherTargetProject]: `file:${anotherTargetProject}`,
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    expect(virtualLoggerLogSpy).not.toHaveBeenCalled();

    done();
  });

  it(`should not output anything if command called with no destination directory defined`, async done => {
    const workingDirectory = 'destination';
    const targetProject = 'widgets';
    const logger = getVirtualLoggerInstance();
    const virtualLoggerLogSpy = spyOn(logger, 'log').and.callThrough();

    await maybeOutputNextStepsText(
      undefined /* maybeDestinationDirectoryToAddDependencyOn */,
      [{ targetProjectName: targetProject, targetProjectAbsolutePath: targetProject }],
      true /* outputPostCommandMessages */,
      logger,
      workingDirectory,
      Promise.resolve(false) /** doesPackageLockFileExist */,
      Promise.resolve(true) /** doesYarnLockFileExist */,
      Promise.resolve(false) /** doesYarnrcYmlFileExist */,
      () =>
        Promise.resolve(
          some({
            dependencies: {
              [targetProject]: `0.0.0`,
            },
          })
        ) /** getPackageJsonContents */,
      () => Promise.resolve(false) /** isYarnBerryUsingNodeModulesLinker */
    );

    expect(virtualLoggerLogSpy).not.toHaveBeenCalled();

    done();
  });
});
