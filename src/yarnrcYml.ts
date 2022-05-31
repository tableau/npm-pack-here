import * as path from 'path';
import { fileSystemOperations } from './fileSystemOperations';

interface YarnrcYml {
  nodeLinker?: string;
}

const yarnrcYmlFilename = '.yarnrc.yml';
function getYarnrcYmlContents(workingDirectory: string): Promise<unknown> {
  return fileSystemOperations.readYaml(path.resolve(workingDirectory, yarnrcYmlFilename));
}

export function doesYarnrcYmlFileExist(workingDirectory: string): Promise<boolean> {
  const absolutePathToDestinationProjectYarnrcYml = path.resolve(workingDirectory, yarnrcYmlFilename);
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectYarnrcYml);
}

export async function isYarnBerryUsingNodeModulesLinker(workingDirectory: string, hasYarnrcYml?: Promise<boolean>): Promise<boolean> {
  if (hasYarnrcYml !== undefined && !(await hasYarnrcYml)) {
    return false;
  }

  try {
    const yarnrc = (await getYarnrcYmlContents(workingDirectory)) as YarnrcYml;
    return yarnrc.nodeLinker === 'node-modules';
  } catch {
    // assume the default (pnp) if the file fails to load or parse
    return false;
  }
}
