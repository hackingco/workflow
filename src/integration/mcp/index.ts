import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';

export interface MCPConfig {
  serverUrl: string;
  apiKey?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  timeout?: number;
}

export interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'notification' | 'error';
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPCapability {
  name: string;
  version: string;
  methods: string[];
  description?: string;
}

export interface MCPContext {
  sessionId: string;
  capabilities: MCPCapability[];
  metadata?: any;
}

export class MCPIntegration extends EventEmitter {
  private config: MCPConfig;
  private ws?: WebSocket;
  private connected: boolean = false;
  private reconnecting: boolean = false;
  private messageQueue: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private context?: MCPContext;
  private capabilities: Map<string, MCPCapability> = new Map();

  constructor(config: MCPConfig) {
    super();
    this.config = {
      reconnect: true,
      reconnectInterval: 5000,
      timeout: 30000,
      ...config
    };
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const headers: any = {};
        if (this.config.apiKey) {
          headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        this.ws = new WebSocket(this.config.serverUrl, { headers });

        this.ws.on('open', async () => {
          console.log(chalk.green('Connected to MCP server'));
          this.connected = true;
          this.reconnecting = false;
          this.emit('connected');

          try {
            // Initialize session
            await this.initialize();
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error.message}`));
          }
        });

        this.ws.on('close', (code, reason) => {
          this.connected = false;
          console.log(chalk.yellow(`MCP connection closed: ${code} - ${reason}`));
          this.emit('disconnected', { code, reason });

          if (this.config.reconnect && !this.reconnecting) {
            this.reconnecting = true;
            setTimeout(() => this.reconnect(), this.config.reconnectInterval);
          }
        });

        this.ws.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    this.config.reconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this.connected = false;
    this.context = undefined;
    this.capabilities.clear();
    this.messageQueue.clear();
  }

  /**
   * Initialize MCP session
   */
  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      clientInfo: {
        name: 'swarm-cli',
        version: '1.0.0'
      }
    });

    this.context = response.result;
    
    // Store capabilities
    if (this.context?.capabilities) {
      this.context.capabilities.forEach(cap => {
        this.capabilities.set(cap.name, cap);
      });
    }

    this.emit('initialized', this.context);
  }

  /**
   * Reconnect to MCP server
   */
  private async reconnect(): Promise<void> {
    console.log(chalk.blue('Attempting to reconnect to MCP server...'));
    try {
      await this.connect();
    } catch (error) {
      console.error(chalk.red('Reconnection failed:'), error.message);
      if (this.config.reconnect) {
        setTimeout(() => this.reconnect(), this.config.reconnectInterval);
      }
    }
  }

  /**
   * Send a request to MCP server
   */
  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const message: MCPMessage = {
      id: uuidv4(),
      type: 'request',
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.messageQueue.delete(message.id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.messageQueue.set(message.id, { resolve, reject, timeout });
      
      this.ws?.send(JSON.stringify(message));
      this.emit('request:sent', message);
    });
  }

  /**
   * Send a notification to MCP server
   */
  sendNotification(method: string, params?: any): void {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    const message: MCPMessage = {
      id: uuidv4(),
      type: 'notification',
      method,
      params
    };

    this.ws?.send(JSON.stringify(message));
    this.emit('notification:sent', message);
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: MCPMessage): void {
    this.emit('message:received', message);

    switch (message.type) {
      case 'response':
        this.handleResponse(message);
        break;
      case 'notification':
        this.handleNotification(message);
        break;
      case 'error':
        this.handleError(message);
        break;
    }
  }

  /**
   * Handle response messages
   */
  private handleResponse(message: MCPMessage): void {
    const pending = this.messageQueue.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.messageQueue.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message);
      }
    }
  }

  /**
   * Handle notification messages
   */
  private handleNotification(message: MCPMessage): void {
    this.emit(`notification:${message.method}`, message.params);
  }

  /**
   * Handle error messages
   */
  private handleError(message: MCPMessage): void {
    const error = new Error(message.error?.message || 'Unknown error');
    (error as any).code = message.error?.code;
    (error as any).data = message.error?.data;
    this.emit('error', error);
  }

  /**
   * Check if a capability is supported
   */
  hasCapability(name: string): boolean {
    return this.capabilities.has(name);
  }

  /**
   * Get capability details
   */
  getCapability(name: string): MCPCapability | undefined {
    return this.capabilities.get(name);
  }

  /**
   * List all capabilities
   */
  listCapabilities(): MCPCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    const response = await this.sendRequest('tools/execute', {
      tool: toolName,
      params
    });
    return response.result;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    const response = await this.sendRequest('tools/list');
    return response.result.tools;
  }

  /**
   * Get tool schema
   */
  async getToolSchema(toolName: string): Promise<any> {
    const response = await this.sendRequest('tools/schema', {
      tool: toolName
    });
    return response.result;
  }

  /**
   * Create a resource
   */
  async createResource(resource: any): Promise<any> {
    const response = await this.sendRequest('resources/create', resource);
    return response.result;
  }

  /**
   * Read a resource
   */
  async readResource(resourceId: string): Promise<any> {
    const response = await this.sendRequest('resources/read', {
      id: resourceId
    });
    return response.result;
  }

  /**
   * Update a resource
   */
  async updateResource(resourceId: string, updates: any): Promise<any> {
    const response = await this.sendRequest('resources/update', {
      id: resourceId,
      ...updates
    });
    return response.result;
  }

  /**
   * Delete a resource
   */
  async deleteResource(resourceId: string): Promise<void> {
    await this.sendRequest('resources/delete', {
      id: resourceId
    });
  }

  /**
   * List resources
   */
  async listResources(filter?: any): Promise<any[]> {
    const response = await this.sendRequest('resources/list', filter);
    return response.result.resources;
  }

  /**
   * Subscribe to events
   */
  async subscribe(events: string[]): Promise<void> {
    await this.sendRequest('events/subscribe', { events });
  }

  /**
   * Unsubscribe from events
   */
  async unsubscribe(events: string[]): Promise<void> {
    await this.sendRequest('events/unsubscribe', { events });
  }

  /**
   * Get server info
   */
  async getServerInfo(): Promise<any> {
    const response = await this.sendRequest('server/info');
    return response.result;
  }

  /**
   * Get server status
   */
  async getServerStatus(): Promise<any> {
    const response = await this.sendRequest('server/status');
    return response.result;
  }

  /**
   * Execute a prompt
   */
  async executePrompt(prompt: string, context?: any): Promise<any> {
    const response = await this.sendRequest('prompts/execute', {
      prompt,
      context
    });
    return response.result;
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<any[]> {
    const response = await this.sendRequest('prompts/list');
    return response.result.prompts;
  }

  /**
   * Get prompt details
   */
  async getPrompt(promptId: string): Promise<any> {
    const response = await this.sendRequest('prompts/get', {
      id: promptId
    });
    return response.result;
  }

  /**
   * Create a new session
   */
  async createSession(config?: any): Promise<string> {
    const response = await this.sendRequest('sessions/create', config);
    return response.result.sessionId;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.sendRequest('sessions/end', { sessionId });
  }

  /**
   * Get session info
   */
  async getSession(sessionId: string): Promise<any> {
    const response = await this.sendRequest('sessions/get', { sessionId });
    return response.result;
  }

  /**
   * Execute in context
   */
  async executeInContext(method: string, params: any, context: any): Promise<any> {
    const response = await this.sendRequest('context/execute', {
      method,
      params,
      context
    });
    return response.result;
  }
}

// MCP Protocol helpers
export const MCPProtocol = {
  /**
   * Create a standard MCP error
   */
  createError: (code: number, message: string, data?: any): MCPMessage['error'] => {
    return { code, message, data };
  },

  /**
   * Standard error codes
   */
  ErrorCodes: {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    SERVER_ERROR: -32000,
    NOT_FOUND: -32001,
    UNAUTHORIZED: -32002,
    FORBIDDEN: -32003,
    TIMEOUT: -32004,
    CONFLICT: -32005
  },

  /**
   * Create a request message
   */
  createRequest: (method: string, params?: any): MCPMessage => {
    return {
      id: uuidv4(),
      type: 'request',
      method,
      params
    };
  },

  /**
   * Create a response message
   */
  createResponse: (id: string, result?: any, error?: MCPMessage['error']): MCPMessage => {
    return {
      id,
      type: 'response',
      result,
      error
    };
  },

  /**
   * Create a notification message
   */
  createNotification: (method: string, params?: any): MCPMessage => {
    return {
      id: uuidv4(),
      type: 'notification',
      method,
      params
    };
  }
};

// Export helper functions
export function createMCPIntegration(config: MCPConfig): MCPIntegration {
  return new MCPIntegration(config);
}

// MCP Server implementation helper
export class MCPServer extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<string, { ws: WebSocket; context: any }> = new Map();
  private handlers: Map<string, Function> = new Map();

  constructor(port: number) {
    super();
    this.wss = new WebSocket.Server({ port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      this.clients.set(clientId, { ws, context: {} });
      
      console.log(chalk.green(`MCP client connected: ${clientId}`));
      this.emit('client:connected', clientId);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (error) {
          this.sendError(ws, null, MCPProtocol.ErrorCodes.PARSE_ERROR, 'Invalid JSON');
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(chalk.yellow(`MCP client disconnected: ${clientId}`));
        this.emit('client:disconnected', clientId);
      });

      ws.on('error', (error) => {
        console.error(chalk.red(`Client ${clientId} error:`), error);
        this.emit('client:error', { clientId, error });
      });
    });
  }

  private async handleClientMessage(clientId: string, message: MCPMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      if (message.type === 'request') {
        const handler = this.handlers.get(message.method);
        if (!handler) {
          this.sendError(
            client.ws, 
            message.id, 
            MCPProtocol.ErrorCodes.METHOD_NOT_FOUND, 
            `Method not found: ${message.method}`
          );
          return;
        }

        const result = await handler(message.params, client.context);
        this.sendResponse(client.ws, message.id, result);
      } else if (message.type === 'notification') {
        this.emit(`notification:${message.method}`, {
          clientId,
          params: message.params,
          context: client.context
        });
      }
    } catch (error) {
      this.sendError(
        client.ws,
        message.id,
        MCPProtocol.ErrorCodes.INTERNAL_ERROR,
        error.message
      );
    }
  }

  registerHandler(method: string, handler: Function): void {
    this.handlers.set(method, handler);
  }

  private sendResponse(ws: WebSocket, id: string, result: any): void {
    ws.send(JSON.stringify(MCPProtocol.createResponse(id, result)));
  }

  private sendError(ws: WebSocket, id: string | null, code: number, message: string): void {
    ws.send(JSON.stringify(MCPProtocol.createResponse(
      id || 'error',
      undefined,
      MCPProtocol.createError(code, message)
    )));
  }

  broadcast(method: string, params: any): void {
    const message = MCPProtocol.createNotification(method, params);
    const data = JSON.stringify(message);
    
    this.clients.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  close(): void {
    this.wss.close();
  }
}