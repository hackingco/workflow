#!/usr/bin/env ts-node

/**
 * HackingCo Enterprise Swarm Demo
 * 
 * This example demonstrates the full power of HackingCo's swarm system,
 * including:
 * - Swarm coordination with multiple agents
 * - Langfuse observability
 * - GitHub and Slack integrations
 * - Real-time monitoring
 * - Hive mind collective intelligence
 */

import { SwarmCoordinator } from '../src/swarm/coordinator';
import { AgentManager } from '../src/agents/agent-manager';
import { TaskOrchestrator } from '../src/task/task-orchestrator';
import { HiveMind } from '../src/hive-mind';
import { SwarmMonitor } from '../src/monitoring/swarm-monitor';
import { GitHubIntegration } from '../src/integration/github';
import { SlackIntegration } from '../src/integration/slack';
import { LangfuseTracedSwarm } from '../src/swarm/langfuse-traced-swarm';
import { 
  SwarmConfig, 
  SwarmMode, 
  SwarmStrategy,
  AgentType,
  TaskType,
  Priority,
  AgentConfig,
  TaskDefinition
} from '../src/swarm/types';
import chalk from 'chalk';
import ora from 'ora';
import { config } from 'dotenv';

// Load environment variables
config();

// Enterprise scenario: Automated software delivery pipeline
async function runEnterpriseDemo() {
  console.log(chalk.blue.bold(`
╔══════════════════════════════════════════════════════════════╗
║          HackingCo Enterprise Swarm Demo                     ║
║                                                              ║
║  Scenario: Automated Software Delivery Pipeline              ║
║  - Multi-repository code analysis                            ║
║  - Automated testing and quality assurance                   ║
║  - Deployment orchestration                                  ║
║  - Real-time monitoring and alerts                          ║
╚══════════════════════════════════════════════════════════════╝
  `));

  // Initialize integrations
  const github = new GitHubIntegration({
    token: process.env.GITHUB_TOKEN!,
    owner: 'hackingco',
    repo: 'workflow'
  });

  const slack = new SlackIntegration({
    token: process.env.SLACK_TOKEN!,
    channel: process.env.SLACK_CHANNEL || '#swarm-notifications'
  });

  // Create Langfuse-traced swarm for observability
  const tracedSwarm = new LangfuseTracedSwarm({
    title: 'Enterprise Software Delivery Pipeline',
    agents: 10,
    phases: [
      'Analysis',
      'Development',
      'Testing',
      'Security',
      'Deployment',
      'Monitoring'
    ],
    objectives: {
      primary: 'Automate end-to-end software delivery',
      secondary: [
        'Ensure code quality',
        'Maintain security standards',
        'Optimize deployment speed',
        'Enable continuous monitoring'
      ]
    }
  });

  const spinner = ora('Initializing enterprise swarm...').start();

  try {
    // 1. Initialize core components
    spinner.text = 'Setting up swarm coordinator...';
    const swarmConfig: SwarmConfig = {
      name: 'EnterpriseDeliverySwarm',
      mode: SwarmMode.COLLABORATIVE,
      strategy: SwarmStrategy.AUTO,
      monitoring: {
        enabled: true,
        metricsInterval: 5000,
        healthCheckInterval: 10000
      },
      scaling: {
        enabled: true,
        minAgents: 5,
        maxAgents: 20,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3
      },
      resources: {
        maxCpuPerAgent: 2,
        maxMemoryPerAgent: 512,
        maxConcurrentTasks: 50
      }
    };

    const coordinator = new SwarmCoordinator(swarmConfig);
    await coordinator.initialize();

    // 2. Set up hive mind for collective intelligence
    spinner.text = 'Initializing hive mind...';
    const hiveMind = new HiveMind({
      consensusThreshold: 0.7,
      memoryRetention: 3600000, // 1 hour
      learningEnabled: true
    });

    // 3. Create specialized agents
    spinner.text = 'Spawning specialized agents...';
    const agentConfigs: AgentConfig[] = [
      {
        id: 'architect-001',
        name: 'System Architect',
        type: AgentType.ARCHITECT,
        capabilities: ['system-design', 'api-design', 'database-design'],
        resources: { cpu: 2, memory: 512 }
      },
      {
        id: 'analyzer-001',
        name: 'Code Analyzer',
        type: AgentType.ANALYZER,
        capabilities: ['static-analysis', 'dependency-check', 'complexity-analysis'],
        resources: { cpu: 1, memory: 256 }
      },
      {
        id: 'developer-001',
        name: 'Backend Developer',
        type: AgentType.CODER,
        capabilities: ['nodejs', 'typescript', 'api-development'],
        resources: { cpu: 2, memory: 512 }
      },
      {
        id: 'developer-002',
        name: 'Frontend Developer',
        type: AgentType.CODER,
        capabilities: ['react', 'typescript', 'ui-development'],
        resources: { cpu: 2, memory: 512 }
      },
      {
        id: 'tester-001',
        name: 'QA Engineer',
        type: AgentType.TESTER,
        capabilities: ['unit-testing', 'integration-testing', 'e2e-testing'],
        resources: { cpu: 1, memory: 256 }
      },
      {
        id: 'security-001',
        name: 'Security Analyst',
        type: AgentType.SECURITY,
        capabilities: ['vulnerability-scan', 'penetration-testing', 'compliance-check'],
        resources: { cpu: 2, memory: 512 }
      },
      {
        id: 'devops-001',
        name: 'DevOps Engineer',
        type: AgentType.DEVOPS,
        capabilities: ['ci-cd', 'infrastructure', 'monitoring'],
        resources: { cpu: 2, memory: 512 }
      }
    ];

    const agentManager = new AgentManager();
    for (const config of agentConfigs) {
      await agentManager.createAgent(config);
      await tracedSwarm.spawnAgent(config.type, config.id);
    }

    // 4. Set up monitoring
    spinner.text = 'Configuring monitoring...';
    const monitor = new SwarmMonitor({
      coordinator,
      langfuseEnabled: true,
      alertThresholds: {
        errorRate: 0.1,
        taskQueueSize: 100,
        agentUtilization: 0.9,
        memoryUsage: 0.8
      },
      alertActions: {
        highErrorRate: async () => {
          await slack.sendAlert({
            title: '⚠️ High Error Rate Detected',
            message: 'Error rate exceeded threshold',
            level: 'warning'
          });
        },
        highMemoryUsage: async () => {
          await slack.sendAlert({
            title: '🔴 High Memory Usage',
            message: 'Memory usage critical',
            level: 'error'
          });
        }
      }
    });

    spinner.succeed('Enterprise swarm initialized successfully!');

    // 5. Define complex workflow
    console.log(chalk.yellow('\n📋 Defining enterprise workflow...\n'));

    const tasks: TaskDefinition[] = [
      // Phase 1: Analysis
      {
        id: 'analyze-repos',
        name: 'Analyze Repository Structure',
        type: TaskType.ANALYZE,
        priority: Priority.HIGH,
        assignedAgent: 'analyzer-001',
        input: {
          repositories: ['workflow', 'client-portal', 'admin-dashboard'],
          checks: ['dependencies', 'vulnerabilities', 'code-quality']
        }
      },
      {
        id: 'design-architecture',
        name: 'Design System Architecture',
        type: TaskType.DESIGN,
        priority: Priority.HIGH,
        assignedAgent: 'architect-001',
        input: {
          requirements: ['scalability', 'security', 'performance'],
          constraints: ['budget', 'timeline', 'resources']
        },
        dependencies: ['analyze-repos']
      },
      
      // Phase 2: Development
      {
        id: 'develop-api',
        name: 'Develop REST API',
        type: TaskType.IMPLEMENT,
        priority: Priority.HIGH,
        assignedAgent: 'developer-001',
        input: {
          framework: 'express',
          features: ['authentication', 'authorization', 'data-validation']
        },
        dependencies: ['design-architecture']
      },
      {
        id: 'develop-ui',
        name: 'Develop User Interface',
        type: TaskType.IMPLEMENT,
        priority: Priority.HIGH,
        assignedAgent: 'developer-002',
        input: {
          framework: 'react',
          features: ['responsive', 'accessible', 'performant']
        },
        dependencies: ['design-architecture']
      },
      
      // Phase 3: Testing
      {
        id: 'test-api',
        name: 'Test API Endpoints',
        type: TaskType.TEST,
        priority: Priority.HIGH,
        assignedAgent: 'tester-001',
        input: {
          coverage: 90,
          types: ['unit', 'integration', 'load']
        },
        dependencies: ['develop-api']
      },
      {
        id: 'test-ui',
        name: 'Test User Interface',
        type: TaskType.TEST,
        priority: Priority.HIGH,
        assignedAgent: 'tester-001',
        input: {
          coverage: 85,
          types: ['unit', 'e2e', 'accessibility']
        },
        dependencies: ['develop-ui']
      },
      
      // Phase 4: Security
      {
        id: 'security-scan',
        name: 'Security Vulnerability Scan',
        type: TaskType.SECURITY_SCAN,
        priority: Priority.CRITICAL,
        assignedAgent: 'security-001',
        input: {
          scanTypes: ['SAST', 'DAST', 'dependency-check'],
          compliance: ['OWASP', 'PCI-DSS']
        },
        dependencies: ['test-api', 'test-ui']
      },
      
      // Phase 5: Deployment
      {
        id: 'deploy-staging',
        name: 'Deploy to Staging',
        type: TaskType.DEPLOY,
        priority: Priority.HIGH,
        assignedAgent: 'devops-001',
        input: {
          environment: 'staging',
          strategy: 'blue-green',
          monitoring: true
        },
        dependencies: ['security-scan']
      },
      {
        id: 'deploy-production',
        name: 'Deploy to Production',
        type: TaskType.DEPLOY,
        priority: Priority.CRITICAL,
        assignedAgent: 'devops-001',
        input: {
          environment: 'production',
          strategy: 'canary',
          rollbackEnabled: true
        },
        dependencies: ['deploy-staging']
      }
    ];

    // 6. Execute workflow
    console.log(chalk.green('🚀 Executing enterprise workflow...\n'));

    const orchestrator = new TaskOrchestrator(coordinator, hiveMind);
    
    // Submit all tasks
    for (const task of tasks) {
      await orchestrator.submitTask(task);
    }

    // Start execution
    await coordinator.start();

    // 7. Monitor progress
    let lastProgress = 0;
    const progressInterval = setInterval(async () => {
      const status = await coordinator.getStatus();
      const progress = Math.round(
        (status.completedTasks / status.totalTasks) * 100
      );

      if (progress > lastProgress) {
        console.log(chalk.blue(`\n📊 Progress: ${progress}%`));
        console.log(chalk.gray(`   Active agents: ${status.activeAgents}`));
        console.log(chalk.gray(`   Tasks: ${status.completedTasks}/${status.totalTasks}`));
        console.log(chalk.gray(`   Queue: ${status.queuedTasks}`));
        
        // Send Slack update
        await slack.sendMessage({
          text: `Workflow Progress: ${progress}%`,
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Enterprise Delivery Pipeline*\n` +
                    `Progress: ${progress}%\n` +
                    `Active Agents: ${status.activeAgents}\n` +
                    `Completed: ${status.completedTasks}/${status.totalTasks}`
            }
          }]
        });
        
        lastProgress = progress;
      }
    }, 5000);

    // 8. Wait for completion
    await new Promise(resolve => {
      coordinator.on('complete', async () => {
        clearInterval(progressInterval);
        
        console.log(chalk.green.bold('\n✅ Workflow completed successfully!\n'));
        
        // Get final results
        const results = await coordinator.getResults();
        const report = await tracedSwarm.completeSwarm();
        
        // Create GitHub issue with results
        const issue = await github.createIssue({
          title: 'Enterprise Delivery Pipeline - Completion Report',
          body: `## Pipeline Execution Summary\n\n` +
                `**Duration**: ${report.endTime.getTime() - report.startTime.getTime()}ms\n` +
                `**Total Tasks**: ${report.metrics.totalTasks}\n` +
                `**Success Rate**: ${report.metrics.avgSuccessRate}%\n\n` +
                `### Results\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\``,
          labels: ['automation', 'report']
        });
        
        console.log(chalk.blue(`📝 Report created: ${issue.html_url}`));
        
        // Send final Slack notification
        await slack.sendMessage({
          text: '🎉 Enterprise Delivery Pipeline Completed!',
          blocks: [{
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🎉 Pipeline Completed Successfully!'
            }
          }, {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Duration*: ${Math.round((report.endTime.getTime() - report.startTime.getTime()) / 1000)}s\n` +
                    `*Tasks Completed*: ${report.metrics.totalTasks}\n` +
                    `*Success Rate*: ${report.metrics.avgSuccessRate.toFixed(1)}%\n` +
                    `*Report*: ${issue.html_url}`
            }
          }]
        });
        
        resolve(true);
      });
    });

    // 9. Cleanup
    await coordinator.stop();
    await monitor.stop();
    
    console.log(chalk.gray('\n🏁 Demo completed. Check Langfuse dashboard for detailed traces.'));

  } catch (error) {
    spinner.fail('Error during demo execution');
    console.error(chalk.red(error));
    
    // Report error to GitHub
    await github.createIssue({
      title: `Pipeline Error: ${error.message}`,
      body: `An error occurred during pipeline execution:\n\`\`\`\n${error.stack}\n\`\`\``,
      labels: ['bug', 'automation']
    });
    
    process.exit(1);
  }
}

// Run the demo
if (require.main === module) {
  runEnterpriseDemo()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}