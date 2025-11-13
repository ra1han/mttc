import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// Attempt to import available HTTP transports. Different SDK versions expose different names/paths.
let StreamingHttpClientTransport: any; // Newer streaming transport
let HttpClientTransport: any;          // Legacy/basic HTTP transport
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    StreamingHttpClientTransport = require('@modelcontextprotocol/sdk/client/streaming-http.js').StreamingHttpClientTransport;
} catch {
    StreamingHttpClientTransport = undefined;
}
if (!StreamingHttpClientTransport) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        HttpClientTransport = require('@modelcontextprotocol/sdk/client/http.js').HttpClientTransport;
    } catch {
        HttpClientTransport = undefined;
    }
}
import { logger } from './logger';
import { encoding_for_model } from 'tiktoken';

// Initialize tiktoken encoder for GPT-4 (cl100k_base encoding)
const encoder = encoding_for_model('gpt-4');

type TreeItemData = ServerItem | ToolItem | ToolDetailItem;

class ServerItem extends vscode.TreeItem {
    constructor(
        public readonly serverName: string,
        public readonly config: any,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly toolCount?: number,
        public readonly descriptionTokenCount?: number
    ) {
        super(serverName, collapsibleState);
        this.tooltip = `MCP Server: ${serverName}`;
        this.iconPath = new vscode.ThemeIcon('server');
        this.contextValue = 'mcpServer';
        
        // Show token count as description if available
        if (toolCount !== undefined && descriptionTokenCount !== undefined) {
            this.description = `${toolCount} tools, ${descriptionTokenCount} tokens`;
        }
    }
}

class ToolItem extends vscode.TreeItem {
    constructor(
        public readonly toolName: string,
        public readonly toolDescription: string,
        public readonly serverName: string,
        public readonly fullToolData?: any
    ) {
        super(toolName, vscode.TreeItemCollapsibleState.Collapsed);
        this.tooltip = toolDescription || toolName;
        this.description = toolDescription?.substring(0, 60) + (toolDescription?.length > 60 ? '...' : '');
        this.iconPath = new vscode.ThemeIcon('tools');
        this.contextValue = 'mcpTool';
        
        // Add command to view full tool details
        if (fullToolData) {
            this.command = {
                command: 'mcpExtension.viewToolDetails',
                title: 'View Tool Details',
                arguments: [fullToolData]
            };
        }
    }
}

class ToolDetailItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'mcpToolDetail';
    }
}

export class McpServersViewProvider implements vscode.TreeDataProvider<TreeItemData> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItemData | undefined | null | void> = 
        new vscode.EventEmitter<TreeItemData | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItemData | undefined | null | void> = 
        this._onDidChangeTreeData.event;
    
    private serversConfig: Record<string, any> = {};
    private toolsCache: Map<string, any[]> = new Map();

    constructor() {
        this.loadServers();
    }

    refresh(): void {
        this.toolsCache.clear();
        this.loadServers();
        this._onDidChangeTreeData.fire();
    }

    private loadServers(): void {
        const config = vscode.workspace.getConfiguration('mcp').inspect<{ [id: string]: any }>('servers');
        this.serversConfig = { ...config?.globalValue, ...config?.workspaceValue };
        logger.info(`Loaded ${Object.keys(this.serversConfig).length} MCP server(s) for display`);
        
        // Log the full config structure for debugging
        for (const [name, cfg] of Object.entries(this.serversConfig)) {
            logger.info(`Server "${name}" full config:`, JSON.stringify(cfg, null, 2));
        }
    }

    getTreeItem(element: TreeItemData): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
        if (!element) {
            // Root level - show all servers with character counts
            const serverPromises = Object.entries(this.serversConfig).map(async ([name, config]) => {
                const stats = await this.getServerStats(name, config);
                return new ServerItem(name, config, vscode.TreeItemCollapsibleState.None, stats.toolCount, stats.tokenCount);
            });
            return Promise.all(serverPromises);
        } else if (element instanceof ServerItem) {
            // Don't show tools anymore, just the stats in the server item
            return [];
        } else if (element instanceof ToolItem) {
            // Show tool details (description, input schema, etc.)
            return this.getToolDetails(element);
        }
        return [];
    }

    private async getToolsForServer(serverName: string, config: any): Promise<ToolItem[]> {
        // Check cache first
        if (this.toolsCache.has(serverName)) {
            const tools = this.toolsCache.get(serverName)!;
            return tools.map(tool => new ToolItem(tool.name, tool.description, serverName, tool));
        }

        // Get tools from VS Code's registered tools cache (vscode.lm.tools)
        try {
            const allTools = vscode.lm.tools;
            
            // Filter tools that belong to this server
            // MCP tools are prefixed with the server name, e.g., "mcp_servername_toolname"
            const serverTools = allTools.filter(tool => 
                tool.name.startsWith(`mcp_${serverName}_`) || 
                tool.name.startsWith(`${serverName}_`)
            );

            if (serverTools.length > 0) {
                const tools = serverTools.map(tool => ({
                    name: tool.name.replace(`mcp_${serverName}_`, '').replace(`${serverName}_`, ''),
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    tags: tool.tags
                }));
                
                // Count total tokens in tool descriptions
                const totalDescriptionTokens = tools.reduce((sum, tool) => {
                    if (tool.description) {
                        const tokens = encoder.encode(tool.description);
                        return sum + tokens.length;
                    }
                    return sum;
                }, 0);
                
                logger.info(`Server "${serverName}": ${tools.length} tools, ${totalDescriptionTokens} total description tokens`);
                
                this.toolsCache.set(serverName, tools);
                return tools.map(tool => new ToolItem(tool.name, tool.description, serverName, tool));
            }

            // Fallback: try fetching directly from the server
            logger.info(`No tools found in VS Code cache for ${serverName}, attempting direct connection`);
            const tools = await this.fetchToolsFromServer(serverName, config);
            
            // Count total tokens for fallback tools too
            const totalDescriptionTokens = tools.reduce((sum, tool) => {
                if (tool.description) {
                    const tokens = encoder.encode(tool.description);
                    return sum + tokens.length;
                }
                return sum;
            }, 0);
            logger.info(`Server "${serverName}": ${tools.length} tools (from direct fetch), ${totalDescriptionTokens} total description tokens`);
            
            this.toolsCache.set(serverName, tools);
            return tools.map(tool => new ToolItem(tool.name, tool.description, serverName, tool));
        } catch (error) {
            logger.error(`Failed to fetch tools for server ${serverName}:`, error);
            return [new ToolItem('Error loading tools', `${error}`, serverName)];
        }
    }

    private async getServerStats(serverName: string, config: any): Promise<{ toolCount: number; tokenCount: number }> {
        try {
            const tools = await this.getToolsForServer(serverName, config);
            const tokenCount = tools.reduce((sum, tool) => {
                if (tool.toolDescription) {
                    const tokens = encoder.encode(tool.toolDescription);
                    return sum + tokens.length;
                }
                return sum;
            }, 0);
            return { toolCount: tools.length, tokenCount };
        } catch (error) {
            logger.error(`Failed to get stats for server ${serverName}:`, error);
            return { toolCount: 0, tokenCount: 0 };
        }
    }

    private getToolDetails(toolItem: ToolItem): ToolDetailItem[] {
        const details: ToolDetailItem[] = [];
        
        if (!toolItem.fullToolData) {
            return details;
        }

        const tool = toolItem.fullToolData;

        // Description
        if (tool.description) {
            const lines = tool.description.split('\n');
            lines.forEach((line: string, index: number) => {
                if (index === 0) {
                    details.push(new ToolDetailItem('Description', line));
                } else if (line.trim()) {
                    details.push(new ToolDetailItem('', line));
                }
            });
        }

        // Input schema properties
        if (tool.inputSchema?.properties) {
            details.push(new ToolDetailItem('Parameters', ''));
            Object.entries(tool.inputSchema.properties).forEach(([param, schema]: [string, any]) => {
                const required = tool.inputSchema.required?.includes(param) ? ' (required)' : '';
                const type = schema.type ? ` [${schema.type}]` : '';
                const desc = schema.description || 'No description';
                details.push(new ToolDetailItem(`  ${param}${type}${required}`, desc));
            });
        }

        return details;
    }

    private async fetchToolsFromServer(serverName: string, config: any): Promise<any[]> {
        // Check if this is a stdio server (has command) or HTTP server (has url)
        const hasCommand = !!config.command;
        const hasUrl = !!config.url;
        
        logger.info(`Server ${serverName} config:`, JSON.stringify({ hasCommand, hasUrl, type: config.type, command: config.command }));
        
        if (!hasCommand && !hasUrl) {
            logger.warn(`Server ${serverName} has neither command nor url configured`);
            return [{ name: '(Configuration incomplete)', description: 'Server is missing command or url configuration' }];
        }
        
        if (hasUrl) {
            // HTTP server support: prefer streaming transport, fallback to basic HTTP transport.
            const TransportImpl = StreamingHttpClientTransport || HttpClientTransport;
            if (!TransportImpl) {
                logger.warn(`No HTTP transport available for ${serverName}. SDK version: ${require('../package.json').dependencies['@modelcontextprotocol/sdk'] || 'unknown'}`);
                return [{ name: '(HTTP transport unavailable)', description: 'Install newer @modelcontextprotocol/sdk to enable HTTP server tool listing' }];
            }
            try {
                const transport = new TransportImpl({ url: config.url, headers: config.headers || {} });
                const client = new Client({
                    name: 'mcp-audit-extension-inspector',
                    version: '1.0.0'
                }, { capabilities: {} });
                await client.connect(transport);
                const response = await client.listTools();
                const tools = response.tools || [];
                await client.close();
                logger.info(`Fetched ${tools.length} HTTP tool(s) from server ${serverName}`);
                return tools;
            } catch (httpErr) {
                logger.error(`Failed listing HTTP tools for ${serverName}`, httpErr);
                return [{ name: '(HTTP listTools error)', description: String(httpErr) }];
            }
        }

        // This is a stdio server with a command
        try {
            // Create a temporary client connection
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: config.env || {}
            });

            const client = new Client({
                name: 'mcp-audit-extension-inspector',
                version: '1.0.0'
            }, {
                capabilities: {}
            });

            await client.connect(transport);
            
            // List tools
            const response = await client.listTools();
            const tools = response.tools || [];

            // Close the connection
            await client.close();

            logger.info(`Fetched ${tools.length} tool(s) from server ${serverName}`);
            return tools;
        } catch (error) {
            logger.error(`Error connecting to server ${serverName}:`, error);
            throw error;
        }
    }
}
