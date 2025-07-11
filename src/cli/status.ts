import { registry } from './utils/registry';
import { EventEmitter } from 'events';
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import chalk from 'chalk';

export interface SystemStatus {
  swarms: {
    total: number;
    active: number;
    inactive: number;
  };
  agents: {
    total: number;
    online: number;
    offline: number;
  };
  tasks: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  performance: {
    avgTaskDuration: number;
    successRate: number;
    throughput: number;
  };
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

/**
 * Get overall system status
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const swarms = await registry.listSwarms();
  const agents = await registry.listAgents();
  
  // Calculate swarm stats
  const activeSwarms = swarms.filter(s => s.status === 'active').length;
  const inactiveSwarms = swarms.filter(s => s.status === 'inactive').length;
  
  // Calculate agent stats
  const onlineAgents = agents.filter(a => a.status === 'online').length;
  const offlineAgents = agents.filter(a => a.status === 'offline').length;
  
  // Task stats (mock data for now - would come from task storage)
  const taskStats = {
    total: 150,
    pending: 20,
    running: 15,
    completed: 100,
    failed: 15
  };
  
  // Performance metrics (mock data)
  const performance = {
    avgTaskDuration: 2500,
    successRate: 87,
    throughput: 25
  };
  
  // Resource usage (mock data)
  const resources = {
    cpu: 45,
    memory: 62,
    disk: 38
  };
  
  return {
    swarms: {
      total: swarms.length,
      active: activeSwarms,
      inactive: inactiveSwarms
    },
    agents: {
      total: agents.length,
      online: onlineAgents,
      offline: offlineAgents
    },
    tasks: taskStats,
    performance,
    resources
  };
}

/**
 * Watch status in real-time
 */
export async function watchStatus(): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Swarm Status Monitor'
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  // Create dashboard widgets
  const swarmGauge = grid.set(0, 0, 3, 4, contrib.gauge, {
    label: 'Active Swarms',
    percent: [0]
  });

  const agentGauge = grid.set(0, 4, 3, 4, contrib.gauge, {
    label: 'Online Agents',
    percent: [0]
  });

  const taskGauge = grid.set(0, 8, 3, 4, contrib.gauge, {
    label: 'Task Success Rate',
    percent: [0]
  });

  const taskChart = grid.set(3, 0, 4, 8, contrib.bar, {
    label: 'Task Status',
    barWidth: 12,
    barSpacing: 6,
    xOffset: 0,
    maxHeight: 100
  });

  const performanceChart = grid.set(3, 8, 4, 4, contrib.line, {
    label: 'Performance',
    showLegend: true,
    legend: { width: 12 }
  });

  const resourceTable = grid.set(7, 0, 3, 6, contrib.table, {
    label: 'Resource Usage',
    columnSpacing: 3,
    columnWidth: [20, 10, 10]
  });

  const activityLog = grid.set(7, 6, 3, 6, contrib.log, {
    label: 'Activity',
    tags: true
  });

  const systemInfo = grid.set(10, 0, 2, 12, blessed.box, {
    label: 'System Information',
    content: '',
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });

  // Performance data tracking
  const perfData = {
    throughput: {
      x: [],
      y: []
    },
    latency: {
      x: [],
      y: []
    }
  };

  // Update function
  const updateDashboard = async () => {
    try {
      const status = await getSystemStatus();

      // Update gauges
      swarmGauge.setPercent((status.swarms.active / Math.max(status.swarms.total, 1)) * 100);
      agentGauge.setPercent((status.agents.online / Math.max(status.agents.total, 1)) * 100);
      taskGauge.setPercent(status.performance.successRate);

      // Update task chart
      taskChart.setData({
        titles: ['Pending', 'Running', 'Completed', 'Failed'],
        data: [
          status.tasks.pending,
          status.tasks.running,
          status.tasks.completed,
          status.tasks.failed
        ]
      });

      // Update performance chart
      const now = new Date();
      const timeLabel = now.toLocaleTimeString();
      
      perfData.throughput.x.push(timeLabel);
      perfData.throughput.y.push(status.performance.throughput);
      
      perfData.latency.x.push(timeLabel);
      perfData.latency.y.push(status.performance.avgTaskDuration / 1000);

      // Keep only last 20 data points
      if (perfData.throughput.x.length > 20) {
        perfData.throughput.x.shift();
        perfData.throughput.y.shift();
        perfData.latency.x.shift();
        perfData.latency.y.shift();
      }

      performanceChart.setData([
        {
          title: 'Throughput',
          x: perfData.throughput.x,
          y: perfData.throughput.y,
          style: { line: 'yellow' }
        },
        {
          title: 'Latency (s)',
          x: perfData.latency.x,
          y: perfData.latency.y,
          style: { line: 'red' }
        }
      ]);

      // Update resource table
      resourceTable.setData({
        headers: ['Resource', 'Usage', 'Status'],
        data: [
          ['CPU', `${status.resources.cpu}%`, getResourceStatus(status.resources.cpu)],
          ['Memory', `${status.resources.memory}%`, getResourceStatus(status.resources.memory)],
          ['Disk', `${status.resources.disk}%`, getResourceStatus(status.resources.disk)]
        ]
      });

      // Update system info
      systemInfo.setContent(
        `Swarms: ${status.swarms.active}/${status.swarms.total} active | ` +
        `Agents: ${status.agents.online}/${status.agents.total} online | ` +
        `Tasks: ${status.tasks.running} running, ${status.tasks.pending} pending | ` +
        `Throughput: ${status.performance.throughput} tasks/min | ` +
        `Last Update: ${timeLabel}`
      );

      // Add log entry
      activityLog.log(`{green-fg}Updated at ${timeLabel}{/green-fg}`);

      screen.render();
    } catch (error) {
      activityLog.log(`{red-fg}Error: ${error.message}{/red-fg}`);
    }
  };

  // Set up event listeners
  registry.on('swarm:registered', (swarm) => {
    activityLog.log(`{green-fg}Swarm registered: ${swarm.name}{/green-fg}`);
  });

  registry.on('agent:status:changed', ({ agentId, newStatus }) => {
    const color = newStatus === 'online' ? 'green' : 'yellow';
    activityLog.log(`{${color}-fg}Agent ${agentId.substring(0, 8)} is now ${newStatus}{/${color}-fg}`);
  });

  // Key bindings
  screen.key(['escape', 'q', 'C-c'], () => {
    process.exit(0);
  });

  screen.key(['r'], async () => {
    activityLog.log('{blue-fg}Manual refresh triggered{/blue-fg}');
    await updateDashboard();
  });

  // Initial update
  await updateDashboard();

  // Set up auto-refresh
  setInterval(updateDashboard, 1000);

  // Render
  screen.render();
}

/**
 * Get resource status color
 */
function getResourceStatus(usage: number): string {
  if (usage < 50) return 'Normal';
  if (usage < 80) return 'Warning';
  return 'Critical';
}

/**
 * Create status report
 */
export async function createStatusReport(): Promise<string> {
  const status = await getSystemStatus();
  
  const report = `
# Swarm System Status Report
Generated at: ${new Date().toISOString()}

## Swarms
- Total: ${status.swarms.total}
- Active: ${status.swarms.active}
- Inactive: ${status.swarms.inactive}

## Agents
- Total: ${status.agents.total}
- Online: ${status.agents.online}
- Offline: ${status.agents.offline}

## Tasks
- Total: ${status.tasks.total}
- Pending: ${status.tasks.pending}
- Running: ${status.tasks.running}
- Completed: ${status.tasks.completed}
- Failed: ${status.tasks.failed}

## Performance
- Average Task Duration: ${status.performance.avgTaskDuration}ms
- Success Rate: ${status.performance.successRate}%
- Throughput: ${status.performance.throughput} tasks/min

## Resources
- CPU Usage: ${status.resources.cpu}%
- Memory Usage: ${status.resources.memory}%
- Disk Usage: ${status.resources.disk}%
`;

  return report.trim();
}