#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { createSwarmCommand } from './commands/swarm';
import { createAgentCommand } from './commands/agent';
import { createTaskCommand } from './commands/task';
import { loadConfig, saveConfig } from './config';
import { setupPlugins } from './plugins';
import { version } from '../../package.json';
import ora from 'ora';
import inquirer from 'inquirer';

// ASCII art banner
const showBanner = () => {
  console.log(
    chalk.blue(
      figlet.textSync('Swarm CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );
  console.log(chalk.gray(`Version: ${version}`));
  console.log(chalk.gray('By HackingCo Consulting LLC\n'));
};

// Main CLI program
const program = new Command();

program
  .name('swarm')
  .description('CLI for managing distributed swarm operations')
  .version(version)
  .option('-c, --config <path>', 'path to config file', './swarm.config.json')
  .option('-f, --format <format>', 'output format (json|yaml|table)', 'table')
  .option('--no-color', 'disable colored output')
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'quiet mode')
  .hook('preAction', async (thisCommand) => {
    // Load configuration before any command
    const config = await loadConfig(thisCommand.opts().config);
    thisCommand.config = config;
    
    // Setup plugins
    await setupPlugins(config.plugins || []);
    
    // Show banner unless in quiet mode
    if (!thisCommand.opts().quiet && !process.env.CI) {
      showBanner();
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    const spinner = ora('Starting interactive mode...').start();
    
    try {
      spinner.succeed('Interactive mode ready');
      
      let running = true;
      while (running) {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { name: 'Manage Swarms', value: 'swarm' },
              { name: 'Manage Agents', value: 'agent' },
              { name: 'Manage Tasks', value: 'task' },
              { name: 'View Status', value: 'status' },
              { name: 'Configure Settings', value: 'config' },
              { name: 'Exit', value: 'exit' }
            ]
          }
        ]);
        
        switch (action) {
          case 'swarm':
            await handleSwarmInteractive();
            break;
          case 'agent':
            await handleAgentInteractive();
            break;
          case 'task':
            await handleTaskInteractive();
            break;
          case 'status':
            await handleStatusInteractive();
            break;
          case 'config':
            await handleConfigInteractive();
            break;
          case 'exit':
            running = false;
            console.log(chalk.green('Goodbye!'));
            break;
        }
      }
    } catch (error) {
      spinner.fail('Interactive mode failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Configuration management
program
  .command('config')
  .description('Manage CLI configuration')
  .option('-l, --list', 'list all configuration values')
  .option('-s, --set <key=value>', 'set a configuration value')
  .option('-g, --get <key>', 'get a configuration value')
  .option('-r, --reset', 'reset to default configuration')
  .action(async (options) => {
    const config = await loadConfig(program.opts().config);
    
    if (options.list) {
      console.log(chalk.blue('Current Configuration:'));
      console.log(JSON.stringify(config, null, 2));
    } else if (options.set) {
      const [key, value] = options.set.split('=');
      config[key] = value;
      await saveConfig(program.opts().config, config);
      console.log(chalk.green(`Set ${key} = ${value}`));
    } else if (options.get) {
      console.log(config[options.get] || chalk.yellow('Not set'));
    } else if (options.reset) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to reset configuration?',
          default: false
        }
      ]);
      
      if (confirm) {
        await saveConfig(program.opts().config, {});
        console.log(chalk.green('Configuration reset to defaults'));
      }
    }
  });

// Status command
program
  .command('status')
  .description('Show overall system status')
  .option('-w, --watch', 'watch status in real-time')
  .action(async (options) => {
    const spinner = ora('Fetching system status...').start();
    
    try {
      // Import status module dynamically
      const { getSystemStatus } = await import('./status');
      const status = await getSystemStatus();
      
      spinner.succeed('Status retrieved');
      
      if (options.watch) {
        // Real-time status monitoring
        const { watchStatus } = await import('./status');
        await watchStatus();
      } else {
        // Display status based on format
        const format = program.opts().format;
        if (format === 'json') {
          console.log(JSON.stringify(status, null, 2));
        } else if (format === 'yaml') {
          const yaml = await import('yaml');
          console.log(yaml.stringify(status));
        } else {
          // Table format
          displayStatusTable(status);
        }
      }
    } catch (error) {
      spinner.fail('Failed to get status');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Helper functions for interactive mode
async function handleSwarmInteractive() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Swarm Management:',
      choices: [
        { name: 'Start a new swarm', value: 'start' },
        { name: 'Stop a swarm', value: 'stop' },
        { name: 'List all swarms', value: 'list' },
        { name: 'View swarm details', value: 'details' },
        { name: 'Back', value: 'back' }
      ]
    }
  ]);
  
  if (action !== 'back') {
    // Execute swarm command
    console.log(chalk.gray(`Executing swarm ${action}...`));
  }
}

async function handleAgentInteractive() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Agent Management:',
      choices: [
        { name: 'Create new agent', value: 'create' },
        { name: 'List all agents', value: 'list' },
        { name: 'View agent details', value: 'details' },
        { name: 'Update agent', value: 'update' },
        { name: 'Delete agent', value: 'delete' },
        { name: 'Back', value: 'back' }
      ]
    }
  ]);
  
  if (action !== 'back') {
    console.log(chalk.gray(`Executing agent ${action}...`));
  }
}

async function handleTaskInteractive() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Task Management:',
      choices: [
        { name: 'Create new task', value: 'create' },
        { name: 'List all tasks', value: 'list' },
        { name: 'View task details', value: 'details' },
        { name: 'Assign task', value: 'assign' },
        { name: 'Complete task', value: 'complete' },
        { name: 'Back', value: 'back' }
      ]
    }
  ]);
  
  if (action !== 'back') {
    console.log(chalk.gray(`Executing task ${action}...`));
  }
}

async function handleStatusInteractive() {
  console.log(chalk.blue('\nSystem Status:'));
  // Display status information
}

async function handleConfigInteractive() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Configuration:',
      choices: [
        { name: 'View current config', value: 'view' },
        { name: 'Edit configuration', value: 'edit' },
        { name: 'Import config', value: 'import' },
        { name: 'Export config', value: 'export' },
        { name: 'Back', value: 'back' }
      ]
    }
  ]);
  
  if (action !== 'back') {
    console.log(chalk.gray(`Executing config ${action}...`));
  }
}

function displayStatusTable(status: any) {
  console.log(chalk.blue('\nSystem Overview:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`Swarms Active: ${chalk.green(status.swarms.active)}`);
  console.log(`Agents Online: ${chalk.green(status.agents.online)}/${status.agents.total}`);
  console.log(`Tasks Pending: ${chalk.yellow(status.tasks.pending)}`);
  console.log(`Tasks Running: ${chalk.blue(status.tasks.running)}`);
  console.log(`Tasks Completed: ${chalk.green(status.tasks.completed)}`);
  console.log(chalk.gray('─'.repeat(50)));
}

// Add sub-commands
program.addCommand(createSwarmCommand());
program.addCommand(createAgentCommand());
program.addCommand(createTaskCommand());

// Error handling
program.exitOverride();

try {
  program.parse(process.argv);
} catch (error) {
  if (error.code === 'commander.help') {
    process.exit(0);
  }
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
}

// Export for testing
export { program };