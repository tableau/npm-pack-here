import { Logger } from '../src/logger';

export function getVirtualLoggerInstance(): Logger & { lastMessage: () => string } {
  let lastLogMessage = '';
  return {
    debug: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    info: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    log: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    warning: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    error: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    success: (getMessage: () => string) => {
      lastLogMessage = getMessage();
    },
    lastMessage: () => lastLogMessage,
  };
}
