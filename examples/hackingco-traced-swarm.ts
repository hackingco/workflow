#!/usr/bin/env ts-node

import { LangfuseTracedSwarm } from '../src/swarm/langfuse-traced-swarm';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * HackingCo Traced Swarm Example
 * 
 * This example demonstrates how to run a fully traced swarm operation
 * with comprehensive Langfuse observability.
 */
async function runTracedSwarm() {
  console.log('🚀 Starting HackingCo Traced Swarm...\n');

  // Define swarm configuration
  const swarmConfig = {
    title: 'HackingCo Client Project Automation',
    agents: 6,
    phases: [
      'Discovery',
      'Planning',
      'Implementation',
      'Testing',
      'Deployment',
      'Optimization'
    ],
    objectives: {
      primary: 'Automate client onboarding and project delivery',
      secondary: [
        'Reduce onboarding time by 50%',
        'Improve project visibility',
        'Enhance client satisfaction',
        'Standardize delivery process'
      ]
    }
  };

  // Initialize traced swarm
  const swarm = new LangfuseTracedSwarm(swarmConfig);

  try {
    // Phase 1: Spawn Agents
    console.log('📋 Phase 1: Spawning Agents...');
    const agents = await Promise.all([
      swarm.spawnAgent('researcher', 'agent-research-001'),
      swarm.spawnAgent('architect', 'agent-architect-001'),
      swarm.spawnAgent('developer', 'agent-dev-001'),
      swarm.spawnAgent('developer', 'agent-dev-002'),
      swarm.spawnAgent('tester', 'agent-test-001'),
      swarm.spawnAgent('devops', 'agent-devops-001')
    ]);
    console.log(`✅ Spawned ${agents.length} agents\n`);

    // Phase 2: Discovery Tasks
    console.log('🔍 Phase 2: Discovery...');
    const discoveryTasks = [
      {
        name: 'analyze_requirements',
        phase: 'Discovery',
        input: { client: 'Enterprise Corp', project: 'Digital Transformation' },
        priority: 'high' as const
      },
      {
        name: 'assess_current_state',
        phase: 'Discovery',
        input: { systems: ['ERP', 'CRM', 'Analytics'] },
        priority: 'high' as const
      },
      {
        name: 'identify_stakeholders',
        phase: 'Discovery',
        input: { departments: ['IT', 'Sales', 'Operations'] },
        priority: 'medium' as const
      }
    ];

    const discoveryResults = await Promise.all(
      discoveryTasks.map(task => swarm.executeTask('agent-research-001', task))
    );
    console.log(`✅ Discovery completed: ${discoveryResults.filter(r => r.success).length}/${discoveryResults.length} tasks successful\n`);

    // Phase 3: Planning with Consensus
    console.log('📐 Phase 3: Planning...');
    
    // Vote on architecture approach
    const architectureVote = await swarm.consensusVote(
      'Architecture Approach',
      ['Microservices', 'Monolithic', 'Serverless', 'Hybrid']
    );
    console.log(`🗳️ Architecture consensus: ${architectureVote.winner} (${architectureVote.consensus.toFixed(1)}% agreement)`);

    // Share decision in memory
    await swarm.shareMemory('architecture/decision', architectureVote.winner, 'agent-architect-001');

    // Vote on technology stack
    const techStackVote = await swarm.consensusVote(
      'Technology Stack',
      ['Node.js + React', 'Python + Vue', 'Java + Angular', '.NET + Blazor']
    );
    console.log(`🗳️ Tech stack consensus: ${techStackVote.winner} (${techStackVote.consensus.toFixed(1)}% agreement)\n`);

    await swarm.shareMemory('tech/stack', techStackVote.winner, 'agent-architect-001');

    // Phase 4: Implementation Tasks
    console.log('🛠️ Phase 4: Implementation...');
    const implementationTasks = [
      {
        name: 'setup_infrastructure',
        phase: 'Implementation',
        input: { cloud: 'AWS', regions: ['us-east-1', 'eu-west-1'] },
        priority: 'high' as const
      },
      {
        name: 'develop_api',
        phase: 'Implementation',
        input: { endpoints: 20, authentication: 'OAuth2' },
        priority: 'high' as const
      },
      {
        name: 'create_frontend',
        phase: 'Implementation',
        input: { pages: 15, responsive: true },
        priority: 'high' as const
      },
      {
        name: 'integrate_systems',
        phase: 'Implementation',
        input: { systems: ['ERP', 'CRM'], method: 'REST API' },
        priority: 'medium' as const
      }
    ];

    // Distribute tasks among developers
    const implResults = await Promise.all([
      swarm.executeTask('agent-devops-001', implementationTasks[0]),
      swarm.executeTask('agent-dev-001', implementationTasks[1]),
      swarm.executeTask('agent-dev-002', implementationTasks[2]),
      swarm.executeTask('agent-dev-001', implementationTasks[3])
    ]);
    console.log(`✅ Implementation completed: ${implResults.filter(r => r.success).length}/${implResults.length} tasks successful\n`);

    // Phase 5: Testing
    console.log('🧪 Phase 5: Testing...');
    const testingTasks = [
      {
        name: 'unit_testing',
        phase: 'Testing',
        input: { coverage: 80, framework: 'Jest' },
        priority: 'high' as const
      },
      {
        name: 'integration_testing',
        phase: 'Testing',
        input: { scenarios: 50, automated: true },
        priority: 'high' as const
      },
      {
        name: 'performance_testing',
        phase: 'Testing',
        input: { users: 1000, duration: '1h' },
        priority: 'medium' as const
      }
    ];

    const testResults = await Promise.all(
      testingTasks.map(task => swarm.executeTask('agent-test-001', task))
    );
    console.log(`✅ Testing completed: ${testResults.filter(r => r.success).length}/${testResults.length} tests passed\n`);

    // Phase 6: Deployment Decision
    console.log('🚀 Phase 6: Deployment...');
    const deploymentVote = await swarm.consensusVote(
      'Deployment Strategy',
      ['Blue-Green', 'Canary', 'Rolling', 'Direct']
    );
    console.log(`🗳️ Deployment strategy: ${deploymentVote.winner} (${deploymentVote.consensus.toFixed(1)}% agreement)`);

    const deployTask = {
      name: 'deploy_production',
      phase: 'Deployment',
      input: { strategy: deploymentVote.winner, environments: ['staging', 'production'] },
      priority: 'high' as const
    };
    const deployResult = await swarm.executeTask('agent-devops-001', deployTask);
    console.log(`✅ Deployment ${deployResult.success ? 'successful' : 'failed'}\n`);

    // Complete swarm and generate report
    console.log('📊 Generating Swarm Report...');
    const report = await swarm.completeSwarm();

    console.log('\n=== SWARM EXECUTION REPORT ===');
    console.log(`Swarm ID: ${report.swarmId}`);
    console.log(`Session ID: ${report.sessionId}`);
    console.log(`Duration: ${((report.endTime.getTime() - report.startTime.getTime()) / 1000).toFixed(2)}s`);
    console.log(`Total Agents: ${report.metrics.totalAgents}`);
    console.log(`Total Tasks: ${report.metrics.totalTasks}`);
    console.log(`Success Rate: ${report.metrics.avgSuccessRate.toFixed(1)}%`);
    console.log('\n✨ Swarm execution complete! Check Langfuse dashboard for detailed traces.');

  } catch (error) {
    console.error('❌ Swarm execution failed:', error);
    process.exit(1);
  }
}

// Execute the swarm
if (require.main === module) {
  runTracedSwarm()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}