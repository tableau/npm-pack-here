import * as os from 'os';
import * as path from 'path';

export function getUserGlobalCacheDirectory(): string {
  return path.join(os.homedir(), 'npm-pack-here', 'cache');
}
