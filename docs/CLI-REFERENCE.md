# Swarm CLI Reference

The Swarm CLI provides a comprehensive command-line interface for managing distributed swarm operations, agents, and tasks. It includes rich terminal UI features, real-time monitoring, and integrations with GitHub, Slack, and MCP protocols.

## Installation

### Global Installation
```bash
npm install -g @hackingco/flow-framework
```

### Local Installation
```bash
npm install @hackingco/flow-framework
npx swarm --help
```

## Configuration

The CLI can be configured through multiple methods:

1. **Configuration File**: `swarm.config.json` or `swarm.config.yaml`
2. **Environment Variables**: Prefixed with `SWARM_`
3. **Command-line Options**: Override any configuration

### Configuration File Example

```json
{
  "defaultSwarmType": "distributed",
  "defaultStrategy": "adaptive",
  "maxAgents": 10,
  "outputFormat": "table",
  "colorOutput": true,
  "integrations": {
    "github": {
      "enabled": true,
      "token": "${GITHUB_TOKEN}",
      "owner": "hackingco",
      "repo": "flow-framework"
    },
    "slack": {
      "enabled": true,
      "token": "${SLACK_TOKEN}",
      "defaultChannel": "#swarm-alerts"
    },
    "mcp": {
      "enabled": true,
      "serverUrl": "ws://localhost:8080",
      "apiKey": "${MCP_API_KEY}"
    }
  },
  "plugins": ["./plugins/custom-plugin.js"],
  "aliases": {
    "ls": "list",
    "rm": "delete"
  }
}
```

### Environment Variables

- `SWARM_DEFAULT_TYPE`: Default swarm type (distributed|local|hybrid)
- `SWARM_MAX_AGENTS`: Maximum number of agents
- `SWARM_OUTPUT_FORMAT`: Output format (json|yaml|table)
- `GITHUB_TOKEN`: GitHub authentication token
- `GITHUB_OWNER`: GitHub repository owner
- `GITHUB_REPO`: GitHub repository name
- `SLACK_TOKEN`: Slack bot token
- `SLACK_DEFAULT_CHANNEL`: Default Slack channel
- `MCP_SERVER_URL`: MCP server URL
- `MCP_API_KEY`: MCP API key

## Global Options

Options available for all commands:

- `-c, --config <path>`: Path to config file (default: ./swarm.config.json)
- `-f, --format <format>`: Output format: json|yaml|table (default: table)
- `--no-color`: Disable colored output
- `-v, --verbose`: Verbose output
- `-q, --quiet`: Quiet mode

## Commands

### swarm

Main command for the Swarm CLI.

```bash
swarm [options] [command]
```

### swarm interactive

Start interactive mode with menu-driven interface.

```bash
swarm interactive
swarm i  # alias
```

Interactive mode provides:
- Menu-driven navigation
- Step-by-step wizards
- Real-time status updates
- Configuration management

### swarm config

Manage CLI configuration.

```bash
swarm config [options]
```

Options:
- `-l, --list`: List all configuration values
- `-s, --set <key=value>`: Set a configuration value
- `-g, --get <key>`: Get a configuration value
- `-r, --reset`: Reset to default configuration

Examples:
```bash
swarm config --list
swarm config --set maxAgents=20
swarm config --get defaultSwarmType
swarm config --reset
```

### swarm status

Show overall system status.

```bash
swarm status [options]
```

Options:
- `-w, --watch`: Watch status in real-time

Examples:
```bash
swarm status
swarm status --watch
swarm status -f json
```

## Swarm Commands

### swarm swarm start

Start a new swarm.

```bash
swarm swarm start [options]
```

Options:
- `-n, --name <name>`: Swarm name
- `-t, --type <type>`: Swarm type (distributed|local|hybrid)
- `--max-agents <number>`: Maximum number of agents
- `-c, --config <path>`: Configuration file path
- `-i, --interactive`: Interactive configuration
- `--strategy <strategy>`: Execution strategy (parallel|sequential|adaptive)
- `--watch`: Watch swarm progress in real-time

Examples:
```bash
swarm swarm start --name prod-swarm --type distributed
swarm swarm start -i  # Interactive mode
swarm swarm start -c swarm-config.yaml --watch
```

### swarm swarm stop

Stop a running swarm.

```bash
swarm swarm stop <swarmId> [options]
```

Options:
- `-f, --force`: Force stop without graceful shutdown
- `--timeout <seconds>`: Shutdown timeout in seconds (default: 30)

Examples:
```bash
swarm swarm stop swarm-123
swarm swarm stop swarm-123 --force
swarm swarm stop swarm-123 --timeout 60
```

### swarm swarm list

List all swarms.

```bash
swarm swarm list [options]
swarm swarm ls [options]  # alias
```

Options:
- `-s, --status <status>`: Filter by status (active|inactive|all)
- `--sort <field>`: Sort by field (name|created|status)

Examples:
```bash
swarm swarm list
swarm swarm ls --status active
swarm swarm list --sort name -f json
```

### swarm swarm show

Show detailed information about a swarm.

```bash
swarm swarm show <swarmId> [options]
```

Options:
- `--agents`: Include agent details
- `--tasks`: Include task details
- `--metrics`: Include performance metrics

Examples:
```bash
swarm swarm show swarm-123
swarm swarm show swarm-123 --agents --tasks
swarm swarm show swarm-123 --metrics -f yaml
```

### swarm swarm scale

Scale the number of agents in a swarm.

```bash
swarm swarm scale <swarmId> <agents> [options]
```

Options:
- `--strategy <strategy>`: Scaling strategy (immediate|gradual)

Examples:
```bash
swarm swarm scale swarm-123 20
swarm swarm scale swarm-123 5 --strategy gradual
```

### swarm swarm monitor

Monitor swarm activity in real-time.

```bash
swarm swarm monitor <swarmId> [options]
```

Options:
- `--interval <ms>`: Update interval in milliseconds (default: 1000)

Examples:
```bash
swarm swarm monitor swarm-123
swarm swarm monitor swarm-123 --interval 500
```

## Agent Commands

### swarm agent create

Create a new agent.

```bash
swarm agent create [options]
```

Options:
- `-n, --name <name>`: Agent name
- `-t, --type <type>`: Agent type (worker|coordinator|specialist)
- `-c, --capabilities <capabilities>`: Comma-separated list of capabilities
- `-i, --interactive`: Interactive agent creation
- `--auto-start`: Automatically start the agent after creation

Examples:
```bash
swarm agent create --name worker-1 --type worker
swarm agent create -i  # Interactive mode
swarm agent create --capabilities "data-processing,api-integration" --auto-start
```

### swarm agent list

List all agents.

```bash
swarm agent list [options]
swarm agent ls [options]  # alias
```

Options:
- `-s, --status <status>`: Filter by status (online|offline|all)
- `-t, --type <type>`: Filter by type
- `--sort <field>`: Sort by field (name|created|status|type)

Examples:
```bash
swarm agent list
swarm agent ls --status online
swarm agent list --type worker -f json
```

### swarm agent show

Show detailed information about an agent.

```bash
swarm agent show <agentId> [options]
```

Options:
- `--tasks`: Include task history
- `--metrics`: Include performance metrics
- `--logs`: Include recent logs

Examples:
```bash
swarm agent show agent-123
swarm agent show agent-123 --tasks --metrics
swarm agent show agent-123 --logs -f yaml
```

### swarm agent start

Start an agent.

```bash
swarm agent start <agentId> [options]
```

Options:
- `--wait`: Wait for agent to be fully ready

Examples:
```bash
swarm agent start agent-123
swarm agent start agent-123 --wait
```

### swarm agent stop

Stop an agent.

```bash
swarm agent stop <agentId> [options]
```

Options:
- `-f, --force`: Force stop without graceful shutdown

Examples:
```bash
swarm agent stop agent-123
swarm agent stop agent-123 --force
```

### swarm agent update

Update agent configuration.

```bash
swarm agent update <agentId> [options]
```

Options:
- `-n, --name <name>`: New agent name
- `-c, --capabilities <capabilities>`: Update capabilities (comma-separated)
- `--add-capability <capability>`: Add a single capability
- `--remove-capability <capability>`: Remove a single capability

Examples:
```bash
swarm agent update agent-123 --name worker-prod-1
swarm agent update agent-123 --add-capability ml
swarm agent update agent-123 --remove-capability web-scraping
```

### swarm agent delete

Delete an agent.

```bash
swarm agent delete <agentId> [options]
swarm agent rm <agentId> [options]  # alias
```

Options:
- `-f, --force`: Skip confirmation

Examples:
```bash
swarm agent delete agent-123
swarm agent rm agent-123 --force
```

### swarm agent monitor

Monitor agent activity in real-time.

```bash
swarm agent monitor <agentId> [options]
```

Options:
- `--interval <ms>`: Update interval in milliseconds (default: 1000)

Examples:
```bash
swarm agent monitor agent-123
swarm agent monitor agent-123 --interval 500
```

### swarm agent exec

Execute a command on an agent.

```bash
swarm agent exec <agentId> <command> [options]
```

Options:
- `--async`: Run command asynchronously
- `--timeout <ms>`: Command timeout in milliseconds (default: 30000)

Examples:
```bash
swarm agent exec agent-123 "process-data --input file.csv"
swarm agent exec agent-123 "long-running-task" --async
swarm agent exec agent-123 "quick-check" --timeout 5000
```

## Task Commands

### swarm task create

Create a new task.

```bash
swarm task create [options]
```

Options:
- `-n, --name <name>`: Task name
- `-t, --type <type>`: Task type
- `-p, --priority <priority>`: Task priority (low|medium|high|critical)
- `-d, --data <data>`: Task data (JSON string)
- `-f, --file <file>`: Load task data from file
- `-i, --interactive`: Interactive task creation
- `--dependencies <ids>`: Comma-separated list of dependency task IDs
- `--timeout <ms>`: Task timeout in milliseconds
- `--retries <count>`: Number of retry attempts (default: 3)
- `--schedule <cron>`: Schedule task with cron expression

Examples:
```bash
swarm task create --name "Process Data" --type data-processing
swarm task create -i  # Interactive mode
swarm task create -f task-config.json --priority high
swarm task create --schedule "0 0 * * *" --name "Daily Report"
```

### swarm task list

List all tasks.

```bash
swarm task list [options]
swarm task ls [options]  # alias
```

Options:
- `-s, --status <status>`: Filter by status (pending|running|completed|failed|all)
- `-p, --priority <priority>`: Filter by priority
- `-a, --agent <agentId>`: Filter by assigned agent
- `--sort <field>`: Sort by field (name|created|priority|status)
- `--limit <count>`: Limit number of results (default: 50)

Examples:
```bash
swarm task list
swarm task ls --status running
swarm task list --priority critical --sort created
```

### swarm task show

Show detailed information about a task.

```bash
swarm task show <taskId> [options]
```

Options:
- `--logs`: Include task logs
- `--results`: Include task results
- `--timeline`: Show task timeline

Examples:
```bash
swarm task show task-123
swarm task show task-123 --logs --results
swarm task show task-123 --timeline -f json
```

### swarm task run

Run a task immediately.

```bash
swarm task run <taskId> [options]
```

Options:
- `--agent <agentId>`: Specific agent to run the task
- `--wait`: Wait for task completion
- `--timeout <ms>`: Override task timeout

Examples:
```bash
swarm task run task-123
swarm task run task-123 --agent agent-456 --wait
swarm task run task-123 --timeout 60000
```

### swarm task cancel

Cancel a running task.

```bash
swarm task cancel <taskId> [options]
```

Options:
- `-f, --force`: Force cancellation

Examples:
```bash
swarm task cancel task-123
swarm task cancel task-123 --force
```

### swarm task retry

Retry a failed task.

```bash
swarm task retry <taskId> [options]
```

Options:
- `--reset`: Reset task state before retry

Examples:
```bash
swarm task retry task-123
swarm task retry task-123 --reset
```

### swarm task assign

Assign a task to a specific agent.

```bash
swarm task assign <taskId> <agentId>
```

Examples:
```bash
swarm task assign task-123 agent-456
```

### swarm task delete

Delete a task.

```bash
swarm task delete <taskId> [options]
swarm task rm <taskId> [options]  # alias
```

Options:
- `-f, --force`: Skip confirmation

Examples:
```bash
swarm task delete task-123
swarm task rm task-123 --force
```

### swarm task batch

Perform batch operations on tasks.

```bash
swarm task batch [options]
```

Options:
- `-f, --file <file>`: Batch operation file (JSON/YAML)
- `-o, --operation <op>`: Operation type (create|run|cancel|delete)
- `--dry-run`: Preview operations without executing

Examples:
```bash
swarm task batch -f batch-tasks.json -o create
swarm task batch -f operations.yaml --dry-run
```

### swarm task monitor

Monitor task execution in real-time.

```bash
swarm task monitor [options]
```

Options:
- `--filter <status>`: Filter tasks by status
- `--interval <ms>`: Update interval in milliseconds (default: 1000)

Examples:
```bash
swarm task monitor
swarm task monitor --filter running
swarm task monitor --interval 500
```

## Integration Commands

### GitHub Integration

When GitHub integration is enabled, additional features are available:

- Automatic issue creation for failed tasks
- Pull request creation for automated changes
- Workflow triggering and monitoring
- Webhook support for real-time updates

Example workflow:
```bash
# Configure GitHub integration
swarm config --set integrations.github.enabled=true
swarm config --set integrations.github.token=$GITHUB_TOKEN

# Create issue for failed task
swarm task show task-123 --create-issue

# Monitor GitHub workflow
swarm github workflow monitor run-123
```

### Slack Integration

When Slack integration is enabled, you can:

- Send notifications for swarm events
- Create progress updates
- Upload reports and files
- Interactive bot commands

Example usage:
```bash
# Configure Slack integration
swarm config --set integrations.slack.enabled=true
swarm config --set integrations.slack.token=$SLACK_TOKEN

# Send notification
swarm slack notify --channel "#ops" --message "Swarm started"

# Create progress message
swarm task run task-123 --slack-progress
```

### MCP Integration

MCP (Model Context Protocol) integration enables:

- Tool execution through MCP
- Resource management
- Prompt execution
- Event subscriptions

Example usage:
```bash
# Configure MCP integration
swarm config --set integrations.mcp.enabled=true
swarm config --set integrations.mcp.serverUrl=ws://localhost:8080

# Execute MCP tool
swarm mcp tool execute data-processor --params '{"input": "data.csv"}'

# List available tools
swarm mcp tool list
```

## Plugin System

The CLI supports a plugin system for extending functionality.

### Creating a Plugin

```javascript
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Custom plugin for swarm operations',
  
  async init(context) {
    context.logger.info('Plugin initialized');
  },
  
  commands: [
    {
      name: 'custom',
      description: 'Custom command',
      async action(options, context) {
        // Command implementation
      }
    }
  ],
  
  hooks: {
    async beforeCommand(command, options) {
      // Hook implementation
    }
  }
};
```

### Loading Plugins

```bash
# Via configuration
swarm config --set plugins[0]=./my-plugin.js

# Via command line
swarm --plugin ./my-plugin.js [command]
```

## Output Formats

The CLI supports multiple output formats:

### Table Format (Default)
Human-readable table format with colors and formatting.

### JSON Format
```bash
swarm swarm list -f json
```

Output:
```json
[
  {
    "id": "swarm-123",
    "name": "production-swarm",
    "type": "distributed",
    "status": "active"
  }
]
```

### YAML Format
```bash
swarm swarm list -f yaml
```

Output:
```yaml
- id: swarm-123
  name: production-swarm
  type: distributed
  status: active
```

## Advanced Features

### Real-time Monitoring
The CLI includes blessed-based terminal UI for real-time monitoring:
- Task progress bars
- Performance charts
- Resource usage gauges
- Activity logs

### Interactive Prompts
Interactive mode provides guided workflows with:
- Step-by-step wizards
- Validation and error handling
- Context-aware suggestions
- Progress indicators

### Batch Operations
Execute multiple operations efficiently:
```bash
# Create multiple tasks from file
swarm task batch -f tasks.json -o create

# Cancel all pending tasks
swarm task list --status pending -f json | \
  jq -r '.[].id' | \
  xargs -I {} swarm task cancel {}
```

### Shell Completion
Enable shell completion for better CLI experience:

```bash
# Bash
swarm completion bash > /etc/bash_completion.d/swarm

# Zsh
swarm completion zsh > ~/.zsh/completions/_swarm

# Fish
swarm completion fish > ~/.config/fish/completions/swarm.fish
```

## Troubleshooting

### Debug Mode
Enable debug output:
```bash
DEBUG=* swarm [command]
SWARM_DEBUG=true swarm [command]
```

### Common Issues

1. **Permission Denied**
   ```bash
   sudo npm install -g @hackingco/flow-framework
   ```

2. **Config Not Found**
   ```bash
   swarm config --init
   ```

3. **Connection Issues**
   Check integration configurations and network connectivity.

### Getting Help
```bash
swarm --help
swarm [command] --help
swarm help [command]
```

## Examples

### Complete Workflow Example

```bash
# 1. Initialize configuration
swarm config --init

# 2. Start a swarm
swarm swarm start --name prod-swarm --type distributed --max-agents 20

# 3. Create agents
swarm agent create --name worker-1 --type worker --auto-start
swarm agent create --name worker-2 --type worker --auto-start

# 4. Create and run tasks
swarm task create --name "Process Data" --type data-processing --priority high
swarm task run task-123 --wait

# 5. Monitor progress
swarm swarm monitor swarm-123

# 6. Clean up
swarm swarm stop swarm-123
```

### Integration Example

```bash
# Configure integrations
export GITHUB_TOKEN=ghp_xxx
export SLACK_TOKEN=xoxb-xxx

swarm config --set integrations.github.enabled=true
swarm config --set integrations.slack.enabled=true

# Run task with notifications
swarm task create \
  --name "Deploy Application" \
  --type deployment \
  --priority critical \
  --slack-notify \
  --github-issue-on-failure

# Monitor with real-time updates
swarm task monitor --slack-updates --github-status
```

## Best Practices

1. **Use Configuration Files**: Store complex configurations in files rather than command-line arguments.

2. **Environment Variables**: Use environment variables for sensitive data like tokens.

3. **Batch Operations**: Use batch files for repetitive tasks.

4. **Monitoring**: Always monitor critical operations in real-time.

5. **Logging**: Enable verbose logging for debugging and audit trails.

6. **Plugins**: Create plugins for domain-specific functionality.

7. **Output Formats**: Use JSON/YAML output for scripting and automation.

## Support

For issues, questions, or contributions:
- GitHub: https://github.com/hackingco/flow-framework/issues
- Email: support@hackingco.com
- Documentation: https://docs.hackingco.com/swarm-cli