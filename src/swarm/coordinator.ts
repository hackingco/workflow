/**
 * HackingCo Swarm Coordinator
 * 
 * Central orchestration engine for swarm operations, managing agent lifecycle,
 * task distribution, and system-wide coordination with enterprise-grade features.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  SwarmConfig,
  SwarmState,
  SwarmEvent,
  SwarmEventType,
  SwarmReport,
  SwarmMetrics,
  ISwarmCoordinator,
  IAgent,
  IStrategy,
  Task,
  TaskStatus,
  TaskResult,
  AgentState,
  Priority,
  ScaleAction,
  ResourceUsage,
  MemoryStore
} from './types';
import { AutoStrategy } from './strategies/auto';
import { AgentManager } from '../agents/agent-manager';
import { TaskOrchestrator } from '../task/task-orchestrator';
import { SwarmMonitor } from '../monitoring/swarm-monitor';
import { HiveMind } from '../hive-mind';
import { Langfuse } from 'langfuse';

export class SwarmCoordinator extends EventEmitter implements ISwarmCoordinator {
  private _id: string;
  private _state: SwarmState;
  private config: SwarmConfig;
  private strategy: IStrategy;
  private agentManager: AgentManager;
  private taskOrchestrator: TaskOrchestrator;
  private monitor: SwarmMonitor;
  private hiveMind: HiveMind;
  private memory: MemoryStore;
  private langfuse?: Langfuse;
  
  private startTime?: Date;
  private endTime?: Date;
  private events: SwarmEvent[] = [];
  private checkpoints: Map<string, any> = new Map();
  
  constructor() {
    super();
    this._id = `swarm-${Date.now()}-${uuidv4().substring(0, 8)}`;
    this._state = SwarmState.INITIALIZING;
  }
  
  get id(): string {
    return this._id;
  }
  
  get state(): SwarmState {
    return this._state;
  }
  
  /**
   * Initialize the swarm coordinator
   */
  async initialize(config: SwarmConfig): Promise<void> {
    try {
      this.config = {
        ...config,
        id: config.id || this._id
      };
      
      // Initialize Langfuse if tracing is enabled
      if (this.config.monitoring.tracing.enabled) {
        this.langfuse = new Langfuse({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
          secretKey: process.env.LANGFUSE_SECRET_KEY || '',
          baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com'
        });
        
        await this.trace('swarm_initialized', {
          config: this.config
        });
      }
      
      // Initialize memory store
      this.memory = await this.createMemoryStore();
      
      // Initialize strategy
      this.strategy = await this.createStrategy();
      
      // Initialize agent manager
      this.agentManager = new AgentManager({
        maxAgents: this.config.scaling.maxAgents,
        resourceLimits: this.config.resources,
        monitoring: this.config.monitoring
      });
      
      // Initialize task orchestrator
      this.taskOrchestrator = new TaskOrchestrator({
        strategy: this.strategy,
        retryPolicy: this.config.retryPolicy,
        timeout: this.config.timeout
      });
      
      // Initialize monitor
      this.monitor = new SwarmMonitor({
        swarmId: this._id,
        config: this.config.monitoring,
        langfuse: this.langfuse
      });
      
      // Initialize hive mind
      this.hiveMind = new HiveMind({
        swarmId: this._id,
        memory: this.memory,
        consensusThreshold: 0.66
      });
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Create initial agents
      await this.createInitialAgents();
      
      this._state = SwarmState.READY;
      this.recordEvent(SwarmEventType.SWARM_STARTED, {
        config: this.config
      });
      
    } catch (error) {
      this._state = SwarmState.FAILED;
      this.recordEvent(SwarmEventType.SWARM_FAILED, { error: error.message });
      throw error;
    }
  }
  
  /**
   * Start swarm execution
   */
  async start(): Promise<void> {
    if (this._state !== SwarmState.READY) {
      throw new Error(`Cannot start swarm in state: ${this._state}`);
    }
    
    this.startTime = new Date();
    this._state = SwarmState.RUNNING;
    
    // Start all components
    await Promise.all([
      this.agentManager.start(),
      this.taskOrchestrator.start(),
      this.monitor.start(),
      this.hiveMind.activate()
    ]);
    
    // Start auto-scaling if enabled
    if (this.config.scaling.enabled) {
      this.startAutoScaling();
    }
    
    // Start checkpoint timer if persistence is enabled
    if (this.config.persistence.enabled) {
      this.startCheckpointing();
    }
    
    await this.trace('swarm_started', {
      agentCount: await this.agentManager.getActiveCount()
    });
  }
  
  /**
   * Pause swarm execution
   */
  async pause(): Promise<void> {
    if (this._state !== SwarmState.RUNNING) {
      throw new Error(`Cannot pause swarm in state: ${this._state}`);
    }
    
    this._state = SwarmState.PAUSED;
    
    await Promise.all([
      this.taskOrchestrator.pause(),
      this.agentManager.pauseAll()
    ]);
    
    this.recordEvent(SwarmEventType.CUSTOM, {
      type: 'swarm_paused'
    });
  }
  
  /**
   * Resume swarm execution
   */
  async resume(): Promise<void> {
    if (this._state !== SwarmState.PAUSED) {
      throw new Error(`Cannot resume swarm in state: ${this._state}`);
    }
    
    this._state = SwarmState.RUNNING;
    
    await Promise.all([
      this.taskOrchestrator.resume(),
      this.agentManager.resumeAll()
    ]);
    
    this.recordEvent(SwarmEventType.CUSTOM, {
      type: 'swarm_resumed'
    });
  }
  
  /**
   * Stop swarm execution
   */
  async stop(): Promise<void> {
    if (this._state === SwarmState.TERMINATED) {
      return;
    }
    
    this._state = SwarmState.COMPLETING;
    this.endTime = new Date();
    
    // Stop all components
    await Promise.all([
      this.taskOrchestrator.stop(),
      this.agentManager.stopAll(),
      this.monitor.stop(),
      this.hiveMind.deactivate()
    ]);
    
    // Generate final report
    const report = await this.getReport();
    
    // Save final checkpoint
    if (this.config.persistence.enabled) {
      await this.checkpoint();
    }
    
    // Flush traces
    if (this.langfuse) {
      await this.langfuse.flush();
    }
    
    this._state = SwarmState.COMPLETED;
    this.recordEvent(SwarmEventType.SWARM_COMPLETED, { report });
    
    this.emit('completed', report);
  }
  
  /**
   * Submit a task to the swarm
   */
  async submitTask(task: Task): Promise<string> {
    if (this._state !== SwarmState.RUNNING) {
      throw new Error(`Cannot submit task in state: ${this._state}`);
    }
    
    // Validate task
    this.validateTask(task);
    
    // Generate task ID if not provided
    if (!task.id) {
      task.id = `task-${uuidv4()}`;
    }
    
    // Submit to orchestrator
    await this.taskOrchestrator.submitTask(task);
    
    // Record event
    this.recordEvent(SwarmEventType.TASK_ASSIGNED, {
      taskId: task.id,
      taskName: task.name
    });
    
    await this.trace('task_submitted', {
      task: task
    });
    
    return task.id;
  }
  
  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    return this.taskOrchestrator.getTaskStatus(taskId);
  }
  
  /**
   * Get task result
   */
  async getTaskResult(taskId: string): Promise<TaskResult | null> {
    return this.taskOrchestrator.getTaskResult(taskId);
  }
  
  /**
   * Scale up agents
   */
  async scaleUp(count: number): Promise<void> {
    if (this._state !== SwarmState.RUNNING) {
      throw new Error(`Cannot scale in state: ${this._state}`);
    }
    
    this._state = SwarmState.SCALING;
    
    try {
      const newAgents = await this.agentManager.scaleUp(count);
      
      // Register new agents with components
      for (const agent of newAgents) {
        await this.taskOrchestrator.registerAgent(agent);
        await this.hiveMind.registerAgent(agent.id);
      }
      
      this.recordEvent(SwarmEventType.SCALE_UP, {
        count,
        newTotal: await this.agentManager.getActiveCount()
      });
      
      await this.trace('scaled_up', {
        count,
        agentIds: newAgents.map(a => a.id)
      });
      
    } finally {
      this._state = SwarmState.RUNNING;
    }
  }
  
  /**
   * Scale down agents
   */
  async scaleDown(count: number): Promise<void> {
    if (this._state !== SwarmState.RUNNING) {
      throw new Error(`Cannot scale in state: ${this._state}`);
    }
    
    this._state = SwarmState.SCALING;
    
    try {
      const removedAgents = await this.agentManager.scaleDown(count);
      
      // Unregister agents from components
      for (const agentId of removedAgents) {
        await this.taskOrchestrator.unregisterAgent(agentId);
        await this.hiveMind.unregisterAgent(agentId);
      }
      
      this.recordEvent(SwarmEventType.SCALE_DOWN, {
        count,
        newTotal: await this.agentManager.getActiveCount()
      });
      
      await this.trace('scaled_down', {
        count,
        agentIds: removedAgents
      });
      
    } finally {
      this._state = SwarmState.RUNNING;
    }
  }
  
  /**
   * Get swarm report
   */
  async getReport(): Promise<SwarmReport> {
    const [agentReports, taskReports, metrics] = await Promise.all([
      this.agentManager.getAgentReports(),
      this.taskOrchestrator.getTaskReports(),
      this.getMetrics()
    ]);
    
    return {
      swarmId: this._id,
      name: this.config.name,
      state: this._state,
      startTime: this.startTime!,
      endTime: this.endTime,
      duration: this.endTime ? 
        this.endTime.getTime() - this.startTime!.getTime() : 
        Date.now() - this.startTime!.getTime(),
      agents: agentReports,
      tasks: taskReports,
      metrics,
      events: this.events,
      errors: this.getErrors()
    };
  }
  
  /**
   * Get swarm metrics
   */
  async getMetrics(): Promise<SwarmMetrics> {
    const [taskMetrics, resourceMetrics, monitorMetrics] = await Promise.all([
      this.taskOrchestrator.getMetrics(),
      this.agentManager.getResourceMetrics(),
      this.monitor.getMetrics()
    ]);
    
    return {
      totalTasks: taskMetrics.total,
      completedTasks: taskMetrics.completed,
      failedTasks: taskMetrics.failed,
      successRate: taskMetrics.total > 0 ? 
        (taskMetrics.completed / taskMetrics.total) * 100 : 0,
      avgTaskDuration: taskMetrics.avgDuration,
      totalDuration: this.endTime ? 
        this.endTime.getTime() - this.startTime!.getTime() : 
        Date.now() - this.startTime!.getTime(),
      peakConcurrency: monitorMetrics.peakConcurrency,
      totalResourceUsage: resourceMetrics,
      customMetrics: {
        ...taskMetrics.custom,
        ...monitorMetrics.custom
      }
    };
  }
  
  /**
   * Create checkpoint
   */
  async checkpoint(): Promise<void> {
    const checkpointId = `checkpoint-${Date.now()}`;
    
    const checkpoint = {
      id: checkpointId,
      swarmId: this._id,
      state: this._state,
      timestamp: new Date(),
      agents: await this.agentManager.serialize(),
      tasks: await this.taskOrchestrator.serialize(),
      memory: await this.memory.keys(),
      metrics: await this.getMetrics()
    };
    
    // Save checkpoint
    await this.saveCheckpoint(checkpointId, checkpoint);
    
    this.checkpoints.set(checkpointId, checkpoint);
    this.recordEvent(SwarmEventType.CHECKPOINT_SAVED, {
      checkpointId
    });
    
    await this.trace('checkpoint_created', {
      checkpointId
    });
  }
  
  /**
   * Restore from checkpoint
   */
  async restore(checkpointId: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    
    // Restore state
    this._state = checkpoint.state;
    
    // Restore components
    await Promise.all([
      this.agentManager.restore(checkpoint.agents),
      this.taskOrchestrator.restore(checkpoint.tasks)
    ]);
    
    await this.trace('checkpoint_restored', {
      checkpointId
    });
  }
  
  // Private helper methods
  
  private async createMemoryStore(): Promise<MemoryStore> {
    // Simple in-memory implementation
    const store = new Map<string, { value: any; expiry?: number }>();
    
    return {
      async set(key: string, value: any, ttl?: number): Promise<void> {
        const expiry = ttl ? Date.now() + ttl : undefined;
        store.set(key, { value, expiry });
      },
      
      async get(key: string): Promise<any> {
        const item = store.get(key);
        if (!item) return null;
        
        if (item.expiry && Date.now() > item.expiry) {
          store.delete(key);
          return null;
        }
        
        return item.value;
      },
      
      async delete(key: string): Promise<void> {
        store.delete(key);
      },
      
      async clear(): Promise<void> {
        store.clear();
      },
      
      async keys(): Promise<string[]> {
        return Array.from(store.keys());
      },
      
      async size(): Promise<number> {
        return store.size;
      }
    };
  }
  
  private async createStrategy(): Promise<IStrategy> {
    // For now, always use AutoStrategy
    return new AutoStrategy({
      swarmConfig: this.config,
      memory: this.memory
    });
  }
  
  private async createInitialAgents(): Promise<void> {
    const agents = await this.agentManager.createAgents(
      this.config.agents.slice(0, this.config.scaling.minAgents)
    );
    
    // Register agents with components
    for (const agent of agents) {
      await this.taskOrchestrator.registerAgent(agent);
      await this.hiveMind.registerAgent(agent.id);
    }
  }
  
  private setupEventHandlers(): void {
    // Agent events
    this.agentManager.on('agent:spawned', (agent) => {
      this.recordEvent(SwarmEventType.AGENT_SPAWNED, { 
        agentId: agent.id,
        agentType: agent.type 
      });
    });
    
    this.agentManager.on('agent:failed', (agentId, error) => {
      this.recordEvent(SwarmEventType.AGENT_FAILED, {
        agentId,
        error: error.message
      });
    });
    
    // Task events
    this.taskOrchestrator.on('task:started', (taskId, agentId) => {
      this.recordEvent(SwarmEventType.TASK_STARTED, {
        taskId,
        agentId
      });
    });
    
    this.taskOrchestrator.on('task:completed', (result) => {
      this.recordEvent(SwarmEventType.TASK_COMPLETED, {
        taskId: result.taskId,
        agentId: result.agentId
      });
    });
    
    this.taskOrchestrator.on('task:failed', (taskId, error) => {
      this.recordEvent(SwarmEventType.TASK_FAILED, {
        taskId,
        error: error.message
      });
    });
    
    // Monitor alerts
    this.monitor.on('alert', (alert) => {
      this.recordEvent(SwarmEventType.ALERT_TRIGGERED, alert);
      this.handleAlert(alert);
    });
  }
  
  private startAutoScaling(): void {
    setInterval(async () => {
      if (this._state !== SwarmState.RUNNING) return;
      
      const metrics = await this.getMetrics();
      const decision = this.strategy.shouldScale(metrics);
      
      if (decision.action === ScaleAction.UP) {
        await this.scaleUp(decision.count);
      } else if (decision.action === ScaleAction.DOWN) {
        await this.scaleDown(decision.count);
      }
    }, this.config.scaling.cooldownPeriod);
  }
  
  private startCheckpointing(): void {
    setInterval(async () => {
      if (this._state === SwarmState.RUNNING) {
        await this.checkpoint();
      }
    }, this.config.persistence.checkpointInterval);
  }
  
  private validateTask(task: Task): void {
    if (!task.name) {
      throw new Error('Task name is required');
    }
    
    if (!task.type) {
      throw new Error('Task type is required');
    }
    
    if (!task.priority) {
      task.priority = Priority.MEDIUM;
    }
  }
  
  private recordEvent(type: SwarmEventType, data: any): void {
    const event: SwarmEvent = {
      type,
      timestamp: new Date(),
      source: this._id,
      data
    };
    
    this.events.push(event);
    this.emit('event', event);
  }
  
  private async trace(name: string, data: any): Promise<void> {
    if (this.langfuse) {
      this.langfuse.trace({
        name: `swarm_${name}`,
        metadata: {
          swarmId: this._id,
          ...data
        },
        sessionId: this._id,
        userId: 'system'
      });
    }
  }
  
  private async handleAlert(alert: any): Promise<void> {
    // Implement alert handling logic
    console.warn('Alert triggered:', alert);
  }
  
  private getErrors(): Error[] {
    return this.events
      .filter(e => e.data?.error)
      .map(e => new Error(e.data.error));
  }
  
  private async saveCheckpoint(id: string, data: any): Promise<void> {
    // Implement checkpoint persistence
    await this.memory.set(`checkpoint:${id}`, data);
  }
  
  private async loadCheckpoint(id: string): Promise<any> {
    return this.memory.get(`checkpoint:${id}`);
  }
}