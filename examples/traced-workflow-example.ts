/**
 * Traced Workflow Example
 * Demonstrates how to implement a workflow with full Langfuse observability
 * 
 * @author HackingCo Consulting LLC
 */

import { config } from 'dotenv';
import { 
  createTracedWorkflowEngine, 
  WorkflowDefinition,
  WorkflowExecutionOptions,
  TaskDefinition 
} from '../src/core/traced-workflow-engine';
import { 
  initializeObservability, 
  shutdownObservability,
  Trace,
  Span 
} from '../src/observability';

// Load environment variables
config();

/**
 * Example task handlers
 */
class TaskHandlers {
  @Trace({ name: 'ValidateCustomerData', tags: ['validation'] })
  async validateCustomerData(input: any): Promise<any> {
    console.log('Validating customer data:', input);
    
    // Simulate validation logic
    if (!input.email || !input.company) {
      throw new Error('Missing required fields');
    }
    
    // Simulate async operation
    await this.delay(1000);
    
    return {
      ...input,
      validated: true,
      validationScore: 95
    };
  }

  @Trace({ name: 'CheckCompliance', tags: ['compliance', 'external'] })
  async checkCompliance(input: any): Promise<any> {
    console.log('Checking compliance for:', input.company);
    
    // Simulate external API call
    await this.delay(2000);
    
    // Simulate compliance check
    const complianceScore = Math.floor(Math.random() * 20) + 80;
    
    return {
      ...input,
      complianceScore,
      sanctionsCheck: 'clear',
      complianceStatus: complianceScore >= 80 ? 'approved' : 'review_required'
    };
  }

  @Span({ name: 'CreateDatabaseRecord' })
  async createAccount(input: any): Promise<any> {
    console.log('Creating account for:', input.company);
    
    // Simulate database operation
    await this.delay(1500);
    
    return {
      ...input,
      accountId: `acc-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
  }

  @Trace({ name: 'SendNotification', tags: ['notification'] })
  async sendWelcomeEmail(input: any): Promise<any> {
    console.log('Sending welcome email to:', input.email);
    
    // Simulate email sending
    await this.delay(500);
    
    return {
      ...input,
      emailSent: true,
      emailId: `email-${Date.now()}`
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Example workflow definition
 */
function createCustomerOnboardingWorkflow(): WorkflowDefinition {
  const handlers = new TaskHandlers();
  
  return {
    id: 'customer-onboarding',
    name: 'Customer Onboarding Workflow',
    version: '1.0.0',
    description: 'Onboard new enterprise customers with compliance checks',
    
    tasks: [
      {
        id: 'validate',
        name: 'Validate Customer Data',
        type: 'validation',
        handler: handlers.validateCustomerData.bind(handlers),
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialInterval: 1000
        },
        timeout: 5000
      },
      {
        id: 'compliance',
        name: 'Check Compliance',
        type: 'external_api',
        handler: handlers.checkCompliance.bind(handlers),
        dependencies: ['validate'],
        retryPolicy: {
          maxAttempts: 2,
          backoffMultiplier: 3,
          initialInterval: 2000
        },
        timeout: 10000
      },
      {
        id: 'create',
        name: 'Create Account',
        type: 'database',
        handler: handlers.createAccount.bind(handlers),
        dependencies: ['compliance'],
        retryPolicy: {
          maxAttempts: 1
        },
        timeout: 5000
      },
      {
        id: 'notify',
        name: 'Send Welcome Email',
        type: 'notification',
        handler: handlers.sendWelcomeEmail.bind(handlers),
        dependencies: ['create'],
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialInterval: 1000
        },
        timeout: 3000
      }
    ],
    
    metadata: {
      department: 'sales',
      product: 'enterprise',
      sla_hours: 24
    }
  };
}

/**
 * Main execution function
 */
async function main() {
  console.log('Starting Customer Onboarding Workflow Example\n');
  
  try {
    // Initialize observability
    console.log('Initializing observability...');
    await initializeObservability();
    
    // Create workflow definition
    const workflowDef = createCustomerOnboardingWorkflow();
    
    // Create traced workflow engine
    console.log('Creating traced workflow engine...');
    const engine = createTracedWorkflowEngine(workflowDef);
    await engine.initialize();
    
    // Prepare input data
    const customerData = {
      company: 'Acme Corporation',
      email: 'contact@acme.com',
      industry: 'Technology',
      employeeCount: 500,
      country: 'USA',
      requestedFeatures: ['api-access', 'sso', 'advanced-analytics']
    };
    
    // Execution options
    const options: WorkflowExecutionOptions = {
      userId: 'sales-rep-123',
      tenantId: 'tenant-enterprise',
      environment: 'production',
      tags: ['enterprise', 'high-priority'],
      metadata: {
        source: 'sales-portal',
        campaign: 'q4-enterprise-push'
      },
      traceEnabled: true
    };
    
    // Execute workflow
    console.log('\nExecuting workflow with input:', customerData);
    console.log('Execution options:', options);
    console.log('\n--- Workflow Execution Started ---\n');
    
    const startTime = Date.now();
    const result = await engine.execute(customerData, options);
    const duration = Date.now() - startTime;
    
    console.log('\n--- Workflow Execution Completed ---\n');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log(`\nTotal execution time: ${duration}ms`);
    
    // Get metrics
    const metrics = engine.getMetrics();
    console.log('\nWorkflow Metrics:', JSON.stringify(metrics, null, 2));
    
    // Cleanup
    await engine.cleanup();
    
  } catch (error) {
    console.error('\nWorkflow execution failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  } finally {
    // Shutdown observability
    console.log('\nShutting down observability...');
    await shutdownObservability();
    
    console.log('Example completed.');
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main, createCustomerOnboardingWorkflow };