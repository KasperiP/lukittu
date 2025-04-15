/* eslint-disable no-console */
import 'server-only';

const LOGS_ENABLED = process.env.LOGS_ENABLED ?? true;

const getFormattedDate = () => {
  const date = new Date();
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}, ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
};

const formatMessage = (message: any[]) =>
  message
    .map((m) => {
      if (m instanceof Error) {
        return m.stack;
      }
      if (typeof m === 'object') {
        return JSON.stringify(m, null, 2);
      }
      return m;
    })
    .join(', ');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const getPath = () => {
  const path = __filename;
  const pathSplit = path.split('/');
  return pathSplit.slice(-2).join('/').replace('.js', '.ts');
};

/**
 * Logger utility to log messages to the console.
 */
export const logger = {
  info: (...message: any[]) => {
    if (!LOGS_ENABLED) return;
    console.log(
      ` ${colors.bold}${colors.green}✓${colors.reset} ${getFormattedDate()} ${colors.green}INFO ${colors.yellow}[${getPath()}]${colors.green} ${formatMessage(message)}`,
    );
  },
  error: (...message: any[]) => {
    if (!LOGS_ENABLED) return;
    console.log(
      ` ${colors.bold}${colors.red}✖${colors.reset} ${getFormattedDate()} ${colors.red}ERROR ${colors.yellow}[${getPath()}]${colors.red} ${formatMessage(message)}`,
    );
  },
};
