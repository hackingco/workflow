import { EventEmitter } from 'events';
import path from 'path';
import chalk from 'chalk';

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  init: (context: PluginContext) => Promise<void>;
  commands?: PluginCommand[];
  hooks?: PluginHooks;
}

export interface PluginCommand {
  name: string;
  description: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: any;
  }>;
  action: (options: any, context: PluginContext) => Promise<void>;
}

export interface PluginHooks {
  beforeCommand?: (command: string, options: any) => Promise<void>;
  afterCommand?: (command: string, options: any, result: any) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  onExit?: () => Promise<void>;
}

export interface PluginContext {
  config: any;
  logger: Logger;
  events: EventEmitter;
  storage: PluginStorage;
  utils: PluginUtils;
}

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

export interface PluginStorage {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

export interface PluginUtils {
  formatOutput: (data: any, format: string) => string;
  prompt: (questions: any[]) => Promise<any>;
  spinner: (text: string) => any;
}

class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private context: PluginContext;
  private events: EventEmitter;

  constructor() {
    this.events = new EventEmitter();
    this.context = this.createContext();
  }

  /**
   * Create plugin context
   */
  private createContext(): PluginContext {
    return {
      config: {},
      logger: this.createLogger(),
      events: this.events,
      storage: this.createStorage(),
      utils: this.createUtils()
    };
  }

  /**
   * Create logger for plugins
   */
  private createLogger(): Logger {
    return {
      info: (message: string) => console.log(chalk.blue(`[Plugin] ${message}`)),
      warn: (message: string) => console.log(chalk.yellow(`[Plugin] ${message}`)),
      error: (message: string) => console.log(chalk.red(`[Plugin] ${message}`)),
      debug: (message: string) => {
        if (process.env.DEBUG) {
          console.log(chalk.gray(`[Plugin Debug] ${message}`));
        }
      }
    };
  }

  /**
   * Create storage for plugins
   */
  private createStorage(): PluginStorage {
    const storage = new Map<string, any>();
    
    return {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: any) => { storage.set(key, value); },
      delete: async (key: string) => { storage.delete(key); },
      clear: async () => { storage.clear(); }
    };
  }

  /**
   * Create utilities for plugins
   */
  private createUtils(): PluginUtils {
    return {
      formatOutput: (data: any, format: string) => {
        const { formatOutput } = require('./utils/format');
        return formatOutput(data, format);
      },
      prompt: async (questions: any[]) => {
        const inquirer = await import('inquirer');
        return inquirer.default.prompt(questions);
      },
      spinner: (text: string) => {
        const ora = require('ora');
        return ora(text);
      }
    };
  }

  /**
   * Load a plugin
   */
  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      let plugin: Plugin;
      
      if (pluginPath.startsWith('.') || pluginPath.startsWith('/')) {
        // Local plugin
        const absolutePath = path.resolve(pluginPath);
        plugin = require(absolutePath);
      } else {
        // NPM package
        plugin = require(pluginPath);
      }
      
      // Validate plugin
      if (!plugin.name || !plugin.init) {
        throw new Error('Invalid plugin: missing required properties');
      }
      
      // Initialize plugin
      await plugin.init(this.context);
      
      // Register plugin
      this.plugins.set(plugin.name, plugin);
      
      console.log(chalk.green(`✓ Loaded plugin: ${plugin.name} v${plugin.version || '1.0.0'}`));
      
      // Register commands if any
      if (plugin.commands) {
        this.registerCommands(plugin);
      }
      
    } catch (error) {
      throw new Error(`Failed to load plugin ${pluginPath}: ${error.message}`);
    }
  }

  /**
   * Register plugin commands
   */
  private registerCommands(plugin: Plugin): void {
    // This would integrate with the main CLI command system
    // For now, we'll just emit an event
    this.events.emit('plugin:commands:registered', {
      plugin: plugin.name,
      commands: plugin.commands
    });
  }

  /**
   * Execute hook
   */
  async executeHook(hookName: string, ...args: any[]): Promise<void> {
    for (const [, plugin] of this.plugins) {
      const hook = plugin.hooks?.[hookName];
      if (hook) {
        try {
          await hook(...args);
        } catch (error) {
          console.error(chalk.red(`Plugin ${plugin.name} hook ${hookName} failed:`), error);
        }
      }
    }
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin by name
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    
    // Execute cleanup hook if available
    if (plugin.hooks?.onExit) {
      await plugin.hooks.onExit();
    }
    
    this.plugins.delete(name);
    console.log(chalk.yellow(`Unloaded plugin: ${name}`));
  }
}

// Singleton instance
let pluginManager: PluginManager;

/**
 * Get plugin manager instance
 */
export function getPluginManager(): PluginManager {
  if (!pluginManager) {
    pluginManager = new PluginManager();
  }
  return pluginManager;
}

/**
 * Setup plugins from config
 */
export async function setupPlugins(pluginPaths: string[]): Promise<void> {
  const manager = getPluginManager();
  
  for (const pluginPath of pluginPaths) {
    try {
      await manager.loadPlugin(pluginPath);
    } catch (error) {
      console.error(chalk.red(`Failed to load plugin ${pluginPath}:`), error.message);
    }
  }
}

/**
 * Example plugin implementation
 */
export const ExamplePlugin: Plugin = {
  name: 'example-plugin',
  version: '1.0.0',
  description: 'An example plugin demonstrating the plugin API',
  
  async init(context: PluginContext) {
    context.logger.info('Example plugin initialized');
    
    // Subscribe to events
    context.events.on('task:completed', (task) => {
      context.logger.info(`Task completed: ${task.name}`);
    });
  },
  
  commands: [
    {
      name: 'example',
      description: 'Run example plugin command',
      options: [
        {
          flags: '-m, --message <message>',
          description: 'Message to display',
          defaultValue: 'Hello from plugin!'
        }
      ],
      async action(options, context) {
        const spinner = context.utils.spinner('Processing...').start();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        spinner.succeed('Done!');
        context.logger.info(options.message);
      }
    }
  ],
  
  hooks: {
    async beforeCommand(command, options) {
      console.log(chalk.gray(`[Example Plugin] Before ${command}`));
    },
    
    async afterCommand(command, options, result) {
      console.log(chalk.gray(`[Example Plugin] After ${command}`));
    },
    
    async onError(error) {
      console.log(chalk.red(`[Example Plugin] Error: ${error.message}`));
    },
    
    async onExit() {
      console.log(chalk.gray('[Example Plugin] Cleaning up...'));
    }
  }
};