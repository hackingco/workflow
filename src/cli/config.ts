import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import chalk from 'chalk';

export interface CLIConfig {
  defaultSwarmType?: string;
  defaultStrategy?: string;
  maxAgents?: number;
  outputFormat?: 'json' | 'yaml' | 'table';
  colorOutput?: boolean;
  integrations?: {
    github?: {
      enabled: boolean;
      token?: string;
      owner?: string;
      repo?: string;
    };
    slack?: {
      enabled: boolean;
      token?: string;
      defaultChannel?: string;
    };
    mcp?: {
      enabled: boolean;
      serverUrl?: string;
      apiKey?: string;
    };
  };
  plugins?: string[];
  aliases?: Record<string, string>;
}

const DEFAULT_CONFIG: CLIConfig = {
  defaultSwarmType: 'distributed',
  defaultStrategy: 'adaptive',
  maxAgents: 10,
  outputFormat: 'table',
  colorOutput: true,
  integrations: {
    github: { enabled: false },
    slack: { enabled: false },
    mcp: { enabled: false }
  },
  plugins: [],
  aliases: {}
};

/**
 * Get the config file path
 */
export function getConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  
  // Check for config in current directory first
  const localConfig = path.join(process.cwd(), 'swarm.config.json');
  if (require('fs').existsSync(localConfig)) {
    return localConfig;
  }
  
  // Fall back to home directory
  return path.join(os.homedir(), '.swarm', 'config.json');
}

/**
 * Load configuration from file
 */
export async function loadConfig(configPath?: string): Promise<CLIConfig> {
  const filePath = getConfigPath(configPath);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    let config: CLIConfig;
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      config = yaml.parse(content);
    } else {
      config = JSON.parse(content);
    }
    
    // Merge with defaults
    return mergeConfigs(DEFAULT_CONFIG, config);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Config file doesn't exist, return defaults
      return { ...DEFAULT_CONFIG };
    }
    throw new Error(`Failed to load config: ${error.message}`);
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(configPath: string | undefined, config: CLIConfig): Promise<void> {
  const filePath = getConfigPath(configPath);
  const dir = path.dirname(filePath);
  
  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });
  
  // Save config
  const content = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
    ? yaml.stringify(config)
    : JSON.stringify(config, null, 2);
    
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Merge two config objects
 */
function mergeConfigs(defaults: CLIConfig, overrides: Partial<CLIConfig>): CLIConfig {
  const merged = { ...defaults };
  
  Object.keys(overrides).forEach(key => {
    const value = overrides[key];
    if (value !== undefined) {
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        merged[key] = mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
  });
  
  return merged;
}

/**
 * Load environment variables into config
 */
export function loadEnvConfig(config: CLIConfig): CLIConfig {
  const envConfig = { ...config };
  
  // Map environment variables to config
  if (process.env.SWARM_DEFAULT_TYPE) {
    envConfig.defaultSwarmType = process.env.SWARM_DEFAULT_TYPE;
  }
  
  if (process.env.SWARM_MAX_AGENTS) {
    envConfig.maxAgents = parseInt(process.env.SWARM_MAX_AGENTS);
  }
  
  if (process.env.SWARM_OUTPUT_FORMAT) {
    envConfig.outputFormat = process.env.SWARM_OUTPUT_FORMAT as any;
  }
  
  // GitHub integration
  if (process.env.GITHUB_TOKEN) {
    envConfig.integrations = envConfig.integrations || {};
    envConfig.integrations.github = {
      enabled: true,
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    };
  }
  
  // Slack integration
  if (process.env.SLACK_TOKEN) {
    envConfig.integrations = envConfig.integrations || {};
    envConfig.integrations.slack = {
      enabled: true,
      token: process.env.SLACK_TOKEN,
      defaultChannel: process.env.SLACK_DEFAULT_CHANNEL
    };
  }
  
  // MCP integration
  if (process.env.MCP_SERVER_URL) {
    envConfig.integrations = envConfig.integrations || {};
    envConfig.integrations.mcp = {
      enabled: true,
      serverUrl: process.env.MCP_SERVER_URL,
      apiKey: process.env.MCP_API_KEY
    };
  }
  
  return envConfig;
}

/**
 * Validate config
 */
export function validateConfig(config: CLIConfig): string[] {
  const errors: string[] = [];
  
  if (config.maxAgents && (config.maxAgents < 1 || config.maxAgents > 1000)) {
    errors.push('maxAgents must be between 1 and 1000');
  }
  
  if (config.outputFormat && !['json', 'yaml', 'table'].includes(config.outputFormat)) {
    errors.push('outputFormat must be one of: json, yaml, table');
  }
  
  // Validate integrations
  if (config.integrations?.github?.enabled && !config.integrations.github.token) {
    errors.push('GitHub integration requires a token');
  }
  
  if (config.integrations?.slack?.enabled && !config.integrations.slack.token) {
    errors.push('Slack integration requires a token');
  }
  
  if (config.integrations?.mcp?.enabled && !config.integrations.mcp.serverUrl) {
    errors.push('MCP integration requires a server URL');
  }
  
  return errors;
}

/**
 * Initialize config file with defaults
 */
export async function initConfig(configPath?: string): Promise<void> {
  const filePath = getConfigPath(configPath);
  
  // Check if config already exists
  try {
    await fs.access(filePath);
    console.log(chalk.yellow(`Config file already exists at: ${filePath}`));
    return;
  } catch {
    // File doesn't exist, create it
  }
  
  await saveConfig(configPath, DEFAULT_CONFIG);
  console.log(chalk.green(`Config file created at: ${filePath}`));
}

/**
 * Get integration config
 */
export function getIntegrationConfig(
  config: CLIConfig,
  integration: 'github' | 'slack' | 'mcp'
): any {
  const intConfig = config.integrations?.[integration];
  
  if (!intConfig?.enabled) {
    throw new Error(`${integration} integration is not enabled`);
  }
  
  return intConfig;
}