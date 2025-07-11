/**
 * HackingCo Agent Manager
 * 
 * Manages the lifecycle of swarm agents including creation, monitoring,
 * scaling, and termination with enterprise-grade reliability.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IAgent,
  AgentConfig,
  AgentState,
  AgentType,
  AgentReport,
  Task,
  TaskResult,
  TaskStatus,
  ResourceUsage,
  ResourceConfig,
  MonitoringConfig,
  Priority
} from '../swarm/types';

interface AgentManagerConfig {
  maxAgents: number;
  resourceLimits: ResourceConfig;
  monitoring: MonitoringConfig;
  healthCheckInterval?: number;
  restartPolicy?: RestartPolicy;
}

interface RestartPolicy {
  maxRestarts: number;
  restartDelay: number;
  backoffMultiplier: number;
}

interface AgentInstance extends IAgent {
  config: AgentConfig;
  startTime: Date;
  restartCount: number;
  lastHealthCheck?: Date;
  metrics: AgentMetrics;
  currentTask?: Task;
}

interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalExecutionTime: number;
  avgExecutionTime: number;
  resourceUsage: ResourceUsage;
  errors: Error[];
  lastError?: Error;
}

class Agent extends EventEmitter implements IAgent {
  readonly id: string;
  readonly type: AgentType;
  readonly capabilities: string[];
  private _state: AgentState;
  private config: AgentConfig;
  private metrics: AgentMetrics;
  private currentTask?: Task;
  
  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.type = config.type;
    this.capabilities = config.capabilities;
    this.config = config;
    this._state = AgentState.CREATED;
    
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalExecutionTime: 0,
      avgExecutionTime: 0,
      resourceUsage: {
        cpu: 0,
        memory: 0
      },
      errors: []
    };
  }
  
  get state(): AgentState {
    return this._state;
  }
  
  async initialize(): Promise<void> {
    this._state = AgentState.INITIALIZING;
    
    try {
      // Simulate initialization
      await this.delay(100 + Math.random() * 200);
      
      this._state = AgentState.READY;
      this.emit('ready');
    } catch (error) {
      this._state = AgentState.ERROR;
      this.metrics.lastError = error as Error;
      throw error;
    }
  }
  
  async start(): Promise<void> {
    if (this._state !== AgentState.READY) {
      throw new Error(`Cannot start agent in state: ${this._state}`);
    }
    
    this._state = AgentState.IDLE;
    this.emit('started');
  }
  
  async stop(): Promise<void> {
    this._state = AgentState.TERMINATING;
    
    // Wait for current task to complete
    if (this.currentTask) {
      await this.waitForTaskCompletion();
    }
    
    this._state = AgentState.TERMINATED;
    this.emit('stopped');
  }
  
  canExecute(task: Task): boolean {
    // Check if agent is available
    if (this._state !== AgentState.IDLE) {
      return false;
    }
    
    // Check capabilities
    if (task.requirements?.capabilities) {
      for (const required of task.requirements.capabilities) {
        if (!this.capabilities.includes(required)) {
          return false;
        }
      }
    }
    
    // Check resource requirements
    if (task.requirements?.resources) {
      const required = task.requirements.resources;
      const available = this.config.resources;
      
      if (required.cpu > available.cpu || required.memory > available.memory) {
        return false;
      }
    }
    
    // Check type compatibility
    const typeCompatibility = {
      [TaskType.ANALYZE]: [AgentType.RESEARCH, AgentType.ANALYSIS],
      [TaskType.PROCESS]: [AgentType.EXECUTION, AgentType.SPECIALIST],
      [TaskType.VALIDATE]: [AgentType.VALIDATION, AgentType.MONITORING],
      [TaskType.AGGREGATE]: [AgentType.COORDINATION, AgentType.ANALYSIS]
    };
    
    const compatibleTypes = typeCompatibility[task.type];
    if (compatibleTypes && !compatibleTypes.includes(this.type)) {
      return false;
    }
    
    return true;
  }
  
  async execute(task: Task): Promise<TaskResult> {
    if (!this.canExecute(task)) {
      throw new Error('Agent cannot execute this task');
    }
    
    this._state = AgentState.BUSY;
    this.currentTask = task;
    const startTime = Date.now();
    
    try {
      this.emit('task:started', task);
      
      // Simulate task execution
      const result = await this.performTask(task);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Update metrics
      this.metrics.tasksCompleted++;
      this.metrics.totalExecutionTime += duration;
      this.metrics.avgExecutionTime = 
        this.metrics.totalExecutionTime / this.metrics.tasksCompleted;
      
      const taskResult: TaskResult = {
        taskId: task.id,
        agentId: this.id,
        status: TaskStatus.COMPLETED,
        output: result,
        metrics: {
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          duration,
          retries: task.retryCount || 0,
          resourceUsage: this.getCurrentResourceUsage()
        },
        timestamp: new Date()
      };
      
      this._state = AgentState.IDLE;
      this.currentTask = undefined;
      this.emit('task:completed', taskResult);
      
      return taskResult;
      
    } catch (error) {
      this.metrics.tasksFailed++;
      this.metrics.lastError = error as Error;
      this.metrics.errors.push(error as Error);
      
      const taskResult: TaskResult = {
        taskId: task.id,
        agentId: this.id,
        status: TaskStatus.FAILED,
        error: error as Error,
        metrics: {
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
          retries: task.retryCount || 0,
          resourceUsage: this.getCurrentResourceUsage()
        },
        timestamp: new Date()
      };
      
      this._state = AgentState.IDLE;
      this.currentTask = undefined;
      this.emit('task:failed', taskResult);
      
      return taskResult;
    }
  }
  
  async getMetrics(): Promise<AgentReport> {
    return {
      agentId: this.id,
      type: this.type,
      state: this._state,
      tasksCompleted: this.metrics.tasksCompleted,
      tasksFailed: this.metrics.tasksFailed,
      avgTaskDuration: this.metrics.avgExecutionTime,
      resourceUsage: this.metrics.resourceUsage,
      errors: this.metrics.errors
    };
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // Check if agent is responsive
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );
      
      const check = this.performHealthCheck();
      
      await Promise.race([check, timeout]);
      
      return true;
    } catch (error) {
      this.metrics.lastError = error as Error;
      return false;
    }
  }
  
  private async performTask(task: Task): Promise<any> {
    // Simulate different task types
    const duration = Math.random() * 2000 + 500;
    await this.delay(duration);
    
    // Simulate resource usage
    this.metrics.resourceUsage = {
      cpu: Math.random() * 100,
      memory: Math.random() * this.config.resources.memory
    };
    
    // Simulate occasional failures
    if (Math.random() < 0.05) {
      throw new Error(`Task execution failed: ${task.name}`);
    }
    
    return {
      result: `Task ${task.name} completed by ${this.id}`,
      data: task.input,
      processed: true
    };
  }
  
  private async performHealthCheck(): Promise<void> {
    // Simulate health check
    await this.delay(100);
    
    if (this._state === AgentState.ERROR) {
      throw new Error('Agent in error state');
    }
  }
  
  private getCurrentResourceUsage(): ResourceUsage {
    return {
      cpu: this.metrics.resourceUsage.cpu,
      memory: this.metrics.resourceUsage.memory
    };
  }
  
  private async waitForTaskCompletion(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.currentTask && Date.now() - startTime < maxWait) {
      await this.delay(100);
    }
    
    if (this.currentTask) {
      // Force terminate task
      this.emit('task:terminated', this.currentTask.id);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class AgentManager extends EventEmitter {
  private config: AgentManagerConfig;
  private agents: Map<string, AgentInstance>;
  private healthCheckTimer?: NodeJS.Timer;
  private resourceMonitor?: NodeJS.Timer;
  
  constructor(config: AgentManagerConfig) {
    super();
    this.config = {
      healthCheckInterval: 10000,
      restartPolicy: {
        maxRestarts: 3,
        restartDelay: 1000,
        backoffMultiplier: 2
      },
      ...config
    };
    this.agents = new Map();
  }
  
  /**
   * Start the agent manager
   */
  async start(): Promise<void> {
    // Start health check timer
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
    
    // Start resource monitoring
    this.resourceMonitor = setInterval(() => {
      this.monitorResources();
    }, this.config.monitoring.metricsInterval);
    
    this.emit('started');
  }
  
  /**
   * Stop the agent manager
   */
  async stop(): Promise<void> {
    // Stop timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }
    
    // Stop all agents
    await this.stopAll();
    
    this.emit('stopped');
  }
  
  /**
   * Create agents from configurations
   */
  async createAgents(configs: AgentConfig[]): Promise<IAgent[]> {
    const created: IAgent[] = [];
    
    for (const config of configs) {
      const agent = await this.createAgent(config);
      created.push(agent);
    }
    
    return created;
  }
  
  /**
   * Create a single agent
   */
  async createAgent(config: AgentConfig): Promise<IAgent> {
    // Validate resources don't exceed limits
    this.validateResources(config.resources);
    
    const agent = new Agent(config);
    
    const instance: AgentInstance = Object.assign(agent, {
      config,
      startTime: new Date(),
      restartCount: 0,
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalExecutionTime: 0,
        avgExecutionTime: 0,
        resourceUsage: { cpu: 0, memory: 0 },
        errors: []
      }
    });
    
    this.agents.set(agent.id, instance);
    
    // Initialize and start agent
    await agent.initialize();
    await agent.start();
    
    this.emit('agent:spawned', agent);
    
    return agent;
  }
  
  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): IAgent | undefined {
    return this.agents.get(agentId);
  }
  
  /**
   * Get all agents
   */
  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Get active agent count
   */
  async getActiveCount(): Promise<number> {
    return Array.from(this.agents.values())
      .filter(a => a.state !== AgentState.TERMINATED).length;
  }
  
  /**
   * Pause all agents
   */
  async pauseAll(): Promise<void> {
    const agents = Array.from(this.agents.values());
    
    for (const agent of agents) {
      if (agent.state === AgentState.IDLE) {
        // Implement pause logic
        this.emit('agent:paused', agent.id);
      }
    }
  }
  
  /**
   * Resume all agents
   */
  async resumeAll(): Promise<void> {
    const agents = Array.from(this.agents.values());
    
    for (const agent of agents) {
      // Implement resume logic
      this.emit('agent:resumed', agent.id);
    }
  }
  
  /**
   * Stop all agents
   */
  async stopAll(): Promise<void> {
    const agents = Array.from(this.agents.values());
    
    await Promise.all(
      agents.map(agent => this.stopAgent(agent.id))
    );
  }
  
  /**
   * Stop a specific agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    await agent.stop();
    this.agents.delete(agentId);
    
    this.emit('agent:terminated', agentId);
  }
  
  /**
   * Scale up agents
   */
  async scaleUp(count: number): Promise<IAgent[]> {
    const currentCount = await this.getActiveCount();
    
    if (currentCount + count > this.config.maxAgents) {
      throw new Error(`Cannot exceed max agents limit: ${this.config.maxAgents}`);
    }
    
    const newAgents: IAgent[] = [];
    
    for (let i = 0; i < count; i++) {
      const config: AgentConfig = {
        id: `agent-${uuidv4()}`,
        type: this.selectAgentType(),
        name: `Agent-${currentCount + i + 1}`,
        capabilities: this.getDefaultCapabilities(),
        resources: this.getDefaultResources(),
        priority: Priority.MEDIUM
      };
      
      const agent = await this.createAgent(config);
      newAgents.push(agent);
    }
    
    this.emit('scaled:up', { count, newTotal: await this.getActiveCount() });
    
    return newAgents;
  }
  
  /**
   * Scale down agents
   */
  async scaleDown(count: number): Promise<string[]> {
    const agents = Array.from(this.agents.values())
      .filter(a => a.state === AgentState.IDLE)
      .slice(0, count);
    
    const removed: string[] = [];
    
    for (const agent of agents) {
      await this.stopAgent(agent.id);
      removed.push(agent.id);
    }
    
    this.emit('scaled:down', { count: removed.length, newTotal: await this.getActiveCount() });
    
    return removed;
  }
  
  /**
   * Get agent reports
   */
  async getAgentReports(): Promise<AgentReport[]> {
    const reports: AgentReport[] = [];
    
    for (const agent of this.agents.values()) {
      const report = await agent.getMetrics();
      reports.push(report);
    }
    
    return reports;
  }
  
  /**
   * Get resource metrics
   */
  async getResourceMetrics(): Promise<ResourceUsage> {
    let totalCpu = 0;
    let totalMemory = 0;
    
    for (const agent of this.agents.values()) {
      const metrics = await agent.getMetrics();
      totalCpu += metrics.resourceUsage.cpu;
      totalMemory += metrics.resourceUsage.memory;
    }
    
    return {
      cpu: totalCpu,
      memory: totalMemory
    };
  }
  
  /**
   * Serialize agent manager state
   */
  async serialize(): Promise<any> {
    const agents = Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      config: agent.config,
      state: agent.state,
      metrics: agent.metrics,
      restartCount: agent.restartCount
    }));
    
    return {
      agents,
      timestamp: new Date()
    };
  }
  
  /**
   * Restore agent manager state
   */
  async restore(data: any): Promise<void> {
    // Clear existing agents
    await this.stopAll();
    
    // Recreate agents
    for (const agentData of data.agents) {
      const agent = await this.createAgent(agentData.config);
      
      // Restore metrics
      const instance = this.agents.get(agent.id) as AgentInstance;
      if (instance) {
        instance.metrics = agentData.metrics;
        instance.restartCount = agentData.restartCount;
      }
    }
  }
  
  // Private helper methods
  
  private async performHealthChecks(): Promise<void> {
    for (const [id, agent] of this.agents) {
      try {
        const healthy = await agent.healthCheck();
        
        if (!healthy && agent.state !== AgentState.ERROR) {
          this.emit('agent:unhealthy', id);
          await this.handleUnhealthyAgent(agent);
        }
        
        agent.lastHealthCheck = new Date();
      } catch (error) {
        this.emit('agent:health-check-failed', { id, error });
      }
    }
  }
  
  private async handleUnhealthyAgent(agent: AgentInstance): Promise<void> {
    // Check restart policy
    if (agent.restartCount >= this.config.restartPolicy!.maxRestarts) {
      this.emit('agent:failed', agent.id, new Error('Max restarts exceeded'));
      await this.stopAgent(agent.id);
      return;
    }
    
    // Calculate restart delay
    const delay = this.config.restartPolicy!.restartDelay * 
      Math.pow(this.config.restartPolicy!.backoffMultiplier, agent.restartCount);
    
    // Schedule restart
    setTimeout(async () => {
      try {
        await this.restartAgent(agent);
      } catch (error) {
        this.emit('agent:restart-failed', { id: agent.id, error });
      }
    }, delay);
  }
  
  private async restartAgent(agent: AgentInstance): Promise<void> {
    agent.restartCount++;
    
    // Stop current instance
    await agent.stop();
    
    // Create new instance with same config
    const newAgent = await this.createAgent(agent.config);
    
    // Preserve restart count
    const newInstance = this.agents.get(newAgent.id) as AgentInstance;
    if (newInstance) {
      newInstance.restartCount = agent.restartCount;
    }
    
    this.emit('agent:restarted', { oldId: agent.id, newId: newAgent.id });
  }
  
  private async monitorResources(): Promise<void> {
    const usage = await this.getResourceMetrics();
    
    // Check against limits
    if (usage.cpu > this.config.resourceLimits.maxConcurrency * 100) {
      this.emit('resource:cpu-limit', usage.cpu);
    }
    
    if (usage.memory > this.config.resourceLimits.memoryLimit) {
      this.emit('resource:memory-limit', usage.memory);
    }
  }
  
  private validateResources(resources: ResourceAllocation): void {
    if (resources.cpu > this.config.resourceLimits.cpuLimit) {
      throw new Error(`CPU allocation exceeds limit: ${this.config.resourceLimits.cpuLimit}`);
    }
    
    if (resources.memory > this.config.resourceLimits.memoryLimit) {
      throw new Error(`Memory allocation exceeds limit: ${this.config.resourceLimits.memoryLimit}`);
    }
  }
  
  private selectAgentType(): AgentType {
    // Distribute agent types evenly
    const types = Object.values(AgentType);
    const currentDistribution = new Map<AgentType, number>();
    
    for (const type of types) {
      currentDistribution.set(type, 0);
    }
    
    for (const agent of this.agents.values()) {
      currentDistribution.set(agent.type, (currentDistribution.get(agent.type) || 0) + 1);
    }
    
    // Find type with lowest count
    let minType = types[0];
    let minCount = Infinity;
    
    for (const [type, count] of currentDistribution) {
      if (count < minCount) {
        minCount = count;
        minType = type;
      }
    }
    
    return minType;
  }
  
  private getDefaultCapabilities(): string[] {
    return ['general', 'processing', 'analysis', 'validation'];
  }
  
  private getDefaultResources(): ResourceAllocation {
    return {
      cpu: 0.5,
      memory: 512,
      priority: 5
    };
  }
}

// Re-export types
export { TaskType } from '../swarm/types';