import { WebClient, WebAPICallResult } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import { App } from '@slack/bolt';
import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface SlackConfig {
  token?: string;
  signingSecret?: string;
  appToken?: string;
  socketMode?: boolean;
  defaultChannel?: string;
}

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
}

export interface SlackNotification {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  fields?: { [key: string]: string };
  actions?: Array<{
    text: string;
    url?: string;
    action_id?: string;
  }>;
}

export class SlackIntegration extends EventEmitter {
  private client: WebClient;
  private app?: App;
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    super();
    this.config = config;

    if (!config.token) {
      throw new Error('Slack token is required');
    }

    // Initialize Web API client
    this.client = new WebClient(config.token);

    // Initialize Bolt app if socket mode is enabled
    if (config.socketMode && config.appToken && config.signingSecret) {
      this.app = new App({
        token: config.token,
        signingSecret: config.signingSecret,
        appToken: config.appToken,
        socketMode: true
      });

      this.setupEventHandlers();
    }
  }

  /**
   * Send a message to Slack
   */
  async sendMessage(message: SlackMessage): Promise<WebAPICallResult> {
    try {
      const result = await this.client.chat.postMessage({
        channel: message.channel || this.config.defaultChannel,
        text: message.text,
        blocks: message.blocks,
        attachments: message.attachments,
        thread_ts: message.thread_ts
      });

      this.emit('message:sent', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Send a notification with predefined formatting
   */
  async sendNotification(
    notification: SlackNotification,
    channel?: string
  ): Promise<WebAPICallResult> {
    const color = this.getColorForType(notification.type);
    const emoji = this.getEmojiForType(notification.type);

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${notification.title}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: notification.message
        }
      }
    ];

    // Add fields if provided
    if (notification.fields) {
      const fieldBlocks = Object.entries(notification.fields).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n${value}`
      }));

      blocks.push({
        type: 'section',
        fields: fieldBlocks
      });
    }

    // Add actions if provided
    if (notification.actions && notification.actions.length > 0) {
      const actionElements = notification.actions.map(action => {
        if (action.url) {
          return {
            type: 'button',
            text: {
              type: 'plain_text',
              text: action.text
            },
            url: action.url
          };
        } else {
          return {
            type: 'button',
            text: {
              type: 'plain_text',
              text: action.text
            },
            action_id: action.action_id || action.text.toLowerCase().replace(/\s+/g, '_')
          };
        }
      });

      blocks.push({
        type: 'actions',
        elements: actionElements
      });
    }

    return this.sendMessage({
      channel: channel || this.config.defaultChannel,
      blocks,
      text: `${notification.title}: ${notification.message}` // Fallback text
    });
  }

  /**
   * Send task status update
   */
  async sendTaskUpdate(task: any, status: string): Promise<WebAPICallResult> {
    const notification: SlackNotification = {
      type: this.getNotificationTypeForStatus(status),
      title: `Task ${status}: ${task.name}`,
      message: `Task execution ${status}`,
      fields: {
        'Task ID': task.id,
        'Type': task.type,
        'Priority': task.priority,
        'Duration': task.duration ? `${task.duration}ms` : 'N/A',
        'Agent': task.assignedAgent || 'Unassigned'
      }
    };

    if (status === 'failed' && task.error) {
      notification.fields['Error'] = task.error.message;
    }

    return this.sendNotification(notification);
  }

  /**
   * Send swarm status update
   */
  async sendSwarmUpdate(swarm: any, event: string): Promise<WebAPICallResult> {
    const notification: SlackNotification = {
      type: 'info',
      title: `Swarm ${event}: ${swarm.name}`,
      message: `Swarm ${swarm.name} has ${event}`,
      fields: {
        'Swarm ID': swarm.id,
        'Type': swarm.type,
        'Active Agents': `${swarm.activeAgents}/${swarm.maxAgents}`,
        'Tasks Pending': swarm.tasksPending?.toString() || '0',
        'Tasks Running': swarm.tasksRunning?.toString() || '0'
      }
    };

    return this.sendNotification(notification);
  }

  /**
   * Send agent status update
   */
  async sendAgentUpdate(agent: any, event: string): Promise<WebAPICallResult> {
    const notification: SlackNotification = {
      type: event === 'online' ? 'success' : 'warning',
      title: `Agent ${event}: ${agent.name}`,
      message: `Agent ${agent.name} is now ${event}`,
      fields: {
        'Agent ID': agent.id,
        'Type': agent.type,
        'Capabilities': agent.capabilities?.join(', ') || 'None',
        'Current Tasks': agent.taskCount?.toString() || '0'
      }
    };

    return this.sendNotification(notification);
  }

  /**
   * Create a progress message that can be updated
   */
  async createProgressMessage(
    title: string,
    channel?: string
  ): Promise<{ ts: string; channel: string; update: (progress: number, status?: string) => Promise<void> }> {
    const initialMessage = await this.sendMessage({
      channel: channel || this.config.defaultChannel,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${title}*\n:hourglass: Starting...`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.createProgressBar(0)
          }
        }
      ]
    });

    const messageTs = initialMessage.ts as string;
    const messageChannel = initialMessage.channel as string;

    const update = async (progress: number, status?: string) => {
      const progressText = this.createProgressBar(progress);
      const statusText = status || `${Math.round(progress)}% complete`;

      await this.client.chat.update({
        channel: messageChannel,
        ts: messageTs,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${title}*\n:hourglass: ${statusText}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: progressText
            }
          }
        ]
      });
    };

    return { ts: messageTs, channel: messageChannel, update };
  }

  /**
   * Send a file to Slack
   */
  async uploadFile(options: {
    channels: string | string[];
    file?: Buffer;
    content?: string;
    filename?: string;
    title?: string;
    initial_comment?: string;
  }): Promise<WebAPICallResult> {
    try {
      const result = await this.client.files.upload({
        channels: Array.isArray(options.channels) 
          ? options.channels.join(',') 
          : options.channels || this.config.defaultChannel,
        file: options.file,
        content: options.content,
        filename: options.filename,
        title: options.title,
        initial_comment: options.initial_comment
      });

      this.emit('file:uploaded', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create an interactive modal
   */
  async openModal(triggerId: string, view: any): Promise<WebAPICallResult> {
    try {
      const result = await this.client.views.open({
        trigger_id: triggerId,
        view
      });

      this.emit('modal:opened', result);
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start the Slack app (for socket mode)
   */
  async start(): Promise<void> {
    if (!this.app) {
      throw new Error('Slack app not initialized. Socket mode configuration required.');
    }

    await this.app.start();
    console.log(chalk.green('⚡️ Slack app is running in socket mode!'));
    this.emit('app:started');
  }

  /**
   * Stop the Slack app
   */
  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      console.log(chalk.yellow('Slack app stopped'));
      this.emit('app:stopped');
    }
  }

  /**
   * Setup event handlers for interactive features
   */
  private setupEventHandlers(): void {
    if (!this.app) return;

    // Handle button clicks
    this.app.action(/.*/, async ({ body, ack, client }) => {
      await ack();
      this.emit('action:received', body);
    });

    // Handle slash commands
    this.app.command(/.*/, async ({ command, ack, respond }) => {
      await ack();
      this.emit('command:received', command);
      
      // Example: /swarm status
      if (command.command === '/swarm') {
        await respond({
          text: 'Processing swarm command...',
          response_type: 'ephemeral'
        });
      }
    });

    // Handle view submissions (modals)
    this.app.view(/.*/, async ({ view, ack }) => {
      await ack();
      this.emit('view:submitted', view);
    });

    // Handle messages
    this.app.message(async ({ message, say }) => {
      this.emit('message:received', message);
    });
  }

  /**
   * Helper method to create progress bar
   */
  private createProgressBar(progress: number): string {
    const total = 20;
    const filled = Math.round((progress / 100) * total);
    const empty = total - filled;
    
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    
    return `\`${filledBar}${emptyBar}\` ${Math.round(progress)}%`;
  }

  /**
   * Get color for notification type
   */
  private getColorForType(type: SlackNotification['type']): string {
    switch (type) {
      case 'success': return '#36a64f';
      case 'warning': return '#ff9900';
      case 'error': return '#ff0000';
      default: return '#4a90e2';
    }
  }

  /**
   * Get emoji for notification type
   */
  private getEmojiForType(type: SlackNotification['type']): string {
    switch (type) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  }

  /**
   * Get notification type for task status
   */
  private getNotificationTypeForStatus(status: string): SlackNotification['type'] {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'cancelled': return 'warning';
      default: return 'info';
    }
  }

  /**
   * Send a formatted report
   */
  async sendReport(title: string, sections: Array<{
    title: string;
    content: string | Array<{ label: string; value: string }>;
  }>, channel?: string): Promise<WebAPICallResult> {
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: title
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Generated at ${new Date().toLocaleString()}`
          }
        ]
      },
      {
        type: 'divider'
      }
    ];

    for (const section of sections) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${section.title}*`
        }
      });

      if (typeof section.content === 'string') {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: section.content
          }
        });
      } else {
        const fields = section.content.map(item => ({
          type: 'mrkdwn',
          text: `*${item.label}:*\n${item.value}`
        }));

        blocks.push({
          type: 'section',
          fields
        });
      }

      blocks.push({
        type: 'divider'
      });
    }

    return this.sendMessage({
      channel: channel || this.config.defaultChannel,
      blocks,
      text: title // Fallback
    });
  }
}

// Export helper functions
export function createSlackIntegration(config: SlackConfig): SlackIntegration {
  return new SlackIntegration(config);
}

// Slack message builder helpers
export const SlackMessageBuilder = {
  /**
   * Create a code block
   */
  codeBlock: (code: string, language?: string): string => {
    return `\`\`\`${language || ''}\n${code}\n\`\`\``;
  },

  /**
   * Create a quote block
   */
  quote: (text: string): string => {
    return text.split('\n').map(line => `> ${line}`).join('\n');
  },

  /**
   * Create a link
   */
  link: (url: string, text?: string): string => {
    return text ? `<${url}|${text}>` : `<${url}>`;
  },

  /**
   * Mention a user
   */
  mention: (userId: string): string => {
    return `<@${userId}>`;
  },

  /**
   * Mention a channel
   */
  channelMention: (channelId: string): string => {
    return `<#${channelId}>`;
  }
};