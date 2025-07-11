import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { formatOutput } from '../utils/format';
import { validateTaskConfig } from '../utils/validation';
import { TaskOrchestrator } from '../../task/task-orchestrator';

export function createTaskCommand(): Command {
  const task = new Command('task');
  
  task
    .description('Manage tasks in the swarm')
    .option('-s, --swarm <swarmId>', 'target swarm ID');

  // Create a new task
  task
    .command('create')
    .description('Create a new task')
    .option('-n, --name <name>', 'task name')
    .option('-t, --type <type>', 'task type')
    .option('-p, --priority <priority>', 'task priority (low|medium|high|critical)', 'medium')
    .option('-d, --data <data>', 'task data (JSON string)')
    .option('-f, --file <file>', 'load task data from file')
    .option('-i, --interactive', 'interactive task creation')
    .option('--dependencies <ids>', 'comma-separated list of dependency task IDs')
    .option('--timeout <ms>', 'task timeout in milliseconds')
    .option('--retries <count>', 'number of retry attempts', '3')
    .option('--schedule <cron>', 'schedule task with cron expression')
    .action(async (options) => {
      const spinner = ora('Creating task...').start();
      
      try {
        let config = {};
        
        if (options.interactive) {
          spinner.stop();
          config = await promptTaskConfig();
        } else {
          // Load data from file if specified
          let taskData = {};
          if (options.file) {
            const fs = await import('fs/promises');
            const content = await fs.readFile(options.file, 'utf-8');
            taskData = JSON.parse(content);
          } else if (options.data) {
            taskData = JSON.parse(options.data);
          }
          
          config = {
            name: options.name || `task-${Date.now()}`,
            type: options.type || 'default',
            priority: options.priority,
            data: taskData,
            dependencies: options.dependencies ? options.dependencies.split(',') : [],
            timeout: options.timeout ? parseInt(options.timeout) : undefined,
            retries: parseInt(options.retries),
            schedule: options.schedule,
            swarmId: task.opts().swarm
          };
        }
        
        // Validate configuration
        const validation = validateTaskConfig(config);
        if (!validation.valid) {
          throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }
        
        spinner.text = 'Registering task...';
        
        // Create task
        const orchestrator = new TaskOrchestrator();
        const newTask = await orchestrator.createTask(config);
        
        spinner.succeed(`Task '${config.name}' created successfully`);
        
        // Display task details
        console.log(chalk.blue('\nTask Details:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`ID: ${chalk.cyan(newTask.id)}`);
        console.log(`Name: ${chalk.cyan(config.name)}`);
        console.log(`Type: ${chalk.cyan(config.type)}`);
        console.log(`Priority: ${chalk.cyan(config.priority)}`);
        console.log(`Status: ${chalk.yellow('Pending')}`);
        if (config.schedule) {
          console.log(`Schedule: ${chalk.cyan(config.schedule)}`);
        }
        console.log(chalk.gray('─'.repeat(50)));
        
        // Output in requested format
        const output = formatOutput({
          id: newTask.id,
          ...config,
          status: 'pending'
        }, task.parent.opts().format);
        
        if (task.parent.opts().format !== 'table') {
          console.log(output);
        }
        
      } catch (error) {
        spinner.fail('Failed to create task');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // List tasks
  task
    .command('list')
    .alias('ls')
    .description('List all tasks')
    .option('-s, --status <status>', 'filter by status (pending|running|completed|failed|all)', 'all')
    .option('-p, --priority <priority>', 'filter by priority')
    .option('-a, --agent <agentId>', 'filter by assigned agent')
    .option('--sort <field>', 'sort by field (name|created|priority|status)', 'created')
    .option('--limit <count>', 'limit number of results', '50')
    .action(async (options) => {
      const spinner = ora('Fetching tasks...').start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        let tasks = await orchestrator.listTasks({
          swarmId: task.opts().swarm,
          limit: parseInt(options.limit)
        });
        
        // Apply filters
        if (options.status !== 'all') {
          tasks = tasks.filter(t => t.status === options.status);
        }
        
        if (options.priority) {
          tasks = tasks.filter(t => t.priority === options.priority);
        }
        
        if (options.agent) {
          tasks = tasks.filter(t => t.assignedAgent === options.agent);
        }
        
        // Sort
        tasks.sort((a, b) => {
          switch (options.sort) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'priority':
              return getPriorityValue(b.priority) - getPriorityValue(a.priority);
            case 'status':
              return a.status.localeCompare(b.status);
            default:
              return b.created - a.created;
          }
        });
        
        spinner.succeed(`Found ${tasks.length} task(s)`);
        
        if (tasks.length === 0) {
          console.log(chalk.yellow('No tasks found'));
          return;
        }
        
        // Display based on format
        const format = task.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(tasks, format));
        } else {
          // Table format
          const table = new Table({
            head: ['ID', 'Name', 'Type', 'Status', 'Priority', 'Agent', 'Created'],
            style: { head: ['cyan'] }
          });
          
          tasks.forEach(t => {
            table.push([
              t.id.substring(0, 8),
              t.name,
              t.type,
              getTaskStatusColor(t.status),
              getPriorityColor(t.priority),
              t.assignedAgent ? t.assignedAgent.substring(0, 8) : '-',
              new Date(t.created).toLocaleString()
            ]);
          });
          
          console.log(table.toString());
        }
        
      } catch (error) {
        spinner.fail('Failed to list tasks');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Show task details
  task
    .command('show <taskId>')
    .description('Show detailed information about a task')
    .option('--logs', 'include task logs')
    .option('--results', 'include task results')
    .option('--timeline', 'show task timeline')
    .action(async (taskId, options) => {
      const spinner = ora('Fetching task details...').start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        const details = await orchestrator.getTaskDetails(taskId, {
          includeLogs: options.logs,
          includeResults: options.results,
          includeTimeline: options.timeline
        });
        
        if (!details) {
          throw new Error(`Task '${taskId}' not found`);
        }
        
        spinner.succeed('Task details retrieved');
        
        // Display based on format
        const format = task.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(details, format));
        } else {
          displayTaskDetails(details, options);
        }
        
      } catch (error) {
        spinner.fail('Failed to get task details');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Run a task
  task
    .command('run <taskId>')
    .description('Run a task immediately')
    .option('--agent <agentId>', 'specific agent to run the task')
    .option('--wait', 'wait for task completion')
    .option('--timeout <ms>', 'override task timeout')
    .action(async (taskId, options) => {
      const spinner = ora(`Running task ${taskId}...`).start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        
        const runOptions = {
          agentId: options.agent,
          timeout: options.timeout ? parseInt(options.timeout) : undefined
        };
        
        const execution = await orchestrator.runTask(taskId, runOptions);
        
        if (options.wait) {
          spinner.text = 'Waiting for task completion...';
          const result = await execution.waitForCompletion();
          
          if (result.status === 'completed') {
            spinner.succeed(`Task completed successfully`);
            console.log(chalk.blue('\nTask Result:'));
            console.log(JSON.stringify(result.data, null, 2));
          } else {
            spinner.fail(`Task failed: ${result.error}`);
          }
        } else {
          spinner.succeed(`Task started with execution ID: ${execution.id}`);
          console.log('Use `task show` to check status');
        }
        
      } catch (error) {
        spinner.fail('Failed to run task');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Cancel a task
  task
    .command('cancel <taskId>')
    .description('Cancel a running task')
    .option('-f, --force', 'force cancellation')
    .action(async (taskId, options) => {
      const spinner = ora(`Cancelling task ${taskId}...`).start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        await orchestrator.cancelTask(taskId, {
          force: options.force
        });
        
        spinner.succeed(`Task '${taskId}' cancelled successfully`);
        
      } catch (error) {
        spinner.fail('Failed to cancel task');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Retry a failed task
  task
    .command('retry <taskId>')
    .description('Retry a failed task')
    .option('--reset', 'reset task state before retry')
    .action(async (taskId, options) => {
      const spinner = ora(`Retrying task ${taskId}...`).start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        const execution = await orchestrator.retryTask(taskId, {
          reset: options.reset
        });
        
        spinner.succeed(`Task retry started with execution ID: ${execution.id}`);
        
      } catch (error) {
        spinner.fail('Failed to retry task');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Assign task to agent
  task
    .command('assign <taskId> <agentId>')
    .description('Assign a task to a specific agent')
    .action(async (taskId, agentId) => {
      const spinner = ora('Assigning task...').start();
      
      try {
        const orchestrator = new TaskOrchestrator();
        await orchestrator.assignTask(taskId, agentId);
        
        spinner.succeed(`Task '${taskId}' assigned to agent '${agentId}'`);
        
      } catch (error) {
        spinner.fail('Failed to assign task');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Delete a task
  task
    .command('delete <taskId>')
    .alias('rm')
    .description('Delete a task')
    .option('-f, --force', 'skip confirmation')
    .action(async (taskId, options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete task '${taskId}'?`,
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }
        
        const spinner = ora(`Deleting task ${taskId}...`).start();
        
        const orchestrator = new TaskOrchestrator();
        await orchestrator.deleteTask(taskId);
        
        spinner.succeed(`Task '${taskId}' deleted successfully`);
        
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Batch operations
  task
    .command('batch')
    .description('Perform batch operations on tasks')
    .option('-f, --file <file>', 'batch operation file (JSON/YAML)')
    .option('-o, --operation <op>', 'operation type (create|run|cancel|delete)')
    .option('--dry-run', 'preview operations without executing')
    .action(async (options) => {
      const spinner = ora('Processing batch operations...').start();
      
      try {
        if (!options.file) {
          throw new Error('Batch file is required');
        }
        
        const fs = await import('fs/promises');
        const yaml = await import('yaml');
        const content = await fs.readFile(options.file, 'utf-8');
        
        let operations;
        if (options.file.endsWith('.yaml') || options.file.endsWith('.yml')) {
          operations = yaml.parse(content);
        } else {
          operations = JSON.parse(content);
        }
        
        if (options.dryRun) {
          spinner.stop();
          console.log(chalk.blue('Batch Operations Preview:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(JSON.stringify(operations, null, 2));
          console.log(chalk.gray('─'.repeat(50)));
          return;
        }
        
        spinner.text = `Executing ${operations.length} operations...`;
        
        const orchestrator = new TaskOrchestrator();
        const results = await orchestrator.executeBatch(operations, {
          operation: options.operation
        });
        
        spinner.succeed(`Batch operations completed`);
        
        // Display results
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(chalk.green(`Successful: ${successful}`));
        if (failed > 0) {
          console.log(chalk.red(`Failed: ${failed}`));
        }
        
        if (task.parent.opts().verbose) {
          console.log(chalk.blue('\nDetailed Results:'));
          results.forEach((result, index) => {
            const status = result.success ? chalk.green('✓') : chalk.red('✗');
            console.log(`${status} Operation ${index + 1}: ${result.message || 'Completed'}`);
          });
        }
        
      } catch (error) {
        spinner.fail('Failed to execute batch operations');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Monitor task progress
  task
    .command('monitor')
    .description('Monitor task execution in real-time')
    .option('--filter <status>', 'filter tasks by status')
    .option('--interval <ms>', 'update interval in milliseconds', '1000')
    .action(async (options) => {
      console.log(chalk.blue('Monitoring task execution...'));
      console.log(chalk.gray('Press Ctrl+C to exit\n'));
      
      try {
        await monitorTasks({
          filter: options.filter,
          interval: parseInt(options.interval),
          swarmId: task.opts().swarm
        });
        
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  return task;
}

// Helper functions

async function promptTaskConfig() {
  const taskTypes = [
    { name: 'Data Processing', value: 'data-processing' },
    { name: 'API Request', value: 'api-request' },
    { name: 'File Operation', value: 'file-operation' },
    { name: 'Web Scraping', value: 'web-scraping' },
    { name: 'Analysis', value: 'analysis' },
    { name: 'Notification', value: 'notification' },
    { name: 'Custom', value: 'custom' }
  ];
  
  const basicAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Task name:',
      default: `task-${Date.now()}`
    },
    {
      type: 'list',
      name: 'type',
      message: 'Task type:',
      choices: taskTypes
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Task priority:',
      choices: [
        { name: 'Low', value: 'low' },
        { name: 'Medium', value: 'medium' },
        { name: 'High', value: 'high' },
        { name: 'Critical', value: 'critical' }
      ],
      default: 'medium'
    }
  ]);
  
  // Type-specific configuration
  let taskData = {};
  switch (basicAnswers.type) {
    case 'api-request':
      taskData = await promptApiRequestConfig();
      break;
    case 'data-processing':
      taskData = await promptDataProcessingConfig();
      break;
    case 'file-operation':
      taskData = await promptFileOperationConfig();
      break;
    default:
      const { customData } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'customData',
          message: 'Enter task data (JSON):',
          default: '{}'
        }
      ]);
      taskData = JSON.parse(customData);
  }
  
  // Advanced options
  const { advancedOptions } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'advancedOptions',
      message: 'Configure advanced options?',
      default: false
    }
  ]);
  
  let advancedConfig = {};
  if (advancedOptions) {
    advancedConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'timeout',
        message: 'Task timeout (ms):',
        default: '30000',
        validate: (value) => !isNaN(parseInt(value)) || 'Must be a number'
      },
      {
        type: 'input',
        name: 'retries',
        message: 'Number of retries:',
        default: '3',
        validate: (value) => !isNaN(parseInt(value)) || 'Must be a number'
      },
      {
        type: 'input',
        name: 'schedule',
        message: 'Schedule (cron expression, optional):',
        default: ''
      }
    ]);
  }
  
  return {
    ...basicAnswers,
    data: taskData,
    timeout: advancedConfig.timeout ? parseInt(advancedConfig.timeout) : undefined,
    retries: advancedConfig.retries ? parseInt(advancedConfig.retries) : 3,
    schedule: advancedConfig.schedule || undefined
  };
}

async function promptApiRequestConfig() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'API URL:',
      validate: (value) => value.startsWith('http') || 'Must be a valid URL'
    },
    {
      type: 'list',
      name: 'method',
      message: 'HTTP Method:',
      choices: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET'
    },
    {
      type: 'editor',
      name: 'headers',
      message: 'Headers (JSON):',
      default: '{}'
    },
    {
      type: 'editor',
      name: 'body',
      message: 'Request body (JSON):',
      default: '{}',
      when: (answers) => ['POST', 'PUT', 'PATCH'].includes(answers.method)
    }
  ]);
}

async function promptDataProcessingConfig() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'source',
      message: 'Data source:'
    },
    {
      type: 'list',
      name: 'operation',
      message: 'Processing operation:',
      choices: ['transform', 'aggregate', 'filter', 'join', 'custom']
    },
    {
      type: 'input',
      name: 'destination',
      message: 'Output destination:'
    }
  ]);
}

async function promptFileOperationConfig() {
  return inquirer.prompt([
    {
      type: 'list',
      name: 'operation',
      message: 'File operation:',
      choices: ['read', 'write', 'copy', 'move', 'delete', 'compress', 'decompress']
    },
    {
      type: 'input',
      name: 'source',
      message: 'Source path:'
    },
    {
      type: 'input',
      name: 'destination',
      message: 'Destination path:',
      when: (answers) => ['write', 'copy', 'move'].includes(answers.operation)
    }
  ]);
}

function displayTaskDetails(details: any, options: any) {
  console.log(chalk.blue('\nTask Information:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  // Basic info
  const infoTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
  });
  
  infoTable.push(
    { 'ID': details.id },
    { 'Name': details.name },
    { 'Type': details.type },
    { 'Status': getTaskStatusColor(details.status) },
    { 'Priority': getPriorityColor(details.priority) },
    { 'Created': new Date(details.created).toLocaleString() },
    { 'Started': details.startedAt ? new Date(details.startedAt).toLocaleString() : '-' },
    { 'Completed': details.completedAt ? new Date(details.completedAt).toLocaleString() : '-' },
    { 'Duration': details.duration ? `${details.duration}ms` : '-' },
    { 'Assigned Agent': details.assignedAgent || '-' },
    { 'Attempts': `${details.attempts}/${details.maxRetries}` }
  );
  
  console.log(infoTable.toString());
  
  // Task Data
  if (details.data && Object.keys(details.data).length > 0) {
    console.log(chalk.blue('\nTask Data:'));
    console.log(JSON.stringify(details.data, null, 2));
  }
  
  // Dependencies
  if (details.dependencies && details.dependencies.length > 0) {
    console.log(chalk.blue('\nDependencies:'));
    details.dependencies.forEach(dep => {
      const status = dep.completed ? chalk.green('✓') : chalk.yellow('○');
      console.log(`  ${status} ${dep.taskId} - ${dep.name}`);
    });
  }
  
  // Timeline
  if (options.timeline && details.timeline) {
    console.log(chalk.blue('\nExecution Timeline:'));
    const timelineTable = new Table({
      head: ['Time', 'Event', 'Details'],
      style: { head: ['cyan'] }
    });
    
    details.timeline.forEach(event => {
      timelineTable.push([
        new Date(event.timestamp).toLocaleTimeString(),
        event.type,
        event.details || '-'
      ]);
    });
    
    console.log(timelineTable.toString());
  }
  
  // Results
  if (options.results && details.result) {
    console.log(chalk.blue('\nTask Result:'));
    if (details.status === 'completed') {
      console.log(chalk.green('Success:'));
      console.log(JSON.stringify(details.result, null, 2));
    } else if (details.status === 'failed') {
      console.log(chalk.red('Error:'));
      console.log(details.result.error || 'Unknown error');
      if (details.result.stack) {
        console.log(chalk.gray('\nStack Trace:'));
        console.log(details.result.stack);
      }
    }
  }
  
  // Logs
  if (options.logs && details.logs) {
    console.log(chalk.blue('\nExecution Logs:'));
    console.log(chalk.gray('─'.repeat(60)));
    details.logs.forEach(log => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const level = getLogLevelColor(log.level);
      console.log(`[${timestamp}] ${level} ${log.message}`);
    });
  }
}

function getTaskStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green(status);
    case 'running':
      return chalk.blue(status);
    case 'failed':
      return chalk.red(status);
    case 'pending':
      return chalk.yellow(status);
    case 'cancelled':
      return chalk.gray(status);
    default:
      return status;
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'critical':
      return chalk.red(priority);
    case 'high':
      return chalk.yellow(priority);
    case 'medium':
      return chalk.blue(priority);
    case 'low':
      return chalk.gray(priority);
    default:
      return priority;
  }
}

function getPriorityValue(priority: string): number {
  switch (priority) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

function getLogLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return chalk.red('[ERROR]');
    case 'warn':
      return chalk.yellow('[WARN]');
    case 'info':
      return chalk.blue('[INFO]');
    case 'debug':
      return chalk.gray('[DEBUG]');
    default:
      return `[${level.toUpperCase()}]`;
  }
}

async function monitorTasks(options: any) {
  const blessed = await import('blessed');
  const contrib = await import('blessed-contrib');
  
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Task Monitor'
  });
  
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  
  // Create dashboard widgets
  const taskList = grid.set(0, 0, 6, 12, contrib.table, {
    keys: true,
    label: 'Active Tasks',
    columnSpacing: 3,
    columnWidth: [10, 20, 10, 10, 15, 20]
  });
  
  const stats = grid.set(6, 0, 3, 6, contrib.lcd, {
    label: 'Statistics',
    segmentWidth: 0.06,
    segmentInterval: 0.11,
    strokeWidth: 0.1,
    elements: 4,
    elementSpacing: 4,
    elementPadding: 2
  });
  
  const throughput = grid.set(6, 6, 3, 6, contrib.line, {
    label: 'Task Throughput',
    showLegend: false,
    wholeNumbersOnly: true,
    style: {
      line: 'yellow',
      text: 'green',
      baseline: 'black'
    }
  });
  
  const log = grid.set(9, 0, 3, 12, contrib.log, {
    label: 'Activity Log',
    tags: true
  });
  
  // Data tracking
  const throughputData = {
    x: [],
    y: []
  };
  
  // Update function
  const updateDashboard = async () => {
    try {
      const orchestrator = new TaskOrchestrator();
      const tasks = await orchestrator.listTasks({
        swarmId: options.swarmId,
        status: options.filter
      });
      
      // Update task list
      const taskData = {
        headers: ['ID', 'Name', 'Status', 'Priority', 'Agent', 'Duration'],
        data: tasks.map(t => [
          t.id.substring(0, 8),
          t.name.substring(0, 20),
          t.status,
          t.priority,
          t.assignedAgent ? t.assignedAgent.substring(0, 8) : '-',
          t.duration ? `${t.duration}ms` : '-'
        ])
      };
      taskList.setData(taskData);
      
      // Update statistics
      const completed = tasks.filter(t => t.status === 'completed').length;
      const failed = tasks.filter(t => t.status === 'failed').length;
      const running = tasks.filter(t => t.status === 'running').length;
      const pending = tasks.filter(t => t.status === 'pending').length;
      
      stats.setDisplay([
        completed.toString(),
        failed.toString(),
        running.toString(),
        pending.toString()
      ]);
      
      // Update throughput
      const now = new Date();
      throughputData.x.push(now.toLocaleTimeString());
      throughputData.y.push(running);
      
      if (throughputData.x.length > 20) {
        throughputData.x.shift();
        throughputData.y.shift();
      }
      
      throughput.setData([throughputData]);
      
      // Add to log
      log.log(`{green-fg}Updated at ${now.toLocaleTimeString()}{/green-fg}`);
      
      screen.render();
    } catch (error) {
      log.log(`{red-fg}Error: ${error.message}{/red-fg}`);
    }
  };
  
  // Set up interval
  const interval = setInterval(updateDashboard, options.interval);
  
  // Key bindings
  screen.key(['escape', 'q', 'C-c'], () => {
    clearInterval(interval);
    process.exit(0);
  });
  
  // Initial update
  await updateDashboard();
  
  // Focus task list
  taskList.focus();
}