import chalk from 'chalk';
import { isDebugLogLevelEnabled, isInfoLogLevelEnabled, LogLevel } from './logLevel';

function getCurrentDateAndTimeStamp(): string {
  const currentTime = new Date();
  return `${currentTime.toLocaleString(undefined, {
    year: '2-digit',
    day: 'numeric',
    month: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })}:${currentTime.getMilliseconds()}`;
}

function getMessageWithDateTimeStampAndSeverity(getMessage: () => string, severity: string | null): string {
  const [prependedNewLines, theRestOfTheMessage] = extractPrependedNewLines(getMessage());
  const formattedSeverity = severity !== null ? `[${severity}]` : '';
  return `${prependedNewLines}${getCurrentDateAndTimeStamp()} ${formattedSeverity}\n${theRestOfTheMessage}`;
}

function extractPrependedNewLines(message: string): [string, string] {
  const prependedNewLinesMatcher = /^(\n*)(.*)$/s;
  const maybeExtractedNewLines = prependedNewLinesMatcher.exec(message);
  if (maybeExtractedNewLines === null) {
    throw new Error(`Regex ${prependedNewLinesMatcher.source} did not match message: ${message}`);
  }
  return [maybeExtractedNewLines[1], maybeExtractedNewLines[2]];
}

export interface Logger {
  debug: (getMessage: () => string) => void;
  info: (getMessage: () => string) => void;
  log: (getMessage: () => string) => void;
  warning: (getMessage: () => string) => void;
  error: (getMessage: () => string) => void;
  success: (getMessage: () => string) => void;
}

export function getLoggerInstance(logLevel: LogLevel): Logger {
  return {
    debug(getMessage: () => string): void {
      if (isDebugLogLevelEnabled(logLevel)) {
        console.log(getMessageWithDateTimeStampAndSeverity(getMessage, 'debug'));
      }
    },
    info(getMessage: () => string): void {
      if (isInfoLogLevelEnabled(logLevel)) {
        console.log(getMessageWithDateTimeStampAndSeverity(getMessage, 'info'));
      }
    },
    log(getMessage: () => string): void {
      console.log(getMessageWithDateTimeStampAndSeverity(getMessage, null));
    },
    warning(getMessage: () => string): void {
      console.log(chalk.yellow(getMessageWithDateTimeStampAndSeverity(getMessage, 'warning')));
    },
    error(getMessage: () => string): void {
      console.error(chalk.red(getMessageWithDateTimeStampAndSeverity(getMessage, 'error')));
    },
    success(getMessage: () => string): void {
      console.log(chalk.green(getMessageWithDateTimeStampAndSeverity(getMessage, 'success')));
    },
  };
}
