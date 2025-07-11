import fs from 'fs/promises';
import yaml from 'yaml';
import path from 'path';

/**
 * Load swarm configuration from file
 */
export async function loadSwarmConfig(configPath: string): Promise<any> {
  const content = await fs.readFile(configPath, 'utf-8');
  
  if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
    return yaml.parse(content);
  } else if (configPath.endsWith('.json')) {
    return JSON.parse(content);
  } else {
    // Try to parse as JSON first, then YAML
    try {
      return JSON.parse(content);
    } catch {
      return yaml.parse(content);
    }
  }
}

/**
 * Save swarm configuration to file
 */
export async function saveSwarmConfig(configPath: string, config: any): Promise<void> {
  let content: string;
  
  if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
    content = yaml.stringify(config);
  } else {
    content = JSON.stringify(config, null, 2);
  }
  
  await fs.writeFile(configPath, content, 'utf-8');
}

/**
 * Validate configuration file exists and is readable
 */
export async function validateConfigFile(configPath: string): Promise<void> {
  try {
    await fs.access(configPath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`Configuration file not found or not readable: ${configPath}`);
  }
}

/**
 * Merge configurations with priority
 */
export function mergeConfigs(...configs: any[]): any {
  return configs.reduce((merged, config) => {
    return deepMerge(merged, config);
  }, {});
}

/**
 * Deep merge objects
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (isObject(source[key]) && isObject(target[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

/**
 * Check if value is a plain object
 */
function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Expand environment variables in config
 */
export function expandEnvVars(config: any): any {
  if (typeof config === 'string') {
    return config.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }
  
  if (Array.isArray(config)) {
    return config.map(expandEnvVars);
  }
  
  if (isObject(config)) {
    const expanded = {};
    for (const key in config) {
      expanded[key] = expandEnvVars(config[key]);
    }
    return expanded;
  }
  
  return config;
}

/**
 * Load configuration with environment variable expansion
 */
export async function loadConfigWithEnv(configPath: string): Promise<any> {
  const config = await loadSwarmConfig(configPath);
  return expandEnvVars(config);
}

/**
 * Generate default configuration
 */
export function generateDefaultConfig(type: string): any {
  switch (type) {
    case 'swarm':
      return {
        name: `swarm-${Date.now()}`,
        type: 'distributed',
        strategy: 'adaptive',
        maxAgents: 10,
        agentConfig: {
          type: 'worker',
          capabilities: ['default']
        },
        taskConfig: {
          timeout: 30000,
          retries: 3
        }
      };
      
    case 'agent':
      return {
        name: `agent-${Date.now()}`,
        type: 'worker',
        capabilities: ['default'],
        maxConcurrentTasks: 5,
        healthCheck: {
          interval: 30000,
          timeout: 5000
        }
      };
      
    case 'task':
      return {
        name: `task-${Date.now()}`,
        type: 'default',
        priority: 'medium',
        timeout: 30000,
        retries: 3,
        data: {}
      };
      
    default:
      return {};
  }
}

/**
 * Resolve config path
 */
export function resolveConfigPath(configPath: string, basePath?: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  
  return path.resolve(basePath || process.cwd(), configPath);
}