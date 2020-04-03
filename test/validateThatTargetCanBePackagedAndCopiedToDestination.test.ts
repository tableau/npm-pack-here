import * as path from 'path';
import { validateThatTargetCanBePackagedAndCopiedToDestination } from '../src/validateThatTargetCanBePackagedAndCopiedToDestination';

describe(`Input Validation`, () => {
  describe(`should fail if target npm project does not have a package name`, () => {
    async function checkThatValidatInputsThrowsInvalidPackageNameError(
      target: string,
      destination: string,
      packageJsonContent: { name?: unknown }
    ): Promise<void> {
      try {
        await validateThatTargetCanBePackagedAndCopiedToDestination(target, [destination], packageJsonContent);
        fail('Expected validateInputs to throw');
      } catch (error) {
        expect(error.message).toMatch(
          /Could not get target package name from package.json in '.*', check that this is a valid package.json/
        );
      }
    }
    const targetProjectPath = 'target';
    const destinationDirectoryPath = 'destination';

    it(`(name is undefined)`, async done => {
      await checkThatValidatInputsThrowsInvalidPackageNameError(targetProjectPath, destinationDirectoryPath, {});
      done();
    });

    it(`(name is invalid)`, async done => {
      await checkThatValidatInputsThrowsInvalidPackageNameError(targetProjectPath, destinationDirectoryPath, { name: {} });
      done();
    });
  });

  it(`should fail if a destination directory path is located in or equal to the target directory path`, async done => {
    const targetProjectPath = 'target';
    const validDestinationPath = 'destination';
    const invalidDestinationPath = path.join(targetProjectPath, 'destination');
    const anotherInvalidDestinationPath = targetProjectPath;

    try {
      await validateThatTargetCanBePackagedAndCopiedToDestination(
        targetProjectPath,
        [validDestinationPath, invalidDestinationPath, anotherInvalidDestinationPath],
        {
          name: 'someName',
        }
      );
      fail('Expected validateInputs to throw');
    } catch (error) {
      expect(error.message).toEqual(
        `Cannot set destination directories as a child of the target project directory.\nThese directories are invalid [${invalidDestinationPath}, ${anotherInvalidDestinationPath}].`
      );
    }
    done();
  });

  it(`should return the npm project name`, async done => {
    const targetProjectPath = 'target';
    const destinationDirectoryPath = 'destination';
    const projectName = '@namespace/name';

    const { targetProjectName } = await validateThatTargetCanBePackagedAndCopiedToDestination(
      targetProjectPath,
      [destinationDirectoryPath],
      { name: projectName }
    );
    expect(targetProjectName).toEqual(projectName);
    done();
  });

  it(`should return the resolved destination path plus the project name as the path to copy too`, async done => {
    const targetProjectPath = 'target';
    const destinationDirectoryPath = 'destination';
    const projectName = '@namespace/name';
    const expectedPathToCopyTo = path.join(destinationDirectoryPath, projectName);

    const { absolutePathsToDestinationDirectoriesToCopyTo } = await validateThatTargetCanBePackagedAndCopiedToDestination(
      targetProjectPath,
      [destinationDirectoryPath],
      {
        name: projectName,
      }
    );
    expect(absolutePathsToDestinationDirectoriesToCopyTo[0]).toEqual(expectedPathToCopyTo);
    done();
  });
});
