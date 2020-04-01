import * as yargs from 'yargs';

export const commandName = 'npm-pack-here';

export const versionArg = 'version';
export const helpArg = 'help';

export const watchCommandArg = 'watch';

export const targetProjectArg = 'target';
export const targetProjectOptionsParams: yargs.Options = {
  alias: 't',
  describe: `directories containing npm projects to package and copy to destinations`,
  type: 'array',
  demandOption: true,
};

export const packToGlobalLocationArg = 'useGlobalCache';
export const packToGlobalLocationOptions: yargs.Options = {
  describe: `use a global cache location as the destination for packed content`,
  type: 'boolean',
};

export const updateRelativeNodeModulesDirectoryArgument = 'updateRelativeNodeModulesDirectory';
export const updateRelativeNodeModulesDirectoryOptions: yargs.Options = {
  describe: `try to add the correct folders in the './node_modules' directory to the list of destinations`,
  type: 'boolean',
  default: true,
};

export const defaultLocalModulesFolderPath = './local_modules';
export const defaultDestinationDirectories = [defaultLocalModulesFolderPath];
export const destinationDirectoriesArg = 'destinations';
export const destinationDirectoriesOptions: yargs.Options = {
  alias: 'd',
  describe:
    `directories to copy packaged content too, ` +
    `cannot be used with ${packToGlobalLocationArg}, ` +
    `if neither this argument or ${packToGlobalLocationArg} is set then defaults to [${defaultDestinationDirectories.join(', ')}]`,
  type: 'array',
  conflicts: [packToGlobalLocationArg],
};

export const defaultExcludedDestinationPaths = ['node_modules', '.git'];
export const excludedDestinationPathsArg = 'excludedDestinationPaths';
export const excludedDestinationPathsOptions: yargs.Options = {
  alias: 'e',
  describe: `globs for file and directory paths in the destination directory to exclude from being replaced`,
  type: 'array',
  default: defaultExcludedDestinationPaths,
};

export const infoLogLevelArg = 'info';
export const infoLogLevelArgOptions: yargs.Options = {
  describe: `set the log level to info to get more detailed logging output`,
  type: 'boolean',
  default: false,
};

export const debugLogLevelArg = 'debug';
export const debugLogLevelArgOptions: yargs.Options = {
  describe: 'set the log level to debug to get very verbose/detailed logging output',
  type: 'boolean',
  default: false,
};

export const baseDescriptionString =
  'Package the given npm project and copy the packaged files to the specified directories replacing the existing content.';
