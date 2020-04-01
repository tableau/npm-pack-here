import { fromNullable, none, Option, some } from 'fp-ts/lib/Option';
import * as path from 'path';
import * as cliConstants from './cliConstants';
import { Logger } from './logger';
import { PackageJsonContent } from './packageJson';

export type TargetProjectNameAndAbsolutePath = { targetProjectName: string; targetProjectAbsolutePath: string };
export type TargetProjectsNameAndAbsolutePaths = TargetProjectNameAndAbsolutePath[];

export async function maybeOutputNextStepsText(
  maybeDestinationDirectoryToAddDependencyOn: string | undefined,
  targetProjects: TargetProjectsNameAndAbsolutePaths,
  outputPostCommandMessages: boolean,
  logger: Logger,
  workingDirectoryAbsolutePath: string,
  doesPackageLockFileExist: () => Promise<boolean>,
  doesYarnLockFileExist: () => Promise<boolean>,
  getPackageJsonContents: () => Promise<Option<PackageJsonContent>>
): Promise<void> {
  if (maybeDestinationDirectoryToAddDependencyOn === undefined) {
    return;
  }
  const packageJsonContent = await getPackageJsonContents();

  if (packageJsonContent.isNone()) {
    return;
  }

  const maybeOutputMessage = await outputLocalSetupCommandsIfProjectsNotAlreadyConfiguredAsLocal(
    packageJsonContent.value,
    targetProjects,
    doesPackageLockFileExist,
    doesYarnLockFileExist,
    workingDirectoryAbsolutePath,
    outputPostCommandMessages,
    maybeDestinationDirectoryToAddDependencyOn
  );

  if (maybeOutputMessage.isSome()) {
    logger.log(() => maybeOutputMessage.value);
  }
}

async function outputLocalSetupCommandsIfProjectsNotAlreadyConfiguredAsLocal(
  packageJsonContent: PackageJsonContent,
  targetProjects: TargetProjectsNameAndAbsolutePaths,
  doesPackageLockFileExist: () => Promise<boolean>,
  doesYarnLockFileExist: () => Promise<boolean>,
  workingDirectoryAbsolutePath: string,
  outputPostCommandMessages: boolean,
  destinationDirectoryToAddDependencyOn: string
): Promise<Option<string>> {
  const maybeDevDependencies = fromNullable(packageJsonContent.devDependencies);
  const maybeDependencies = fromNullable(packageJsonContent.dependencies);

  interface DevDependency {
    type: 'development';
    folderPath: string;
    versionText: string;
  }
  interface Dependency {
    type: 'production';
    folderPath: string;
    versionText: string;
  }
  interface NotADependency {
    type: 'missing';
    folderPath: string;
  }

  const isTargetConfiguredAsLocalDependency = (version: string) => {
    return version.startsWith(`file:`) || version.startsWith(`link:`);
  };

  const targetDependenciesToInstall = targetProjects
    .map(targetProject => {
      const targetProjectName = targetProject.targetProjectName;
      const folderPathWithForwardSlashes = `file:${path.posix.join(destinationDirectoryToAddDependencyOn, targetProjectName)}`;
      const targetDevDependencyIfNotInstalledAlready = maybeDevDependencies.chain(devDependencies =>
        fromNullable(devDependencies[targetProjectName]).map<DevDependency>(versionText => ({
          type: 'development',
          folderPath: folderPathWithForwardSlashes,
          versionText: versionText,
        }))
      );
      const targetDependencyIfNotInstalledAlready = maybeDependencies.chain(dependencies =>
        fromNullable(dependencies[targetProjectName]).map<Dependency>(versionText => ({
          type: 'production',
          folderPath: folderPathWithForwardSlashes,
          versionText: versionText,
        }))
      );
      return (targetDependencyIfNotInstalledAlready as Option<Dependency | DevDependency | NotADependency>)
        .alt(targetDevDependencyIfNotInstalledAlready)
        .getOrElse({ type: 'missing', folderPath: folderPathWithForwardSlashes });
    })
    .filter(dependency => dependency.type === 'missing' || !isTargetConfiguredAsLocalDependency(dependency.versionText));

  const devAndMissingDependencies = targetDependenciesToInstall
    .filter(dependency => dependency.type === 'development' || dependency.type === 'missing')
    .map(dependency => dependency.folderPath);

  const prodDependencies = targetDependenciesToInstall
    .filter(dependency => dependency.type === 'production')
    .map(dependency => dependency.folderPath);

  const devAddCommands = some(devAndMissingDependencies)
    .filter(dependencies => dependencies.length > 0)
    .map(dependencies => ({ yarn: [`yarn add -D ${dependencies.join(' ')}`], npm: [`npm install -D ${dependencies.join(' ')}`] }));

  const prodAddCommands = some(prodDependencies)
    .filter(dependencies => dependencies.length > 0)
    .map(dependencies => ({ yarn: [`yarn add ${dependencies.join(' ')}`], npm: [`npm install ${dependencies.join(' ')}`] }));

  const addCommands = prodAddCommands
    .fold(devAddCommands, prodCommands =>
      some(
        devAddCommands.fold(prodCommands, devCommands => ({
          npm: prodCommands.npm.concat(devCommands.npm),
          yarn: prodCommands.yarn.concat(devCommands.yarn),
        }))
      )
    )
    .map(({ npm, yarn }) => ({ npm, yarn: yarn.concat(['yarn install --check-files']) }));
  const maybeFilesExist = await addCommands.fold<
    Promise<
      Option<{
        yarnLockPresent: boolean;
        packageLockPresent: boolean;
      }>
    >
  >(Promise.resolve(none), async _ => {
    const yarnLockPresent = await doesYarnLockFileExist();
    const packageLockPresent = await doesPackageLockFileExist();
    return some({ yarnLockPresent, packageLockPresent });
  });

  const yarnCommandsIfYarnLockPresent = addCommands.chain(({ yarn }) =>
    maybeFilesExist.chain(({ yarnLockPresent }) => (yarnLockPresent ? some(yarn) : none))
  );

  const npmCommandsIfPackageLockPresent = addCommands.chain(({ npm }) =>
    maybeFilesExist.chain(({ packageLockPresent }) => (packageLockPresent ? some(npm) : none))
  );

  const getCommandHeaderString = (yarnOrNpm: 'yarn' | 'npm' | 'both') => {
    const context = yarnOrNpm === 'both' ? 'yarn and npm' : yarnOrNpm;
    return `\n\nSetup target projects as local dependencies with ${context} using:`;
  };

  const commandsToRun = yarnCommandsIfYarnLockPresent.fold(
    npmCommandsIfPackageLockPresent.map(npmCommandsToRun => {
      return `${getCommandHeaderString('npm')}\n\t${npmCommandsToRun.join('\n\t')}`;
    }),
    yarnCommandsToRun => {
      return some(
        npmCommandsIfPackageLockPresent.fold(`${getCommandHeaderString('yarn')}\n\t${yarnCommandsToRun.join('\n\t')}`, npmCommandsToRun => {
          return `${getCommandHeaderString('both')}\n\t${yarnCommandsToRun.join('\n\t')}\n  and/or\n\t${npmCommandsToRun.join('\n\t')}`;
        })
      );
    }
  );

  return commandsToRun.map(commandsText => {
    const targetArgumentValue = targetProjects.map(targetProject =>
      path.relative(workingDirectoryAbsolutePath, targetProject.targetProjectAbsolutePath)
    );
    const commandText = cliConstants.commandName;
    const targetText = `--${cliConstants.targetProjectArg} ${targetArgumentValue.join(' ')}`;
    return outputPostCommandMessages
      ? `${commandsText}\n\nTo get updated changes from target projects, run this command again.` +
          `\n\t${commandText} ${targetText}\n  or watch continually\n\t${commandText} ${cliConstants.watchCommandArg} ${targetText}\n`
      : `${commandsText}\n\n`;
  });
}
