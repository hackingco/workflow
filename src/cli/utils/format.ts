import * as yaml from 'yaml';
import Table from 'cli-table3';
import chalk from 'chalk';

export type OutputFormat = 'json' | 'yaml' | 'table';

/**
 * Format output based on the specified format
 */
export function formatOutput(data: any, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    
    case 'yaml':
      return yaml.stringify(data);
    
    case 'table':
      return formatAsTable(data);
    
    default:
      return JSON.stringify(data, null, 2);
  }
}

/**
 * Format data as a table
 */
function formatAsTable(data: any): string {
  if (Array.isArray(data)) {
    return formatArrayAsTable(data);
  } else if (typeof data === 'object' && data !== null) {
    return formatObjectAsTable(data);
  }
  return String(data);
}

/**
 * Format an array of objects as a table
 */
function formatArrayAsTable(data: any[]): string {
  if (data.length === 0) {
    return 'No data';
  }

  // Get all unique keys from all objects
  const keys = new Set<string>();
  data.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => keys.add(key));
    }
  });

  const headers = Array.from(keys);
  
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: { 'padding-left': 1, 'padding-right': 1 }
  });

  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header];
      return formatValue(value);
    });
    table.push(row);
  });

  return table.toString();
}

/**
 * Format a single object as a table
 */
function formatObjectAsTable(data: any): string {
  const table = new Table({
    style: { 'padding-left': 1, 'padding-right': 1 }
  });

  Object.entries(data).forEach(([key, value]) => {
    table.push({
      [chalk.cyan(key)]: formatValue(value)
    });
  });

  return table.toString();
}

/**
 * Format a value for display in a table
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return chalk.gray('-');
  }

  if (typeof value === 'boolean') {
    return value ? chalk.green('✓') : chalk.red('✗');
  }

  if (typeof value === 'number') {
    return chalk.yellow(value.toString());
  }

  if (value instanceof Date) {
    return chalk.blue(value.toLocaleString());
  }

  if (Array.isArray(value)) {
    return chalk.magenta(`[${value.length} items]`);
  }

  if (typeof value === 'object') {
    return chalk.magenta(`{${Object.keys(value).length} props}`);
  }

  const str = String(value);
  if (str.length > 50) {
    return str.substring(0, 47) + '...';
  }

  return str;
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a date relative to now
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (seconds > 0) {
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}