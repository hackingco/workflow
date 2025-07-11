/**
 * HackingCo Auto Strategy
 * 
 * Intelligent strategy selector that automatically chooses the optimal
 * execution strategy based on task characteristics and system state.
 */

import {
  IStrategy,
  IAgent,
  Task,
  SwarmMetrics,
  ScaleDecision,
  ScaleAction,
  SwarmStrategy,
  TaskType,
  Priority,
  AgentState,
  SwarmConfig,
  MemoryStore
} from '../types';

interface AutoStrategyConfig {
  swarmConfig: SwarmConfig;
  memory: MemoryStore;
}

interface StrategyMetrics {
  taskQueue: number;
  avgWaitTime: number;
  taskComplexity: number;
  agentUtilization: number;
  taskDependencies: number;
  taskPriority: number;
}

export class AutoStrategy implements IStrategy {
  readonly name = 'auto';
  private config: AutoStrategyConfig;
  private currentStrategy: SwarmStrategy;
  private strategyHistory: Array<{ timestamp: Date; strategy: SwarmStrategy; reason: string }> = [];
  
  constructor(config: AutoStrategyConfig) {
    this.config = config;
    this.currentStrategy = SwarmStrategy.PARALLEL; // Default strategy
  }
  
  /**
   * Assign a task to the most suitable agent
   */
  async assignTask(task: Task, agents: IAgent[]): Promise<IAgent | null> {
    // Filter available agents
    const availableAgents = agents.filter(agent => 
      agent.state === AgentState.IDLE && 
      agent.canExecute(task)
    );
    
    if (availableAgents.length === 0) {
      return null;
    }
    
    // Analyze task and system state
    const strategy = await this.selectStrategy(task, agents);
    
    // Apply strategy-specific assignment logic
    switch (strategy) {
      case SwarmStrategy.PARALLEL:
        return this.parallelAssignment(task, availableAgents);
        
      case SwarmStrategy.SEQUENTIAL:
        return this.sequentialAssignment(task, availableAgents);
        
      case SwarmStrategy.PIPELINE:
        return this.pipelineAssignment(task, availableAgents);
        
      case SwarmStrategy.HIERARCHICAL:
        return this.hierarchicalAssignment(task, availableAgents);
        
      case SwarmStrategy.CONSENSUS:
        return this.consensusAssignment(task, availableAgents);
        
      case SwarmStrategy.ADAPTIVE:
        return this.adaptiveAssignment(task, availableAgents);
        
      default:
        return this.defaultAssignment(task, availableAgents);
    }
  }
  
  /**
   * Rebalance tasks among agents
   */
  async rebalance(agents: IAgent[], tasks: Task[]): Promise<Map<string, string>> {
    const assignments = new Map<string, string>();
    
    // Group agents by capability
    const agentGroups = this.groupAgentsByCapability(agents);
    
    // Group tasks by type and priority
    const taskGroups = this.groupTasksByType(tasks);
    
    // Calculate optimal distribution
    for (const [taskType, taskList] of taskGroups) {
      const capableAgents = this.findCapableAgents(taskType, agentGroups);
      
      if (capableAgents.length === 0) continue;
      
      // Distribute tasks evenly among capable agents
      let agentIndex = 0;
      for (const task of taskList) {
        const agent = capableAgents[agentIndex % capableAgents.length];
        assignments.set(task.id, agent.id);
        agentIndex++;
      }
    }
    
    // Store rebalancing decision
    await this.config.memory.set('last_rebalance', {
      timestamp: new Date(),
      assignments: Array.from(assignments.entries()),
      strategy: this.currentStrategy
    });
    
    return assignments;
  }
  
  /**
   * Determine if scaling is needed
   */
  shouldScale(metrics: SwarmMetrics): ScaleDecision {
    const utilizationRate = this.calculateUtilization(metrics);
    const taskBacklog = this.calculateBacklog(metrics);
    const performanceTrend = this.analyzePerformanceTrend(metrics);
    
    // Scale up conditions
    if (utilizationRate > 0.85 || taskBacklog > 50) {
      const additionalAgents = this.calculateScaleUpCount(metrics);
      return {
        action: ScaleAction.UP,
        count: additionalAgents,
        reason: `High utilization (${(utilizationRate * 100).toFixed(1)}%) or large backlog (${taskBacklog} tasks)`
      };
    }
    
    // Scale down conditions
    if (utilizationRate < 0.3 && taskBacklog < 5 && performanceTrend === 'stable') {
      const reduceAgents = this.calculateScaleDownCount(metrics);
      return {
        action: ScaleAction.DOWN,
        count: reduceAgents,
        reason: `Low utilization (${(utilizationRate * 100).toFixed(1)}%) with minimal backlog`
      };
    }
    
    return {
      action: ScaleAction.NONE,
      count: 0,
      reason: 'System operating within normal parameters'
    };
  }
  
  // Private helper methods
  
  private async selectStrategy(task: Task, agents: IAgent[]): Promise<SwarmStrategy> {
    const metrics = await this.analyzeSystemMetrics(task, agents);
    
    // Rule-based strategy selection
    if (metrics.taskDependencies > 0) {
      // Tasks with dependencies work better with sequential or pipeline
      this.currentStrategy = metrics.taskDependencies > 3 ? 
        SwarmStrategy.PIPELINE : SwarmStrategy.SEQUENTIAL;
    } else if (metrics.taskComplexity > 0.7) {
      // Complex tasks benefit from consensus
      this.currentStrategy = SwarmStrategy.CONSENSUS;
    } else if (metrics.agentUtilization < 0.5 && metrics.taskQueue > 10) {
      // Low utilization with many tasks => parallel
      this.currentStrategy = SwarmStrategy.PARALLEL;
    } else if (metrics.taskPriority > 0.8) {
      // High priority tasks => hierarchical for better control
      this.currentStrategy = SwarmStrategy.HIERARCHICAL;
    } else {
      // Default to adaptive for general cases
      this.currentStrategy = SwarmStrategy.ADAPTIVE;
    }
    
    // Record strategy change
    this.strategyHistory.push({
      timestamp: new Date(),
      strategy: this.currentStrategy,
      reason: this.explainStrategyChoice(metrics)
    });
    
    // Keep history size manageable
    if (this.strategyHistory.length > 100) {
      this.strategyHistory = this.strategyHistory.slice(-50);
    }
    
    return this.currentStrategy;
  }
  
  private async analyzeSystemMetrics(task: Task, agents: IAgent[]): Promise<StrategyMetrics> {
    // Get current queue size from memory
    const queueSize = await this.config.memory.get('task_queue_size') || 0;
    
    // Calculate average wait time
    const waitTimes = await this.config.memory.get('task_wait_times') || [];
    const avgWaitTime = waitTimes.length > 0 ? 
      waitTimes.reduce((a: number, b: number) => a + b, 0) / waitTimes.length : 0;
    
    // Estimate task complexity
    const taskComplexity = this.estimateTaskComplexity(task);
    
    // Calculate agent utilization
    const busyAgents = agents.filter(a => a.state === AgentState.BUSY).length;
    const agentUtilization = agents.length > 0 ? busyAgents / agents.length : 0;
    
    // Count task dependencies
    const taskDependencies = task.requirements?.dependencies?.length || 0;
    
    // Normalize task priority
    const priorityMap = {
      [Priority.CRITICAL]: 1.0,
      [Priority.HIGH]: 0.75,
      [Priority.MEDIUM]: 0.5,
      [Priority.LOW]: 0.25
    };
    const taskPriority = priorityMap[task.priority];
    
    return {
      taskQueue: queueSize,
      avgWaitTime,
      taskComplexity,
      agentUtilization,
      taskDependencies,
      taskPriority
    };
  }
  
  private estimateTaskComplexity(task: Task): number {
    let complexity = 0;
    
    // Factor in task type
    const typeComplexity = {
      [TaskType.ANALYZE]: 0.7,
      [TaskType.PROCESS]: 0.5,
      [TaskType.TRANSFORM]: 0.6,
      [TaskType.VALIDATE]: 0.3,
      [TaskType.AGGREGATE]: 0.8,
      [TaskType.CUSTOM]: 0.5
    };
    complexity += typeComplexity[task.type] || 0.5;
    
    // Factor in resource requirements
    if (task.requirements?.resources) {
      const resources = task.requirements.resources;
      if (resources.cpu > 0.5) complexity += 0.1;
      if (resources.memory > 1024) complexity += 0.1;
    }
    
    // Factor in dependencies
    if (task.requirements?.dependencies) {
      complexity += task.requirements.dependencies.length * 0.05;
    }
    
    return Math.min(complexity, 1.0);
  }
  
  private explainStrategyChoice(metrics: StrategyMetrics): string {
    const reasons = [];
    
    if (metrics.taskDependencies > 0) {
      reasons.push(`${metrics.taskDependencies} task dependencies detected`);
    }
    if (metrics.taskComplexity > 0.7) {
      reasons.push(`High task complexity (${(metrics.taskComplexity * 100).toFixed(0)}%)`);
    }
    if (metrics.agentUtilization < 0.5) {
      reasons.push(`Low agent utilization (${(metrics.agentUtilization * 100).toFixed(0)}%)`);
    }
    if (metrics.taskQueue > 10) {
      reasons.push(`Large task queue (${metrics.taskQueue} tasks)`);
    }
    if (metrics.taskPriority > 0.8) {
      reasons.push('High priority task');
    }
    
    return reasons.join(', ') || 'Default strategy selection';
  }
  
  // Strategy-specific assignment methods
  
  private parallelAssignment(task: Task, agents: IAgent[]): IAgent {
    // Select agent with lowest current load
    return agents.reduce((best, agent) => {
      const bestLoad = this.getAgentLoad(best);
      const agentLoad = this.getAgentLoad(agent);
      return agentLoad < bestLoad ? agent : best;
    });
  }
  
  private sequentialAssignment(task: Task, agents: IAgent[]): IAgent {
    // Select first available agent in sequence
    return agents[0];
  }
  
  private pipelineAssignment(task: Task, agents: IAgent[]): IAgent {
    // Select agent based on pipeline stage
    const stage = this.getTaskStage(task);
    const stageAgents = agents.filter(a => 
      a.capabilities.includes(`stage_${stage}`)
    );
    return stageAgents[0] || agents[0];
  }
  
  private hierarchicalAssignment(task: Task, agents: IAgent[]): IAgent {
    // Prioritize senior agents for high-priority tasks
    if (task.priority === Priority.CRITICAL || task.priority === Priority.HIGH) {
      const seniorAgents = agents.filter(a => 
        a.capabilities.includes('senior') || 
        a.capabilities.includes('coordinator')
      );
      if (seniorAgents.length > 0) {
        return seniorAgents[0];
      }
    }
    return agents[0];
  }
  
  private consensusAssignment(task: Task, agents: IAgent[]): IAgent {
    // For consensus, prefer agents with validation capabilities
    const validators = agents.filter(a => 
      a.capabilities.includes('validation') ||
      a.capabilities.includes('review')
    );
    return validators[0] || agents[0];
  }
  
  private adaptiveAssignment(task: Task, agents: IAgent[]): IAgent {
    // Use historical performance data
    const bestAgent = agents.reduce((best, agent) => {
      const bestScore = this.getAgentScore(best, task.type);
      const agentScore = this.getAgentScore(agent, task.type);
      return agentScore > bestScore ? agent : best;
    });
    return bestAgent;
  }
  
  private defaultAssignment(task: Task, agents: IAgent[]): IAgent {
    // Round-robin assignment
    return agents[Math.floor(Math.random() * agents.length)];
  }
  
  // Utility methods
  
  private getAgentLoad(agent: IAgent): number {
    // This would be retrieved from agent metrics
    return Math.random(); // Placeholder
  }
  
  private getTaskStage(task: Task): number {
    // Extract stage from task metadata
    return task.metadata?.stage || 0;
  }
  
  private getAgentScore(agent: IAgent, taskType: TaskType): number {
    // Calculate agent performance score for task type
    // This would use historical data
    return Math.random(); // Placeholder
  }
  
  private groupAgentsByCapability(agents: IAgent[]): Map<string, IAgent[]> {
    const groups = new Map<string, IAgent[]>();
    
    for (const agent of agents) {
      for (const capability of agent.capabilities) {
        if (!groups.has(capability)) {
          groups.set(capability, []);
        }
        groups.get(capability)!.push(agent);
      }
    }
    
    return groups;
  }
  
  private groupTasksByType(tasks: Task[]): Map<TaskType, Task[]> {
    const groups = new Map<TaskType, Task[]>();
    
    for (const task of tasks) {
      if (!groups.has(task.type)) {
        groups.set(task.type, []);
      }
      groups.get(task.type)!.push(task);
    }
    
    // Sort each group by priority
    for (const [type, taskList] of groups) {
      taskList.sort((a, b) => {
        const priorityOrder = {
          [Priority.CRITICAL]: 0,
          [Priority.HIGH]: 1,
          [Priority.MEDIUM]: 2,
          [Priority.LOW]: 3
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    }
    
    return groups;
  }
  
  private findCapableAgents(taskType: TaskType, agentGroups: Map<string, IAgent[]>): IAgent[] {
    // Map task types to required capabilities
    const requiredCapabilities = {
      [TaskType.ANALYZE]: ['analysis', 'research'],
      [TaskType.PROCESS]: ['execution', 'processing'],
      [TaskType.TRANSFORM]: ['transformation', 'processing'],
      [TaskType.VALIDATE]: ['validation', 'review'],
      [TaskType.AGGREGATE]: ['aggregation', 'analysis'],
      [TaskType.CUSTOM]: ['general']
    };
    
    const capabilities = requiredCapabilities[taskType] || ['general'];
    const capableAgents = new Set<IAgent>();
    
    for (const capability of capabilities) {
      const agents = agentGroups.get(capability) || [];
      agents.forEach(agent => capableAgents.add(agent));
    }
    
    return Array.from(capableAgents);
  }
  
  private calculateUtilization(metrics: SwarmMetrics): number {
    if (metrics.totalTasks === 0) return 0;
    
    const completionRate = metrics.completedTasks / metrics.totalTasks;
    const successRate = metrics.successRate / 100;
    
    // Weighted utilization score
    return (completionRate * 0.6) + (successRate * 0.4);
  }
  
  private calculateBacklog(metrics: SwarmMetrics): number {
    return metrics.totalTasks - metrics.completedTasks - metrics.failedTasks;
  }
  
  private analyzePerformanceTrend(metrics: SwarmMetrics): 'improving' | 'stable' | 'degrading' {
    // This would analyze historical metrics
    // For now, return stable
    return 'stable';
  }
  
  private calculateScaleUpCount(metrics: SwarmMetrics): number {
    const backlog = this.calculateBacklog(metrics);
    const avgTasksPerAgent = metrics.completedTasks / (metrics.peakConcurrency || 1);
    
    // Calculate how many agents needed for backlog
    const neededAgents = Math.ceil(backlog / avgTasksPerAgent);
    
    // Apply scaling factor
    return Math.min(neededAgents, 5); // Max 5 agents at a time
  }
  
  private calculateScaleDownCount(metrics: SwarmMetrics): number {
    const utilization = this.calculateUtilization(metrics);
    
    // Conservative scale down
    if (utilization < 0.1) return 2;
    if (utilization < 0.2) return 1;
    return 0;
  }
}