export type LogLevel = 'debug' | 'info' | 'warning';

export function isDebugLogLevelEnabled(logLevel: LogLevel): boolean {
  return logLevel === 'debug';
}

export function isInfoLogLevelEnabled(logLevel: LogLevel): boolean {
  return logLevel === 'info' || isDebugLogLevelEnabled(logLevel);
}

export function getLogLevel(infoEnabled: boolean, debugEnabled: boolean): LogLevel {
  if (debugEnabled) {
    return 'debug';
  }
  if (infoEnabled) {
    return 'info';
  }
  return 'warning';
}
