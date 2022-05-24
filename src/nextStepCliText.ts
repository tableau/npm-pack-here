import { fromNullable, getOrElse, none, Option, some } from 'fp-ts/lib/Option';
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

  const devDependencyPaths = some(devAndMissingDependencies).filter(dependencies => dependencies.length > 0);
  const dependencyPaths = some(prodDependencies).filter(dependencies => dependencies.length > 0);

  if (dependencyPaths.isNone() && devDependencyPaths.isNone()) {
    return none;
  }

  let hasOption: OutputOptions = {
    npm: await doesPackageLockFileExist(),
    yarn: await doesYarnLockFileExist(),
    post: outputPostCommandMessages,
  };
  hasOption.npmOrYarn = hasOption.npm && hasOption.yarn;

  const targetProjectPaths = targetProjects.map(targetProject =>
    path.relative(workingDirectoryAbsolutePath, targetProject.targetProjectAbsolutePath)
  );

  const thisCommand = cliConstants.commandName;
  const targetArg = cliConstants.targetProjectArg;
  const watch = cliConstants.watchCommandArg;

  const argJoin = (arg: string[]) => {
    return arg.join(' ');
  };

  interface OutputOptions {
    npm?: boolean;
    npmOrYarn?: boolean;
    post?: boolean;
    yarn?: boolean;
    [s: string]: boolean | undefined;
  }
  type StringProducer = () => string;
  type OutputProvider = string | StringProducer | StringProducer[];
  interface OptionalOutputProvider {
    npm?: OutputProvider;
    npmOrYarn?: OutputProvider;
    post?: OutputProvider;
    yarn?: OutputProvider;
    [s: string]: OutputProvider | undefined;
  }
  type OutputSpecification = string | OptionalOutputProvider;

  let a: OutputSpecification[] = [
    `

Set up target projects as local dependencies with `,
    { npm: 'npm', npmOrYarn: ' or ', yarn: 'yarn' },
    ` using:
`,
    {
      npm: [
        () => dependencyPaths.fold('', (paths) => `\tnpm install ${argJoin(paths)}\n`),
        () => devDependencyPaths.fold('', (paths) => `\tnpm install -D ${argJoin(paths)}\n`),
      ],
      npmOrYarn: '  and/or\n',
      yarn: [
        () => dependencyPaths.fold('', (paths) => `\tyarn add ${argJoin(paths)}\n`),
        () => devDependencyPaths.fold('', (paths) => `\tyarn add -D ${argJoin(paths)}\n`),
        () => '\tyarn install --check-files\n',
      ],
    },
    `
`,
    {
      post: () =>
        `To get updated changes from target projects, run this command again.
\t${thisCommand} --${targetArg} ${argJoin(targetProjectPaths)}
  or watch continually
\t${thisCommand} ${watch} --${targetArg} ${argJoin(targetProjectPaths)}
`,
    },
  ];

  const evaluator = (s: string | OptionalOutputProvider): (Option<string> | Option<string>[])[] | Option<string> => {
    if (typeof s === 'string') {
      return some(s);
    } else {
      return Object.keys(s)
        .sort()
        .map(opt => {
          if (!hasOption[opt]) {
            return none;
          }

          const outputProvider = s[opt];
          if (outputProvider === undefined) {
            return none;
          } else if (typeof outputProvider === 'string') {
            return some(outputProvider);
          } else if (Array.isArray(outputProvider)) {
            return outputProvider.map(o => some(o()));
          } else {
            return some(outputProvider());
          }
        });
    }
  };

  const evaluated: Option<string>[] = a.map(evaluator).flat(3);
  const stringified: string = evaluated.map(getOrElse(() => '')).join('');

  return some(stringified);
}
