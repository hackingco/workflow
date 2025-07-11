/**
 * HackingCo Hive Mind System
 * 
 * Collective intelligence module that enables shared memory, consensus
 * decision-making, and distributed problem-solving across the swarm.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { MemoryStore } from '../swarm/types';

interface HiveMindConfig {
  swarmId: string;
  memory: MemoryStore;
  consensusThreshold: number;
  syncInterval?: number;
  maxMemorySize?: number;
}

interface KnowledgeEntry {
  id: string;
  key: string;
  value: any;
  agentId: string;
  timestamp: Date;
  ttl?: number;
  confidence: number;
  votes: Map<string, boolean>;
}

interface ConsensusRequest {
  id: string;
  topic: string;
  proposal: any;
  requester: string;
  timestamp: Date;
  deadline: Date;
  votes: Map<string, Vote>;
  status: ConsensusStatus;
}

interface Vote {
  agentId: string;
  value: boolean;
  confidence: number;
  reasoning?: string;
  timestamp: Date;
}

enum ConsensusStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  TIMEOUT = 'timeout'
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  occurrences: number;
  lastSeen: Date;
  agents: Set<string>;
  data: any;
}

export class HiveMind extends EventEmitter {
  private config: HiveMindConfig;
  private knowledge: Map<string, KnowledgeEntry>;
  private consensusRequests: Map<string, ConsensusRequest>;
  private patterns: Map<string, Pattern>;
  private agents: Set<string>;
  private active: boolean;
  private syncTimer?: NodeJS.Timer;
  
  constructor(config: HiveMindConfig) {
    super();
    this.config = {
      syncInterval: 5000,
      maxMemorySize: 10000,
      ...config
    };
    this.knowledge = new Map();
    this.consensusRequests = new Map();
    this.patterns = new Map();
    this.agents = new Set();
    this.active = false;
  }
  
  /**
   * Activate the hive mind
   */
  async activate(): Promise<void> {
    if (this.active) return;
    
    this.active = true;
    
    // Start sync timer
    this.syncTimer = setInterval(() => {
      this.sync();
    }, this.config.syncInterval);
    
    // Load persisted knowledge
    await this.loadKnowledge();
    
    this.emit('activated');
  }
  
  /**
   * Deactivate the hive mind
   */
  async deactivate(): Promise<void> {
    if (!this.active) return;
    
    this.active = false;
    
    // Stop sync timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    // Persist knowledge
    await this.persistKnowledge();
    
    this.emit('deactivated');
  }
  
  /**
   * Register an agent with the hive mind
   */
  async registerAgent(agentId: string): Promise<void> {
    this.agents.add(agentId);
    
    // Share initial knowledge with new agent
    await this.shareKnowledge(agentId);
    
    this.emit('agent:registered', agentId);
  }
  
  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.agents.delete(agentId);
    
    // Clean up agent's contributions
    await this.cleanupAgentData(agentId);
    
    this.emit('agent:unregistered', agentId);
  }
  
  /**
   * Share knowledge with the hive
   */
  async share(agentId: string, key: string, value: any, confidence: number = 1.0, ttl?: number): Promise<void> {
    const entry: KnowledgeEntry = {
      id: uuidv4(),
      key,
      value,
      agentId,
      timestamp: new Date(),
      ttl,
      confidence,
      votes: new Map([[agentId, true]])
    };
    
    // Check if knowledge already exists
    const existing = this.knowledge.get(key);
    if (existing) {
      // Merge or update based on confidence and votes
      await this.mergeKnowledge(existing, entry);
    } else {
      this.knowledge.set(key, entry);
      this.emit('knowledge:added', entry);
    }
    
    // Check memory limits
    await this.enforceMemoryLimits();
    
    // Detect patterns
    await this.detectPatterns(key, value);
  }
  
  /**
   * Retrieve knowledge from the hive
   */
  async retrieve(key: string): Promise<any> {
    const entry = this.knowledge.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (entry.ttl && Date.now() - entry.timestamp.getTime() > entry.ttl) {
      this.knowledge.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  /**
   * Search knowledge by pattern
   */
  async search(pattern: string | RegExp): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const [key, entry] of this.knowledge) {
      if (regex.test(key)) {
        // Check TTL
        if (entry.ttl && Date.now() - entry.timestamp.getTime() > entry.ttl) {
          this.knowledge.delete(key);
          continue;
        }
        results.set(key, entry.value);
      }
    }
    
    return results;
  }
  
  /**
   * Request consensus from the hive
   */
  async requestConsensus(agentId: string, topic: string, proposal: any, deadline?: Date): Promise<string> {
    const request: ConsensusRequest = {
      id: uuidv4(),
      topic,
      proposal,
      requester: agentId,
      timestamp: new Date(),
      deadline: deadline || new Date(Date.now() + 30000), // 30 second default
      votes: new Map(),
      status: ConsensusStatus.PENDING
    };
    
    this.consensusRequests.set(request.id, request);
    
    // Notify all agents
    this.emit('consensus:requested', request);
    
    // Set timeout for deadline
    setTimeout(() => {
      this.finalizeConsensus(request.id);
    }, request.deadline.getTime() - Date.now());
    
    return request.id;
  }
  
  /**
   * Submit vote for consensus
   */
  async vote(agentId: string, requestId: string, value: boolean, confidence: number = 1.0, reasoning?: string): Promise<void> {
    const request = this.consensusRequests.get(requestId);
    if (!request || request.status !== ConsensusStatus.PENDING) {
      throw new Error('Invalid or completed consensus request');
    }
    
    const vote: Vote = {
      agentId,
      value,
      confidence,
      reasoning,
      timestamp: new Date()
    };
    
    request.votes.set(agentId, vote);
    
    // Check if we have enough votes
    if (request.votes.size >= this.agents.size * this.config.consensusThreshold) {
      await this.finalizeConsensus(requestId);
    }
  }
  
  /**
   * Get consensus result
   */
  async getConsensusResult(requestId: string): Promise<ConsensusRequest | null> {
    return this.consensusRequests.get(requestId) || null;
  }
  
  /**
   * Learn from experience
   */
  async learn(agentId: string, experience: any): Promise<void> {
    // Extract patterns from experience
    const patterns = this.extractPatterns(experience);
    
    for (const pattern of patterns) {
      await this.recordPattern(pattern, agentId);
    }
    
    // Share learned knowledge
    if (experience.success && experience.solution) {
      await this.share(
        agentId,
        `solution:${experience.problem}`,
        experience.solution,
        experience.confidence || 0.8
      );
    }
  }
  
  /**
   * Get collective insights
   */
  async getInsights(): Promise<any> {
    const insights = {
      knowledgeSize: this.knowledge.size,
      activeAgents: this.agents.size,
      patterns: Array.from(this.patterns.values()).map(p => ({
        name: p.name,
        occurrences: p.occurrences,
        lastSeen: p.lastSeen,
        agentCount: p.agents.size
      })),
      consensusHistory: Array.from(this.consensusRequests.values())
        .filter(r => r.status !== ConsensusStatus.PENDING)
        .map(r => ({
          topic: r.topic,
          status: r.status,
          timestamp: r.timestamp,
          participation: (r.votes.size / this.agents.size) * 100
        })),
      topKnowledge: this.getTopKnowledge(10)
    };
    
    return insights;
  }
  
  /**
   * Synchronize hive state
   */
  private async sync(): Promise<void> {
    // Clean expired knowledge
    await this.cleanExpiredKnowledge();
    
    // Process pending consensus
    await this.processPendingConsensus();
    
    // Persist state periodically
    if (Date.now() % 10 === 0) { // Every 10th sync
      await this.persistKnowledge();
    }
    
    this.emit('synced');
  }
  
  /**
   * Merge knowledge entries
   */
  private async mergeKnowledge(existing: KnowledgeEntry, new_: KnowledgeEntry): Promise<void> {
    // Add vote from new agent
    existing.votes.set(new_.agentId, true);
    
    // Update confidence based on votes
    existing.confidence = existing.votes.size / this.agents.size;
    
    // Update value if new entry has higher confidence
    if (new_.confidence > existing.confidence) {
      existing.value = new_.value;
      existing.timestamp = new_.timestamp;
    }
    
    this.emit('knowledge:merged', existing);
  }
  
  /**
   * Detect patterns in knowledge
   */
  private async detectPatterns(key: string, value: any): Promise<void> {
    // Simple pattern detection based on key structure
    const keyParts = key.split(':');
    if (keyParts.length > 1) {
      const patternName = keyParts[0];
      
      let pattern = this.patterns.get(patternName);
      if (!pattern) {
        pattern = {
          id: uuidv4(),
          name: patternName,
          description: `Pattern for ${patternName} entries`,
          occurrences: 0,
          lastSeen: new Date(),
          agents: new Set(),
          data: {}
        };
        this.patterns.set(patternName, pattern);
      }
      
      pattern.occurrences++;
      pattern.lastSeen = new Date();
      pattern.data[key] = value;
      
      this.emit('pattern:detected', pattern);
    }
  }
  
  /**
   * Finalize consensus voting
   */
  private async finalizeConsensus(requestId: string): Promise<void> {
    const request = this.consensusRequests.get(requestId);
    if (!request || request.status !== ConsensusStatus.PENDING) return;
    
    // Count votes
    let approvals = 0;
    let totalConfidence = 0;
    
    for (const vote of request.votes.values()) {
      if (vote.value) {
        approvals++;
        totalConfidence += vote.confidence;
      }
    }
    
    const approvalRate = request.votes.size > 0 ? approvals / request.votes.size : 0;
    
    // Determine outcome
    if (request.votes.size < this.agents.size * 0.5) {
      request.status = ConsensusStatus.TIMEOUT;
    } else if (approvalRate >= this.config.consensusThreshold) {
      request.status = ConsensusStatus.APPROVED;
    } else {
      request.status = ConsensusStatus.REJECTED;
    }
    
    this.emit('consensus:finalized', request);
    
    // Share consensus result as knowledge
    await this.share(
      'hive-mind',
      `consensus:${request.topic}`,
      {
        proposal: request.proposal,
        status: request.status,
        approvalRate,
        avgConfidence: totalConfidence / request.votes.size
      },
      1.0
    );
  }
  
  /**
   * Extract patterns from experience
   */
  private extractPatterns(experience: any): Pattern[] {
    const patterns: Pattern[] = [];
    
    // Extract problem-solution patterns
    if (experience.problem && experience.solution) {
      patterns.push({
        id: uuidv4(),
        name: 'problem-solution',
        description: 'Problem-solution mapping',
        occurrences: 1,
        lastSeen: new Date(),
        agents: new Set(),
        data: {
          problem: experience.problem,
          solution: experience.solution
        }
      });
    }
    
    // Extract error patterns
    if (experience.error) {
      patterns.push({
        id: uuidv4(),
        name: 'error-pattern',
        description: 'Error occurrence pattern',
        occurrences: 1,
        lastSeen: new Date(),
        agents: new Set(),
        data: {
          error: experience.error,
          context: experience.context
        }
      });
    }
    
    return patterns;
  }
  
  /**
   * Record pattern occurrence
   */
  private async recordPattern(pattern: Pattern, agentId: string): Promise<void> {
    const existing = this.patterns.get(pattern.name);
    
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date();
      existing.agents.add(agentId);
      Object.assign(existing.data, pattern.data);
    } else {
      pattern.agents.add(agentId);
      this.patterns.set(pattern.name, pattern);
    }
  }
  
  /**
   * Get top knowledge entries
   */
  private getTopKnowledge(limit: number): Array<{ key: string; confidence: number; votes: number }> {
    return Array.from(this.knowledge.entries())
      .sort((a, b) => b[1].confidence - a[1].confidence)
      .slice(0, limit)
      .map(([key, entry]) => ({
        key,
        confidence: entry.confidence,
        votes: entry.votes.size
      }));
  }
  
  /**
   * Clean expired knowledge
   */
  private async cleanExpiredKnowledge(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];
    
    for (const [key, entry] of this.knowledge) {
      if (entry.ttl && now - entry.timestamp.getTime() > entry.ttl) {
        expired.push(key);
      }
    }
    
    for (const key of expired) {
      this.knowledge.delete(key);
    }
    
    if (expired.length > 0) {
      this.emit('knowledge:cleaned', expired.length);
    }
  }
  
  /**
   * Process pending consensus requests
   */
  private async processPendingConsensus(): Promise<void> {
    const now = Date.now();
    
    for (const [id, request] of this.consensusRequests) {
      if (request.status === ConsensusStatus.PENDING && 
          request.deadline.getTime() < now) {
        await this.finalizeConsensus(id);
      }
    }
  }
  
  /**
   * Enforce memory limits
   */
  private async enforceMemoryLimits(): Promise<void> {
    if (this.knowledge.size <= this.config.maxMemorySize!) return;
    
    // Remove oldest entries with lowest confidence
    const entries = Array.from(this.knowledge.entries())
      .sort((a, b) => {
        // Sort by confidence first, then by age
        if (a[1].confidence !== b[1].confidence) {
          return a[1].confidence - b[1].confidence;
        }
        return a[1].timestamp.getTime() - b[1].timestamp.getTime();
      });
    
    const toRemove = entries.slice(0, entries.length - this.config.maxMemorySize!);
    
    for (const [key] of toRemove) {
      this.knowledge.delete(key);
    }
    
    if (toRemove.length > 0) {
      this.emit('memory:pruned', toRemove.length);
    }
  }
  
  /**
   * Share knowledge with specific agent
   */
  private async shareKnowledge(agentId: string): Promise<void> {
    const knowledge = Array.from(this.knowledge.entries())
      .map(([key, entry]) => ({
        key,
        value: entry.value,
        confidence: entry.confidence
      }));
    
    this.emit('knowledge:shared', { agentId, count: knowledge.length });
  }
  
  /**
   * Clean up agent data
   */
  private async cleanupAgentData(agentId: string): Promise<void> {
    // Remove agent's votes from knowledge entries
    for (const entry of this.knowledge.values()) {
      entry.votes.delete(agentId);
      // Recalculate confidence
      if (this.agents.size > 0) {
        entry.confidence = entry.votes.size / this.agents.size;
      }
    }
    
    // Remove agent from patterns
    for (const pattern of this.patterns.values()) {
      pattern.agents.delete(agentId);
    }
  }
  
  /**
   * Load knowledge from persistence
   */
  private async loadKnowledge(): Promise<void> {
    const keys = await this.config.memory.keys();
    const knowledgeKeys = keys.filter(k => k.startsWith('hive:knowledge:'));
    
    for (const key of knowledgeKeys) {
      const entry = await this.config.memory.get(key);
      if (entry) {
        this.knowledge.set(entry.key, entry);
      }
    }
    
    this.emit('knowledge:loaded', this.knowledge.size);
  }
  
  /**
   * Persist knowledge to storage
   */
  private async persistKnowledge(): Promise<void> {
    let saved = 0;
    
    for (const [key, entry] of this.knowledge) {
      await this.config.memory.set(`hive:knowledge:${key}`, entry);
      saved++;
    }
    
    this.emit('knowledge:persisted', saved);
  }
}

export default HiveMind;