// Logging utility for Reddit Idea Miner

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS = {
  debug: '\x1b[90m',  // Gray
  info: '\x1b[36m',   // Cyan
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const LOG_PREFIXES = {
  debug: '🔍',
  info: 'ℹ️ ',
  warn: '⚠️ ',
  error: '❌',
};

let currentLevel: LogLevel = 'info';
let silent = false;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setSilent(value: boolean): void {
  silent = value;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  if (silent) return false;
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString().substring(11, 23);
}

function formatMessage(level: LogLevel, category: string, message: string): string {
  const color = LOG_COLORS[level];
  const prefix = LOG_PREFIXES[level];
  const timestamp = formatTimestamp();
  return `${LOG_COLORS.reset}[${timestamp}] ${color}${prefix} [${category}]${LOG_COLORS.reset} ${message}`;
}

export function debug(category: string, message: string, ...args: unknown[]): void {
  if (shouldLog('debug')) {
    console.log(formatMessage('debug', category, message), ...args);
  }
}

export function info(category: string, message: string, ...args: unknown[]): void {
  if (shouldLog('info')) {
    console.log(formatMessage('info', category, message), ...args);
  }
}

export function warn(category: string, message: string, ...args: unknown[]): void {
  if (shouldLog('warn')) {
    console.warn(formatMessage('warn', category, message), ...args);
  }
}

export function error(category: string, message: string, ...args: unknown[]): void {
  if (shouldLog('error')) {
    console.error(formatMessage('error', category, message), ...args);
  }
}

export function progress(category: string, current: number, total: number, suffix = ''): void {
  if (silent) return;
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r${LOG_COLORS.info}[${category}]${LOG_COLORS.reset} [${bar}] ${pct}% (${current}/${total}) ${suffix}    `);
  if (current >= total) {
    console.log();
  }
}

export function table(data: Record<string, unknown>[]): void {
  if (silent) return;
  console.table(data);
}

export const log = {
  debug,
  info,
  warn,
  error,
  progress,
  table,
  setLevel: setLogLevel,
  setSilent,
};

export default log;
