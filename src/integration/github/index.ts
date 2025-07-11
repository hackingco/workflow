import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface GitHubConfig {
  token?: string;
  appId?: string;
  privateKey?: string;
  installationId?: number;
  owner: string;
  repo: string;
  baseUrl?: string;
}

export interface IssueData {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface PullRequestData {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export class GitHubIntegration extends EventEmitter {
  private octokit: Octokit;
  private config: GitHubConfig;
  private webhookHandler?: any;

  constructor(config: GitHubConfig) {
    super();
    this.config = config;

    // Initialize Octokit based on authentication method
    if (config.token) {
      // Personal access token authentication
      this.octokit = new Octokit({
        auth: config.token,
        baseUrl: config.baseUrl
      });
    } else if (config.appId && config.privateKey && config.installationId) {
      // GitHub App authentication
      this.octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: config.appId,
          privateKey: config.privateKey,
          installationId: config.installationId
        },
        baseUrl: config.baseUrl
      });
    } else {
      throw new Error('GitHub authentication credentials required');
    }
  }

  /**
   * Create a new issue
   */
  async createIssue(data: IssueData): Promise<any> {
    try {
      const response = await this.octokit.issues.create({
        owner: this.config.owner,
        repo: this.config.repo,
        ...data
      });

      this.emit('issue:created', response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueNumber: number, data: Partial<IssueData>): Promise<any> {
    try {
      const response = await this.octokit.issues.update({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        ...data
      });

      this.emit('issue:updated', response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(data: PullRequestData): Promise<any> {
    try {
      const response = await this.octokit.pulls.create({
        owner: this.config.owner,
        repo: this.config.repo,
        ...data
      });

      this.emit('pr:created', response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Comment on an issue or pull request
   */
  async createComment(issueNumber: number, body: string): Promise<any> {
    try {
      const response = await this.octokit.issues.createComment({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: issueNumber,
        body
      });

      this.emit('comment:created', response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Trigger a workflow dispatch
   */
  async triggerWorkflow(workflowId: string, ref: string = 'main', inputs?: any): Promise<void> {
    try {
      await this.octokit.actions.createWorkflowDispatch({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: workflowId,
        ref,
        inputs
      });

      this.emit('workflow:triggered', { workflowId, ref, inputs });
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get workflow runs
   */
  async getWorkflowRuns(workflowId?: string, options?: any): Promise<WorkflowRun[]> {
    try {
      const params: any = {
        owner: this.config.owner,
        repo: this.config.repo,
        ...options
      };

      if (workflowId) {
        params.workflow_id = workflowId;
      }

      const response = await this.octokit.actions.listWorkflowRuns(params);
      return response.data.workflow_runs;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get workflow run status
   */
  async getWorkflowRunStatus(runId: number): Promise<WorkflowRun> {
    try {
      const response = await this.octokit.actions.getWorkflowRun({
        owner: this.config.owner,
        repo: this.config.repo,
        run_id: runId
      });

      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create a release
   */
  async createRelease(tagName: string, options?: any): Promise<any> {
    try {
      const response = await this.octokit.repos.createRelease({
        owner: this.config.owner,
        repo: this.config.repo,
        tag_name: tagName,
        ...options
      });

      this.emit('release:created', response.data);
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(): Promise<any> {
    try {
      const response = await this.octokit.repos.get({
        owner: this.config.owner,
        repo: this.config.repo
      });

      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Search issues and pull requests
   */
  async searchIssues(query: string, options?: any): Promise<any[]> {
    try {
      const q = `${query} repo:${this.config.owner}/${this.config.repo}`;
      const response = await this.octokit.search.issuesAndPullRequests({
        q,
        ...options
      });

      return response.data.items;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup webhook handler
   */
  async setupWebhooks(secret: string, port: number = 3000): Promise<void> {
    const { createNodeMiddleware, Webhooks } = await import('@octokit/webhooks');
    const express = await import('express');
    
    const webhooks = new Webhooks({
      secret
    });

    // Register webhook handlers
    webhooks.on('issues.opened', ({ payload }) => {
      this.emit('webhook:issue:opened', payload);
    });

    webhooks.on('issues.closed', ({ payload }) => {
      this.emit('webhook:issue:closed', payload);
    });

    webhooks.on('pull_request.opened', ({ payload }) => {
      this.emit('webhook:pr:opened', payload);
    });

    webhooks.on('pull_request.merged', ({ payload }) => {
      this.emit('webhook:pr:merged', payload);
    });

    webhooks.on('workflow_run.completed', ({ payload }) => {
      this.emit('webhook:workflow:completed', payload);
    });

    // Create Express app
    const app = express.default();
    app.use(createNodeMiddleware(webhooks));

    // Start server
    const server = app.listen(port, () => {
      console.log(chalk.green(`GitHub webhook server listening on port ${port}`));
    });

    this.webhookHandler = { webhooks, server };
  }

  /**
   * Stop webhook handler
   */
  async stopWebhooks(): Promise<void> {
    if (this.webhookHandler?.server) {
      await new Promise((resolve) => {
        this.webhookHandler.server.close(resolve);
      });
      console.log(chalk.yellow('GitHub webhook server stopped'));
    }
  }

  /**
   * Create issue from task failure
   */
  async createIssueFromTaskFailure(task: any, error: Error): Promise<any> {
    const issueData: IssueData = {
      title: `Task Failed: ${task.name}`,
      body: `## Task Failure Report\n\n` +
            `**Task ID:** ${task.id}\n` +
            `**Task Type:** ${task.type}\n` +
            `**Priority:** ${task.priority}\n` +
            `**Failed At:** ${new Date().toISOString()}\n\n` +
            `### Error Details\n\n` +
            `\`\`\`\n${error.message}\n\`\`\`\n\n` +
            `### Stack Trace\n\n` +
            `\`\`\`\n${error.stack}\n\`\`\`\n\n` +
            `### Task Configuration\n\n` +
            `\`\`\`json\n${JSON.stringify(task.data, null, 2)}\n\`\`\``,
      labels: ['bug', 'task-failure', `priority-${task.priority}`]
    };

    return this.createIssue(issueData);
  }

  /**
   * Create pull request for automated changes
   */
  async createAutomatedPullRequest(
    branch: string,
    changes: string[],
    taskId: string
  ): Promise<any> {
    const prData: PullRequestData = {
      title: `Automated Changes from Task ${taskId}`,
      body: `## Automated Changes\n\n` +
            `This pull request was automatically created by task execution.\n\n` +
            `**Task ID:** ${taskId}\n` +
            `**Generated At:** ${new Date().toISOString()}\n\n` +
            `### Changes Made\n\n` +
            changes.map(change => `- ${change}`).join('\n') +
            `\n\n---\n\n` +
            `*This PR was automatically generated. Please review carefully before merging.*`,
      head: branch,
      base: 'main',
      draft: true,
      labels: ['automated', 'needs-review']
    };

    return this.createPullRequest(prData);
  }

  /**
   * Monitor workflow execution
   */
  async monitorWorkflow(
    runId: number,
    callback: (status: WorkflowRun) => void,
    interval: number = 5000
  ): Promise<void> {
    const checkStatus = async () => {
      const status = await this.getWorkflowRunStatus(runId);
      callback(status);

      if (status.status === 'completed') {
        clearInterval(intervalId);
        this.emit('workflow:completed', status);
      }
    };

    const intervalId = setInterval(checkStatus, interval);
    await checkStatus(); // Initial check
  }

  /**
   * Get rate limit information
   */
  async getRateLimit(): Promise<any> {
    try {
      const response = await this.octokit.rateLimit.get();
      return response.data;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}

// Export helper functions
export function createGitHubIntegration(config: GitHubConfig): GitHubIntegration {
  return new GitHubIntegration(config);
}

export function formatWorkflowStatus(status: string, conclusion?: string): string {
  if (status === 'completed') {
    switch (conclusion) {
      case 'success':
        return chalk.green('✓ Success');
      case 'failure':
        return chalk.red('✗ Failed');
      case 'cancelled':
        return chalk.gray('⊘ Cancelled');
      default:
        return chalk.yellow('? Unknown');
    }
  }
  
  switch (status) {
    case 'queued':
      return chalk.gray('⏳ Queued');
    case 'in_progress':
      return chalk.blue('🔄 Running');
    default:
      return status;
  }
}