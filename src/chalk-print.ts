import chalk from "chalk";

function makeTimestamp(): string {
  return `[${new Date().toISOString()}]`;
}

export function log(message: string) {
  console.log(`${makeTimestamp()} ${message}`);
}

export function warn(message: string) {
  console.warn(chalk.black.bgMagenta(`${makeTimestamp()} ${message}`));
}

export function error(message: string) {
  console.error(chalk.whiteBright.bgRed(`${makeTimestamp()} ${message}`));
}
