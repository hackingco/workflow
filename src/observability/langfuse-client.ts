/**
 * Langfuse Client Configuration
 * Enterprise-grade observability client for HackingCo workflow framework
 * 
 * @module observability/langfuse-client
 * @author HackingCo Consulting LLC
 */

import { Langfuse } from 'langfuse';
import { config } from 'dotenv';
import winston from 'winston';

// Load environment variables
config();

/**
 * Logger instance for observability module
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Langfuse configuration interface
 */
export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  flushAt?: number;
  flushInterval?: number;
  enabled?: boolean;
  release?: string;
  requestTimeout?: number;
  maxRetries?: number;
}

/**
 * Singleton Langfuse client instance
 */
export class LangfuseClient {
  private static instance: LangfuseClient;
  private client: Langfuse | null = null;
  private config: LangfuseConfig;
  private initialized: boolean = false;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.config = this.loadConfiguration();
  }

  /**
   * Get singleton instance of LangfuseClient
   */
  public static getInstance(): LangfuseClient {
    if (!LangfuseClient.instance) {
      LangfuseClient.instance = new LangfuseClient();
    }
    return LangfuseClient.instance;
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): LangfuseConfig {
    const config: LangfuseConfig = {
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
      secretKey: process.env.LANGFUSE_SECRET_KEY || '',
      baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
      flushAt: parseInt(process.env.LANGFUSE_FLUSH_AT || '15'),
      flushInterval: parseInt(process.env.LANGFUSE_FLUSH_INTERVAL || '10000'),
      enabled: process.env.LANGFUSE_ENABLED !== 'false',
      release: process.env.LANGFUSE_RELEASE || process.env.APP_VERSION || '1.0.0',
      requestTimeout: parseInt(process.env.LANGFUSE_REQUEST_TIMEOUT || '10000'),
      maxRetries: parseInt(process.env.LANGFUSE_MAX_RETRIES || '3')
    };

    if (!config.publicKey || !config.secretKey) {
      logger.warn('Langfuse credentials not found. Observability will be disabled.');
      config.enabled = false;
    }

    return config;
  }

  /**
   * Initialize Langfuse client
   */
  public initialize(): Langfuse | null {
    if (this.initialized && this.client) {
      return this.client;
    }

    if (!this.config.enabled) {
      logger.info('Langfuse observability is disabled');
      return null;
    }

    try {
      this.client = new Langfuse({
        publicKey: this.config.publicKey,
        secretKey: this.config.secretKey,
        baseUrl: this.config.baseUrl,
        flushAt: this.config.flushAt,
        flushInterval: this.config.flushInterval,
        release: this.config.release,
        requestTimeout: this.config.requestTimeout,
        maxRetries: this.config.maxRetries
      });

      this.initialized = true;
      logger.info('Langfuse client initialized successfully', {
        baseUrl: this.config.baseUrl,
        release: this.config.release
      });

      // Set up graceful shutdown
      this.setupGracefulShutdown();

      return this.client;
    } catch (error) {
      logger.error('Failed to initialize Langfuse client', error);
      this.config.enabled = false;
      return null;
    }
  }

  /**
   * Get the Langfuse client instance
   */
  public getClient(): Langfuse | null {
    if (!this.initialized) {
      return this.initialize();
    }
    return this.client;
  }

  /**
   * Check if observability is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }

  /**
   * Flush all pending traces
   */
  public async flush(): Promise<void> {
    if (this.client) {
      try {
        await this.client.flushAsync();
        logger.debug('Langfuse traces flushed successfully');
      } catch (error) {
        logger.error('Failed to flush Langfuse traces', error);
      }
    }
  }

  /**
   * Shutdown the client gracefully
   */
  public async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdownAsync();
        this.client = null;
        this.initialized = false;
        logger.info('Langfuse client shut down successfully');
      } catch (error) {
        logger.error('Failed to shutdown Langfuse client', error);
      }
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = async () => {
      logger.info('Shutting down Langfuse client...');
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
    process.on('exit', () => {
      this.flush().catch((error) => {
        logger.error('Failed to flush traces on exit', error);
      });
    });
  }

  /**
   * Get configuration for debugging
   */
  public getConfig(): Partial<LangfuseConfig> {
    return {
      baseUrl: this.config.baseUrl,
      enabled: this.config.enabled,
      release: this.config.release,
      flushAt: this.config.flushAt,
      flushInterval: this.config.flushInterval
    };
  }
}

// Export singleton instance
export const langfuseClient = LangfuseClient.getInstance();