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
  doesYarnrcYmlFileExist: () => Promise<boolean>,
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
    doesYarnrcYmlFileExist,
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
  doesYarnrcYmlFileExist: () => Promise<boolean>,
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

  const hasNpmLock = await doesPackageLockFileExist();
  const hasYarnLock = await doesYarnLockFileExist();
  const hasYarnrcYml = await doesYarnrcYmlFileExist();
  const isUnknown = (!hasNpmLock && !hasYarnLock && !hasYarnrcYml);

  interface OutputOptions<T> {
    npm?: T;
    npmOrYarn?: T;
    post?: T;
    yarnBerry?: T;
    yarnClassic?: T;
    [s: string]: T | undefined;
  }

  let shouldEmit: OutputOptions<boolean> = {
    npm: hasNpmLock || isUnknown,
//    npmOrYarn: (hasNpmLock && (hasYarnLock || hasYarnrcYml)) || isUnknown,
    npmOrYarn: (hasNpmLock && hasYarnLock) || isUnknown,
    yarnBerry: hasYarnrcYml,
    yarnClassic: (hasYarnLock && !hasYarnrcYml) || isUnknown,
    post: outputPostCommandMessages,
  };

  const targetProjectPaths = targetProjects.map(targetProject =>
    path.relative(workingDirectoryAbsolutePath, targetProject.targetProjectAbsolutePath)
  );

  const argJoin = (arg: string[]) => {
    return arg.join(' ');
  };

  const commandForPaths = (command: string, maybePaths: Option<string[]>): string => {
    return maybePaths.fold('', paths => `\t${command} ${argJoin(paths)}\n`);
  };

  const thisCommand = cliConstants.commandName;
  const targetArg = cliConstants.targetProjectArg;
  const watch = cliConstants.watchCommandArg;

  type StringProducer = () => string;
  type OutputProvider = string | StringProducer | StringProducer[];
  type OutputSpecification = OutputProvider | OutputOptions<OutputProvider>;

  const outputSpec: OutputSpecification[] = [
    `

Set up target projects as local dependencies with `,
    { npm: 'npm', npmOrYarn: ' or ', yarnClassic: 'yarn' },
    ` using:
`,
    {
      npm: [() => commandForPaths('npm install', dependencyPaths), () => commandForPaths('npm install -D', devDependencyPaths)],
      npmOrYarn: '  and/or\n',
      yarnClassic: [
        () => commandForPaths('yarn add', dependencyPaths),
        () => commandForPaths('yarn add -D', devDependencyPaths),
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

  // @ts-ignore noImplicitAny - can't typecheck this recursive return type
  // Option<string> | (Option<string> | Option<string>[])[] | ...
  const evaluator = (output?: OutputProvider | OutputOptions<OutputProvider>) => {
    if (typeof output === 'string') {
      return some(output);
    } else if (typeof output === 'function') {
      return evaluator(output());
    } else if (Array.isArray(output)) {
      return output.map(o => evaluator(o));
    } else if (output && typeof output === 'object') {
      return Object.keys(output)
        .sort()
        .map(opt => (shouldEmit[opt] ? evaluator(output[opt]) : none));
    } else {
      return none;
    }
  };

  const maxNesting = 3; // OutputOptions<StringProducer[]>[]
  const evaluated: Option<string>[] = outputSpec.map(evaluator).flat(maxNesting);
  const stringified: string = evaluated.map(getOrElse(() => '')).join('');

  return some(stringified);
}
