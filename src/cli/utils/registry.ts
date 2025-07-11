import { SwarmCoordinator } from '../../swarm/coordinator';
import { EventEmitter } from 'events';

// In-memory registry for active swarms and agents
// In production, this would be backed by a database or distributed cache

interface SwarmRecord {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  coordinator: SwarmCoordinator;
  created: Date;
  maxAgents: number;
  activeAgents: number;
  metadata?: any;
}

interface AgentRecord {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline';
  swarmId?: string;
  capabilities: string[];
  created: Date;
  lastSeen: Date;
  taskCount: number;
  metrics?: any;
}

class Registry extends EventEmitter {
  private swarms: Map<string, SwarmRecord> = new Map();
  private agents: Map<string, AgentRecord> = new Map();

  /**
   * Register a new swarm
   */
  registerSwarm(coordinator: SwarmCoordinator, config: any): void {
    const record: SwarmRecord = {
      id: coordinator.id,
      name: config.name,
      type: config.type,
      status: 'active',
      coordinator,
      created: new Date(),
      maxAgents: config.maxAgents,
      activeAgents: 0,
      metadata: config.metadata
    };

    this.swarms.set(record.id, record);
    this.emit('swarm:registered', record);
  }

  /**
   * Get swarm coordinator
   */
  async getSwarmCoordinator(swarmId: string): Promise<SwarmCoordinator | undefined> {
    const record = this.swarms.get(swarmId);
    return record?.coordinator;
  }

  /**
   * List all swarms
   */
  async listSwarms(): Promise<any[]> {
    return Array.from(this.swarms.values()).map(record => ({
      id: record.id,
      name: record.name,
      type: record.type,
      status: record.status,
      created: record.created.getTime(),
      maxAgents: record.maxAgents,
      activeAgents: record.activeAgents,
      metadata: record.metadata
    }));
  }

  /**
   * Get swarm details
   */
  async getSwarmDetails(swarmId: string, options: any = {}): Promise<any> {
    const record = this.swarms.get(swarmId);
    if (!record) return null;

    const details: any = {
      id: record.id,
      name: record.name,
      type: record.type,
      status: record.status,
      strategy: record.coordinator.strategy,
      created: record.created.getTime(),
      uptime: this.getUptime(record.created),
      maxAgents: record.maxAgents,
      activeAgents: record.activeAgents,
      metadata: record.metadata
    };

    if (options.includeAgents) {
      details.agents = await this.getSwarmAgents(swarmId);
    }

    if (options.includeTasks) {
      // In a real implementation, this would fetch from task storage
      details.tasks = [];
    }

    if (options.includeMetrics) {
      details.metrics = await this.getSwarmMetrics(swarmId);
    }

    return details;
  }

  /**
   * Update swarm status
   */
  updateSwarmStatus(swarmId: string, status: 'active' | 'inactive'): void {
    const record = this.swarms.get(swarmId);
    if (record) {
      record.status = status;
      this.emit('swarm:status:changed', { swarmId, status });
    }
  }

  /**
   * Remove swarm
   */
  removeSwarm(swarmId: string): void {
    this.swarms.delete(swarmId);
    this.emit('swarm:removed', swarmId);
  }

  /**
   * Register an agent
   */
  registerAgent(agent: any): void {
    const record: AgentRecord = {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: 'online',
      swarmId: agent.swarmId,
      capabilities: agent.capabilities || [],
      created: new Date(),
      lastSeen: new Date(),
      taskCount: 0,
      metrics: {}
    };

    this.agents.set(record.id, record);
    this.emit('agent:registered', record);

    // Update swarm agent count
    if (agent.swarmId) {
      const swarm = this.swarms.get(agent.swarmId);
      if (swarm) {
        swarm.activeAgents++;
      }
    }
  }

  /**
   * Get agent
   */
  getAgent(agentId: string): AgentRecord | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List agents
   */
  async listAgents(filter: any = {}): Promise<AgentRecord[]> {
    let agents = Array.from(this.agents.values());

    if (filter.swarmId) {
      agents = agents.filter(a => a.swarmId === filter.swarmId);
    }

    if (filter.status) {
      agents = agents.filter(a => a.status === filter.status);
    }

    if (filter.type) {
      agents = agents.filter(a => a.type === filter.type);
    }

    return agents;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: 'online' | 'offline'): void {
    const record = this.agents.get(agentId);
    if (record) {
      const oldStatus = record.status;
      record.status = status;
      record.lastSeen = new Date();
      this.emit('agent:status:changed', { agentId, oldStatus, newStatus: status });

      // Update swarm agent count
      if (record.swarmId) {
        const swarm = this.swarms.get(record.swarmId);
        if (swarm) {
          if (oldStatus === 'online' && status === 'offline') {
            swarm.activeAgents--;
          } else if (oldStatus === 'offline' && status === 'online') {
            swarm.activeAgents++;
          }
        }
      }
    }
  }

  /**
   * Update agent metrics
   */
  updateAgentMetrics(agentId: string, metrics: any): void {
    const record = this.agents.get(agentId);
    if (record) {
      record.metrics = metrics;
      record.lastSeen = new Date();
    }
  }

  /**
   * Remove agent
   */
  removeAgent(agentId: string): void {
    const record = this.agents.get(agentId);
    if (record) {
      // Update swarm agent count
      if (record.swarmId && record.status === 'online') {
        const swarm = this.swarms.get(record.swarmId);
        if (swarm) {
          swarm.activeAgents--;
        }
      }

      this.agents.delete(agentId);
      this.emit('agent:removed', agentId);
    }
  }

  /**
   * Get agents for a swarm
   */
  private async getSwarmAgents(swarmId: string): Promise<any[]> {
    const agents = await this.listAgents({ swarmId });
    return agents.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      taskCount: a.taskCount,
      cpu: a.metrics?.cpu || 0,
      memory: a.metrics?.memory || 0
    }));
  }

  /**
   * Get swarm metrics
   */
  private async getSwarmMetrics(swarmId: string): Promise<any> {
    // In a real implementation, this would aggregate from metrics storage
    return {
      tasksCompleted: 0,
      tasksFailed: 0,
      avgTaskDuration: 0,
      successRate: 100,
      throughput: 0
    };
  }

  /**
   * Calculate uptime
   */
  private getUptime(created: Date): string {
    const now = new Date();
    const diff = now.getTime() - created.getTime();
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

// Singleton instance
const registry = new Registry();

// Export registry functions
export async function getSwarmCoordinator(swarmId: string): Promise<SwarmCoordinator | undefined> {
  return registry.getSwarmCoordinator(swarmId);
}

export async function listSwarms(): Promise<any[]> {
  return registry.listSwarms();
}

export async function getSwarmDetails(swarmId: string, options?: any): Promise<any> {
  return registry.getSwarmDetails(swarmId, options);
}

export async function listAgents(filter?: any): Promise<any[]> {
  return registry.listAgents(filter);
}

export async function getAgent(agentId: string): Promise<any> {
  return registry.getAgent(agentId);
}

export async function getAgentDetails(agentId: string, options?: any): Promise<any> {
  const agent = registry.getAgent(agentId);
  if (!agent) return null;

  const details: any = { ...agent };

  if (options?.includeTasks) {
    // In a real implementation, fetch from task storage
    details.tasks = [];
  }

  if (options?.includeMetrics) {
    details.metrics = agent.metrics || {};
  }

  if (options?.includeLogs) {
    // In a real implementation, fetch from log storage
    details.logs = [];
  }

  return details;
}

export async function updateAgent(agentId: string, updates: any): Promise<void> {
  const agent = registry.getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // Apply updates
  if (updates.name) agent.name = updates.name;
  if (updates.capabilities) agent.capabilities = updates.capabilities;

  // Emit update event
  registry.emit('agent:updated', { agentId, updates });
}

export async function deleteAgent(agentId: string): Promise<void> {
  registry.removeAgent(agentId);
}

// Export the registry instance for direct access if needed
export { registry };