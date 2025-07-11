import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { formatOutput } from '../utils/format';
import { validateAgentConfig } from '../utils/validation';

export function createAgentCommand(): Command {
  const agent = new Command('agent');
  
  agent
    .description('Manage agents in the swarm')
    .option('-s, --swarm <swarmId>', 'target swarm ID');

  // Create a new agent
  agent
    .command('create')
    .description('Create a new agent')
    .option('-n, --name <name>', 'agent name')
    .option('-t, --type <type>', 'agent type (worker|coordinator|specialist)')
    .option('-c, --capabilities <capabilities>', 'comma-separated list of capabilities')
    .option('-i, --interactive', 'interactive agent creation')
    .option('--auto-start', 'automatically start the agent after creation')
    .action(async (options) => {
      const spinner = ora('Creating agent...').start();
      
      try {
        let config = {};
        
        if (options.interactive) {
          spinner.stop();
          config = await promptAgentConfig();
        } else {
          config = {
            name: options.name || `agent-${Date.now()}`,
            type: options.type || 'worker',
            capabilities: options.capabilities ? options.capabilities.split(',') : [],
            swarmId: agent.opts().swarm
          };
        }
        
        // Validate configuration
        const validation = validateAgentConfig(config);
        if (!validation.valid) {
          throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
        }
        
        spinner.text = 'Registering agent...';
        
        // Create agent
        const { createAgent } = await import('../../agents/agent-manager');
        const newAgent = await createAgent(config);
        
        if (options.autoStart) {
          spinner.text = 'Starting agent...';
          await newAgent.start();
        }
        
        spinner.succeed(`Agent '${config.name}' created successfully`);
        
        // Display agent details
        console.log(chalk.blue('\nAgent Details:'));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(`ID: ${chalk.cyan(newAgent.id)}`);
        console.log(`Name: ${chalk.cyan(config.name)}`);
        console.log(`Type: ${chalk.cyan(config.type)}`);
        console.log(`Capabilities: ${chalk.cyan(config.capabilities.join(', '))}`);
        console.log(`Status: ${chalk.green(options.autoStart ? 'Active' : 'Created')}`);
        console.log(chalk.gray('─'.repeat(50)));
        
        // Output in requested format
        const output = formatOutput({
          id: newAgent.id,
          ...config,
          status: options.autoStart ? 'active' : 'created'
        }, agent.parent.opts().format);
        
        if (agent.parent.opts().format !== 'table') {
          console.log(output);
        }
        
      } catch (error) {
        spinner.fail('Failed to create agent');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // List agents
  agent
    .command('list')
    .alias('ls')
    .description('List all agents')
    .option('-s, --status <status>', 'filter by status (online|offline|all)', 'all')
    .option('-t, --type <type>', 'filter by type')
    .option('--sort <field>', 'sort by field (name|created|status|type)', 'created')
    .action(async (options) => {
      const spinner = ora('Fetching agents...').start();
      
      try {
        const { listAgents } = await import('../../agents/agent-manager');
        let agents = await listAgents({
          swarmId: agent.opts().swarm
        });
        
        // Apply filters
        if (options.status !== 'all') {
          agents = agents.filter(a => a.status === options.status);
        }
        
        if (options.type) {
          agents = agents.filter(a => a.type === options.type);
        }
        
        // Sort
        agents.sort((a, b) => {
          switch (options.sort) {
            case 'name':
              return a.name.localeCompare(b.name);
            case 'status':
              return a.status.localeCompare(b.status);
            case 'type':
              return a.type.localeCompare(b.type);
            default:
              return b.created - a.created;
          }
        });
        
        spinner.succeed(`Found ${agents.length} agent(s)`);
        
        if (agents.length === 0) {
          console.log(chalk.yellow('No agents found'));
          return;
        }
        
        // Display based on format
        const format = agent.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(agents, format));
        } else {
          // Table format
          const table = new Table({
            head: ['ID', 'Name', 'Type', 'Status', 'Tasks', 'CPU', 'Memory', 'Created'],
            style: { head: ['cyan'] }
          });
          
          agents.forEach(a => {
            table.push([
              a.id.substring(0, 8),
              a.name,
              a.type,
              a.status === 'online' ? chalk.green(a.status) : chalk.gray(a.status),
              a.taskCount || 0,
              a.metrics ? `${a.metrics.cpu}%` : '-',
              a.metrics ? `${a.metrics.memory}MB` : '-',
              new Date(a.created).toLocaleString()
            ]);
          });
          
          console.log(table.toString());
        }
        
      } catch (error) {
        spinner.fail('Failed to list agents');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Show agent details
  agent
    .command('show <agentId>')
    .description('Show detailed information about an agent')
    .option('--tasks', 'include task history')
    .option('--metrics', 'include performance metrics')
    .option('--logs', 'include recent logs')
    .action(async (agentId, options) => {
      const spinner = ora('Fetching agent details...').start();
      
      try {
        const { getAgentDetails } = await import('../../agents/agent-manager');
        const details = await getAgentDetails(agentId, {
          includeTasks: options.tasks,
          includeMetrics: options.metrics,
          includeLogs: options.logs
        });
        
        if (!details) {
          throw new Error(`Agent '${agentId}' not found`);
        }
        
        spinner.succeed('Agent details retrieved');
        
        // Display based on format
        const format = agent.parent.opts().format;
        if (format === 'json' || format === 'yaml') {
          console.log(formatOutput(details, format));
        } else {
          displayAgentDetails(details, options);
        }
        
      } catch (error) {
        spinner.fail('Failed to get agent details');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Start an agent
  agent
    .command('start <agentId>')
    .description('Start an agent')
    .option('--wait', 'wait for agent to be fully ready')
    .action(async (agentId, options) => {
      const spinner = ora(`Starting agent ${agentId}...`).start();
      
      try {
        const { getAgent } = await import('../../agents/agent-manager');
        const agentInstance = await getAgent(agentId);
        
        if (!agentInstance) {
          throw new Error(`Agent '${agentId}' not found`);
        }
        
        await agentInstance.start();
        
        if (options.wait) {
          spinner.text = 'Waiting for agent to be ready...';
          await agentInstance.waitUntilReady();
        }
        
        spinner.succeed(`Agent '${agentId}' started successfully`);
        
      } catch (error) {
        spinner.fail('Failed to start agent');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Stop an agent
  agent
    .command('stop <agentId>')
    .description('Stop an agent')
    .option('-f, --force', 'force stop without graceful shutdown')
    .action(async (agentId, options) => {
      const spinner = ora(`Stopping agent ${agentId}...`).start();
      
      try {
        const { getAgent } = await import('../../agents/agent-manager');
        const agentInstance = await getAgent(agentId);
        
        if (!agentInstance) {
          throw new Error(`Agent '${agentId}' not found`);
        }
        
        if (options.force) {
          await agentInstance.forceStop();
        } else {
          await agentInstance.stop();
        }
        
        spinner.succeed(`Agent '${agentId}' stopped successfully`);
        
      } catch (error) {
        spinner.fail('Failed to stop agent');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Update agent configuration
  agent
    .command('update <agentId>')
    .description('Update agent configuration')
    .option('-n, --name <name>', 'new agent name')
    .option('-c, --capabilities <capabilities>', 'update capabilities (comma-separated)')
    .option('--add-capability <capability>', 'add a single capability')
    .option('--remove-capability <capability>', 'remove a single capability')
    .action(async (agentId, options) => {
      const spinner = ora(`Updating agent ${agentId}...`).start();
      
      try {
        const { updateAgent } = await import('../../agents/agent-manager');
        
        const updates = {};
        
        if (options.name) {
          updates.name = options.name;
        }
        
        if (options.capabilities) {
          updates.capabilities = options.capabilities.split(',');
        }
        
        if (options.addCapability || options.removeCapability) {
          const { getAgent } = await import('../../agents/agent-manager');
          const agentInstance = await getAgent(agentId);
          const currentCapabilities = agentInstance.capabilities || [];
          
          if (options.addCapability) {
            updates.capabilities = [...currentCapabilities, options.addCapability];
          }
          
          if (options.removeCapability) {
            updates.capabilities = currentCapabilities.filter(
              c => c !== options.removeCapability
            );
          }
        }
        
        await updateAgent(agentId, updates);
        
        spinner.succeed(`Agent '${agentId}' updated successfully`);
        
      } catch (error) {
        spinner.fail('Failed to update agent');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Delete an agent
  agent
    .command('delete <agentId>')
    .alias('rm')
    .description('Delete an agent')
    .option('-f, --force', 'skip confirmation')
    .action(async (agentId, options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete agent '${agentId}'?`,
              default: false
            }
          ]);
          
          if (!confirm) {
            console.log(chalk.yellow('Operation cancelled'));
            return;
          }
        }
        
        const spinner = ora(`Deleting agent ${agentId}...`).start();
        
        const { deleteAgent } = await import('../../agents/agent-manager');
        await deleteAgent(agentId);
        
        spinner.succeed(`Agent '${agentId}' deleted successfully`);
        
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Monitor agent
  agent
    .command('monitor <agentId>')
    .description('Monitor agent activity in real-time')
    .option('--interval <ms>', 'update interval in milliseconds', '1000')
    .action(async (agentId, options) => {
      console.log(chalk.blue(`Monitoring agent ${agentId}...`));
      console.log(chalk.gray('Press Ctrl+C to exit\n'));
      
      try {
        const { getAgent } = await import('../../agents/agent-manager');
        const agentInstance = await getAgent(agentId);
        
        if (!agentInstance) {
          throw new Error(`Agent '${agentId}' not found`);
        }
        
        await monitorAgent(agentInstance, {
          interval: parseInt(options.interval)
        });
        
      } catch (error) {
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  // Execute command on agent
  agent
    .command('exec <agentId> <command>')
    .description('Execute a command on an agent')
    .option('--async', 'run command asynchronously')
    .option('--timeout <ms>', 'command timeout in milliseconds', '30000')
    .action(async (agentId, command, options) => {
      const spinner = ora('Executing command...').start();
      
      try {
        const { getAgent } = await import('../../agents/agent-manager');
        const agentInstance = await getAgent(agentId);
        
        if (!agentInstance) {
          throw new Error(`Agent '${agentId}' not found`);
        }
        
        const result = await agentInstance.execute(command, {
          async: options.async,
          timeout: parseInt(options.timeout)
        });
        
        spinner.succeed('Command executed');
        
        if (!options.async) {
          console.log(chalk.blue('\nCommand Output:'));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(result.output);
          console.log(chalk.gray('─'.repeat(50)));
          console.log(`Exit Code: ${result.exitCode}`);
          console.log(`Duration: ${result.duration}ms`);
        } else {
          console.log(`Command ID: ${result.commandId}`);
          console.log('Use `agent show-command` to check status');
        }
        
      } catch (error) {
        spinner.fail('Failed to execute command');
        console.error(chalk.red(error.message));
        process.exit(1);
      }
    });

  return agent;
}

// Helper functions

async function promptAgentConfig() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      default: `agent-${Date.now()}`
    },
    {
      type: 'list',
      name: 'type',
      message: 'Agent type:',
      choices: [
        { name: 'Worker - General purpose task execution', value: 'worker' },
        { name: 'Coordinator - Manages other agents', value: 'coordinator' },
        { name: 'Specialist - Domain-specific tasks', value: 'specialist' }
      ],
      default: 'worker'
    },
    {
      type: 'checkbox',
      name: 'capabilities',
      message: 'Select agent capabilities:',
      choices: [
        { name: 'Data Processing', value: 'data-processing' },
        { name: 'API Integration', value: 'api-integration' },
        { name: 'File Operations', value: 'file-operations' },
        { name: 'Web Scraping', value: 'web-scraping' },
        { name: 'Machine Learning', value: 'ml' },
        { name: 'Natural Language Processing', value: 'nlp' },
        { name: 'Image Processing', value: 'image-processing' },
        { name: 'Database Operations', value: 'database' },
        { name: 'Real-time Processing', value: 'realtime' },
        { name: 'Batch Processing', value: 'batch' }
      ]
    },
    {
      type: 'confirm',
      name: 'autoStart',
      message: 'Start agent immediately?',
      default: true
    }
  ]);
  
  return answers;
}

function displayAgentDetails(details: any, options: any) {
  console.log(chalk.blue('\nAgent Information:'));
  console.log(chalk.gray('─'.repeat(60)));
  
  // Basic info
  const infoTable = new Table({
    chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
  });
  
  infoTable.push(
    { 'ID': details.id },
    { 'Name': details.name },
    { 'Type': details.type },
    { 'Status': details.status === 'online' ? chalk.green(details.status) : chalk.gray(details.status) },
    { 'Swarm': details.swarmId || 'None' },
    { 'Created': new Date(details.created).toLocaleString() },
    { 'Last Seen': details.lastSeen ? new Date(details.lastSeen).toLocaleString() : 'Never' }
  );
  
  console.log(infoTable.toString());
  
  // Capabilities
  if (details.capabilities && details.capabilities.length > 0) {
    console.log(chalk.blue('\nCapabilities:'));
    details.capabilities.forEach(cap => {
      console.log(`  • ${cap}`);
    });
  }
  
  // Metrics
  if (options.metrics && details.metrics) {
    console.log(chalk.blue('\nPerformance Metrics:'));
    const metricsTable = new Table({
      chars: { 'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
    });
    
    metricsTable.push(
      { 'CPU Usage': `${details.metrics.cpu}%` },
      { 'Memory Usage': `${details.metrics.memory}MB / ${details.metrics.maxMemory}MB` },
      { 'Active Tasks': details.metrics.activeTasks },
      { 'Completed Tasks': details.metrics.completedTasks },
      { 'Failed Tasks': details.metrics.failedTasks },
      { 'Average Task Time': `${details.metrics.avgTaskTime}ms` },
      { 'Success Rate': `${details.metrics.successRate}%` }
    );
    
    console.log(metricsTable.toString());
  }
  
  // Task History
  if (options.tasks && details.tasks) {
    console.log(chalk.blue('\nRecent Tasks:'));
    const taskTable = new Table({
      head: ['ID', 'Name', 'Status', 'Duration', 'Completed'],
      style: { head: ['cyan'] }
    });
    
    details.tasks.slice(0, 10).forEach(task => {
      taskTable.push([
        task.id.substring(0, 8),
        task.name,
        getTaskStatusColor(task.status),
        task.duration ? `${task.duration}ms` : '-',
        task.completedAt ? new Date(task.completedAt).toLocaleString() : '-'
      ]);
    });
    
    console.log(taskTable.toString());
  }
  
  // Logs
  if (options.logs && details.logs) {
    console.log(chalk.blue('\nRecent Logs:'));
    console.log(chalk.gray('─'.repeat(60)));
    details.logs.slice(0, 20).forEach(log => {
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
    default:
      return chalk.gray(status);
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

async function monitorAgent(agent: any, options: { interval: number }) {
  // Real-time monitoring implementation
  const updateMetrics = async () => {
    const metrics = await agent.getMetrics();
    console.clear();
    console.log(chalk.blue(`Monitoring Agent: ${agent.name} (${agent.id})`));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`Status: ${agent.status === 'online' ? chalk.green(agent.status) : chalk.gray(agent.status)}`);
    console.log(`CPU: ${metrics.cpu}%`);
    console.log(`Memory: ${metrics.memory}MB / ${metrics.maxMemory}MB`);
    console.log(`Active Tasks: ${metrics.activeTasks}`);
    console.log(`Completed Tasks: ${metrics.completedTasks}`);
    console.log(`Failed Tasks: ${metrics.failedTasks}`);
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray('Press Ctrl+C to exit'));
  };
  
  // Initial update
  await updateMetrics();
  
  // Set up interval
  const interval = setInterval(updateMetrics, options.interval);
  
  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(chalk.green('\nMonitoring stopped'));
    process.exit(0);
  });
}