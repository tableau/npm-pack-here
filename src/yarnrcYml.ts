import * as path from 'path';
import { fileSystemOperations } from './fileSystemOperations';

function getYarnrcYmlContents(): Promise<unknown> {
  return fileSystemOperations.readYaml(path.resolve('.yarnrc.yml'));
}

export function doesYarnrcYmlFileExist(): Promise<boolean> {
  const absolutePathToDestinationProjectYarnrcYml = path.resolve('.yarnrc.yml');
  return fileSystemOperations.pathExists(absolutePathToDestinationProjectYarnrcYml);
}

export async function isYarnBerryUsingNodeModulesLinker(hasYarnrcYml: Promise<boolean>): Promise<boolean> {
  if (!(await hasYarnrcYml)) {
    return false;
  }

  try {
    const yarnrc = (await getYarnrcYmlContents()) as { nodeLinker: string };
    return yarnrc.nodeLinker === 'node-modules';
  } catch {
    // assume the default (pnp)
    return false;
  }
}
