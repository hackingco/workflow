import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { EventEmitter } from 'events';
import { SwarmCoordinator } from '../../swarm/coordinator';
import { formatOutput } from '../utils/format';
import { validateSwarmConfig } from '../utils/validation';

export function createSwarmCommand(): Command {
  const swarm = new Command('swarm');
  
  swarm
    .description('Manage swarm operations')
    .option('-n, --name <name>', 'swarm name')
    .option('-t, --type <type>', 'swarm type (distributed|local|hybrid)')
    .option('--max-agents <number>', 'maximum number of agents', '10');

  // Start a new swarm
  swarm
    .command('start')
    .description('Start a new swarm')
    .option('-c, --config <path>', 'configuration file path')
    .option('-i, --interactive', 'interactive configuration')
    .option('--strategy <strategy>', 'execution strategy (parallel|sequential|adaptive)', 'adaptive')
    .option('--watch', 'watch swarm progress in real-time')
    .action(async (options) => {
      const spinner = ora('Initializing swarm...').start();
      
      try {
        let config = {};
        
        if (options.interactive) {
          spinner.stop();
          config = await promptSwarmConfig();
        } else if (options.config) {
          const { loadSwarmConfig } = await import('../utils/config');
          config = await loadSwarmConfig(options.config);
        } else {
          config = {
            name: swarm.opts().name || `swarm-${Date.now()}`,
            type: swarm.opts().type || 'distributed',
            maxAgents: parseInt(swarm.opts().maxAgents),
            strategy: options.strategy
          };
        }
        
        // Validate configuration
        const validation = validateSwarmConfig(config);
        if (!validation.valid) {
          throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }
        
        spinner.text = 'Starting swarm coordinator...';
        
        // Initialize swarm coordinator
        const coordinator = new SwarmCoordinator(config);
        await coordinator.initialize();
        
        spinner.succeed(`Swarm '${config.name}' started successfully`);
        
        console.log(chalk.blue('\nSwarm Details:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`ID: ${chalk.cyan(coordinator.id)}`);
        console.log(`Name: ${chalk.cyan(config.name)}`);
        console.log(`Type: ${chalk.cyan(config.type)}`);
        console.log(`Strategy: ${chalk.cyan(config.strategy)}`);
        console.log(`Max Agents: ${chalk.cyan(config.maxAgents)}`);
        console.log(`Status: ${chalk.green('Active')}`);
        console.log(chalk.gray('─'.repeat(50)));
        
        if (options.watch) {
          await watchSwarmProgress(coordinator);
        }
        
        // Output in requested format
        const output = formatOutput({
          id: coordinator.id,
          ...config,
          status: 'active'
        }, swarm.parent.opts().format);
        
        if (swarm.parent.opts().format !== 'table') {
          console.log(output);
        }
        
      } catch (error) {
        spinner.fail('Failed to start swarm');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Stop a swarm
  swarm
    .command('stop <swarmId>')
    .description('Stop a running swarm')
    .option('-f, --force', 'force stop without graceful shutdown')
    .option('--timeout <seconds>', 'shutdown timeout in seconds', '30')
    .action(async (swarmId, options) => {
      const spinner = ora(`Stopping swarm ${swarmId}...`).start();
      
      try {
        const { getSwarmCoordinator } = await import('../utils/registry');
        const coordinator = await getSwarmCoordinator(swarmId);
        
        if (!coordinator) {
          throw new Error(`Swarm '${swarmId}' not found`);
        }
        
        if (!options.force) {
          spinner.text = 'Gracefully shutting down swarm...';
          await coordinator.shutdown({ timeout: parseInt(options.timeout) * 1000 });
        } else {
          spinner.text = 'Force stopping swarm...';
          await coordinator.forceShutdown();
        }
        
        spinner.succeed(`Swarm '${swarmId}' stopped successfully`);
        
      } catch (error) {
        spinner.fail('Failed to stop swarm');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // List all swarms
  swarm
    .command('list')
    .alias('ls')
    .description('List all swarms')
    .option('-s, --status <status>', 'filter by status (active|inactive|all)', 'all')
    .option('--sort <field>', 'sort by field (name|created|status)', 'created')
    .action(async (options) => {
      const spinner = ora('Fetching swarms...').start();
      
      try {
        const { listSwarms } = await import('../utils/registry');
        let swarms = await listSwarms();
        
        // Filter by status
        if (options.status !== 'all') {
          swarms = swarms.filter(s => s.status === options.status);
        }
        
        // Sort
        swarms.sort((a, b) => {
          switch (options.sort) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'status':
              return a.status.localeCompare(b.status);
            default:
              return b.created - a.created;
          }
        });
        
        spinner.succeed(`Found ${swarms.length} swarm(s)`);
        
        if (swarms.length === 0) {
          console.log(chalk.yellow('No swarms found'));
          return;
        }
        
        // Display based on format
        const format = swarm.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(swarms, format));
        } else {
          // Table format
          const table = new Table({
            head: ['ID', 'Name', 'Type', 'Status', 'Agents', 'Created'],
            style: { head: ['cyan'] }
          });
          
          swarms.forEach(s => {
            table.push([
              s.id.substring(0, 8),
              s.name,
              s.type,
              s.status === 'active' ? chalk.green(s.status) : chalk.gray(s.status),
              `${s.activeAgents}/${s.maxAgents}`,
              new Date(s.created).toLocaleString()
            ]);
          });
          
          console.log(table.toString());
        }
        
      } catch (error) {
        spinner.fail('Failed to list swarms');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Show swarm details
  swarm
    .command('show <swarmId>')
    .description('Show detailed information about a swarm')
    .option('--agents', 'include agent details')
    .option('--tasks', 'include task details')
    .option('--metrics', 'include performance metrics')
    .action(async (swarmId, options) => {
      const spinner = ora(`Fetching swarm details...`).start();
      
      try {
        const { getSwarmDetails } = await import('../utils/registry');
        const details = await getSwarmDetails(swarmId, {
          includeAgents: options.agents,
          includeTasks: options.tasks,
          includeMetrics: options.metrics
        });
        
        if (!details) {
          throw new Error(`Swarm '${swarmId}' not found`);
        }
        
        spinner.succeed('Swarm details retrieved');
        
        // Display based on format
        const format = swarm.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(details, format));
        } else {
          // Detailed table view
          displaySwarmDetails(details, options);
        }
        
      } catch (error) {
        spinner.fail('Failed to get swarm details');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Scale swarm
  swarm
    .command('scale <swarmId> <agents>')
    .description('Scale the number of agents in a swarm')
    .option('--strategy <strategy>', 'scaling strategy (immediate|gradual)', 'gradual')
    .action(async (swarmId, agents, options) => {
      const spinner = ora(`Scaling swarm ${swarmId}...`).start();
      
      try {
        const { getSwarmCoordinator } = await import('../utils/registry');
        const coordinator = await getSwarmCoordinator(swarmId);
        
        if (!coordinator) {
          throw new Error(`Swarm '${swarmId}' not found`);
        }
        
        const targetAgents = parseInt(agents);
        if (isNaN(targetAgents) || targetAgents < 0) {
          throw new Error('Invalid number of agents');
        }
        
        spinner.text = `Scaling to ${targetAgents} agents...`;
        
        await coordinator.scale({
          targetAgents,
          strategy: options.strategy
        });
        
        spinner.succeed(`Swarm scaled to ${targetAgents} agents`);
        
      } catch (error) {
        spinner.fail('Failed to scale swarm');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Monitor swarm
  swarm
    .command('monitor <swarmId>')
    .description('Monitor swarm activity in real-time')
    .option('--interval <ms>', 'update interval in milliseconds', '1000')
    .action(async (swarmId, options) => {
      console.log(chalk.blue(`Monitoring swarm ${swarmId}...`));
      console.log(chalk.gray('Press Ctrl+C to exit\n'));
      
      try {
        const { getSwarmCoordinator } = await import('../utils/registry');
        const coordinator = await getSwarmCoordinator(swarmId);
        
        if (!coordinator) {
          throw new Error(`Swarm '${swarmId}' not found`);
        }
        
        await monitorSwarm(coordinator, {
          interval: parseInt(options.interval)
        });
        
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  return swarm;
}

// Helper functions

async function promptSwarmConfig() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Swarm name:',
      default: `swarm-${Date.now()}`
    },
    {
      type: 'list',
      name: 'type',
      message: 'Swarm type:',
      choices: [
        { name: 'Distributed - Agents run on multiple nodes', value: 'distributed' },
        { name: 'Local - All agents run locally', value: 'local' },
        { name: 'Hybrid - Mix of local and distributed agents', value: 'hybrid' }
      ],
      default: 'distributed'
    },
    {
      type: 'list',
      name: 'strategy',
      message: 'Execution strategy:',
      choices: [
        { name: 'Parallel - Execute tasks in parallel', value: 'parallel' },
        { name: 'Sequential - Execute tasks one by one', value: 'sequential' },
        { name: 'Adaptive - Automatically adjust based on load', value: 'adaptive' }
      ],
      default: 'adaptive'
    },
    {
      type: 'number',
      name: 'maxAgents',
      message: 'Maximum number of agents:',
      default: 10,
      validate: (value) => value > 0 || 'Must be greater than 0'
    },
    {
      type: 'confirm',
      name: 'enableMonitoring',
      message: 'Enable real-time monitoring?',
      default: true
    }
  ]);
  
  return answers;
}

async function watchSwarmProgress(coordinator: SwarmCoordinator) {
  const progressBar = new (await import('cli-progress')).SingleBar({
    format: 'Progress |{bar}| {percentage}% | {value}/{total} Tasks | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  
  coordinator.on('progress', (progress) => {
    if (!progressBar.isActive) {
      progressBar.start(progress.total, 0);
    }
    progressBar.update(progress.completed);
  });
  
  coordinator.on('complete', () => {
    progressBar.stop();
    console.log(chalk.green('\nSwarm execution completed!'));
  });
}

function displaySwarmDetails(details: any, options: any) {
  console.log(chalk.blue('\nSwarm Information:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  // Basic info
  const infoTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
  });
  
  infoTable.push(
    { 'ID': details.id },
    { 'Name': details.name },
    { 'Type': details.type },
    { 'Status': details.status === 'active' ? chalk.green(details.status) : chalk.gray(details.status) },
    { 'Strategy': details.strategy },
    { 'Created': new Date(details.created).toLocaleString() },
    { 'Uptime': details.uptime }
  );
  
  console.log(infoTable.toString());
  
  // Agents
  if (options.agents && details.agents) {
    console.log(chalk.blue('\nAgents:'));
    const agentTable = new Table({
      head: ['ID', 'Name', 'Status', 'Tasks', 'CPU', 'Memory'],
      style: { head: ['cyan'] }
    });
    
    details.agents.forEach(agent => {
      agentTable.push([
        agent.id.substring(0, 8),
        agent.name,
        agent.status === 'online' ? chalk.green(agent.status) : chalk.gray(agent.status),
        agent.taskCount,
        `${agent.cpu}%`,
        `${agent.memory}MB`
      ]);
    });
    
    console.log(agentTable.toString());
  }
  
  // Tasks
  if (options.tasks && details.tasks) {
    console.log(chalk.blue('\nTasks:'));
    const taskTable = new Table({
      head: ['ID', 'Name', 'Status', 'Agent', 'Duration'],
      style: { head: ['cyan'] }
    });
    
    details.tasks.forEach(task => {
      taskTable.push([
        task.id.substring(0, 8),
        task.name,
        getTaskStatusColor(task.status),
        task.agentId ? task.agentId.substring(0, 8) : '-',
        task.duration || '-'
      ]);
    });
    
    console.log(taskTable.toString());
  }
  
  // Metrics
  if (options.metrics && details.metrics) {
    console.log(chalk.blue('\nPerformance Metrics:'));
    const metricsTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    });
    
    metricsTable.push(
      { 'Tasks Completed': details.metrics.tasksCompleted },
      { 'Tasks Failed': details.metrics.tasksFailed },
      { 'Average Task Duration': details.metrics.avgTaskDuration },
      { 'Success Rate': `${details.metrics.successRate}%` },
      { 'Throughput': `${details.metrics.throughput} tasks/min` }
    );
    
    console.log(metricsTable.toString());
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
    default:
      return chalk.gray(status);
  }
}

async function monitorSwarm(coordinator: SwarmCoordinator, options: { interval: number }) {
  const blessed = await import('blessed');
  const contrib = await import('blessed-contrib');
  
  const screen = blessed.screen();
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  
  // Create dashboard widgets
  const taskGauge = grid.set(0, 0, 4, 4, contrib.gauge, {
    label: 'Task Completion',
    percent: 0
  });
  
  const agentTable = grid.set(0, 4, 4, 8, contrib.table, {
    keys: true,
    label: 'Active Agents',
    columnSpacing: 3,
    columnWidth: [10, 20, 10, 10]
  });
  
  const taskLog = grid.set(4, 0, 4, 12, contrib.log, {
    label: 'Task Activity',
    tags: true
  });
  
  const performanceChart = grid.set(8, 0, 4, 12, contrib.line, {
    label: 'Performance Metrics',
    showLegend: true
  });
  
  // Update loop
  const updateDashboard = async () => {
    const status = await coordinator.getStatus();
    
    // Update task gauge
    const completion = (status.tasksCompleted / status.tasksTotal) * 100;
    taskGauge.setPercent(completion);
    
    // Update agent table
    agentTable.setData({
      headers: ['ID', 'Name', 'Status', 'Tasks'],
      data: status.agents.map(a => [
        a.id.substring(0, 8),
        a.name,
        a.status,
        a.taskCount.toString()
      ])
    });
    
    // Update performance chart
    // ... chart update logic
    
    screen.render();
  };
  
  // Set up update interval
  const interval = setInterval(updateDashboard, options.interval);
  
  // Handle exit
  screen.key(['escape', 'q', 'C-c'], () => {
    clearInterval(interval);
    process.exit(0);
  });
  
  // Initial update
  await updateDashboard();
}