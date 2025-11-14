// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { get_encoding } from 'tiktoken';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "mttc" is now active!');

	// Register the webview view provider
	const provider = new tokenCounteViewProvider();
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('tokenCounteView.content', provider)
	);

	// Keep the command for backward compatibility
	const disposable = vscode.commands.registerCommand('mttc.tokenCounter', () => {
		vscode.window.showInformationMessage('Token Counter from MTTC!');
	});

	context.subscriptions.push(disposable);
}

class tokenCounteViewProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _encoding: any;
	private readonly _expandedGroups = new Set<string>();
	private _filterTerm = '';

	constructor() {
		// Initialize tiktoken with cl100k_base encoding (used by GPT-4, GPT-3.5-turbo)
		this._encoding = get_encoding('cl100k_base');
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true
		};

		webviewView.webview.html = this.getWebviewContent();

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage((message) => {
			switch (message.command) {
				case 'refresh':
					webviewView.webview.html = this.getWebviewContent();
					break;
				case 'filter':
					if (typeof message.value === 'string') {
						this._filterTerm = message.value;
						webviewView.webview.html = this.getWebviewContent();
					}
					break;
				case 'expand':
					if (typeof message.key === 'string') {
						this.expandGroup(webviewView, message.key);
					}
					break;
				case 'collapse':
					if (typeof message.key === 'string') {
						this.collapseGroup(webviewView, message.key);
					}
					break;
				default:
					break;
			}
		});
	}

	private getWebviewContent(): string {
		const groups = this.getToolGroups();
		const filteredGroups = this.applyFilter(groups);
		const totals = this.getGlobalTotals(filteredGroups);
		const overallTotals = this.getGlobalTotals(groups);
		const isFiltered = this._filterTerm.trim().length > 0;
		let serversHtml = '';

		if (filteredGroups.length === 0) {
			const message = isFiltered
				? 'No MCP servers or tools match your filter.'
				: 'No MCP servers or tools found.';
			serversHtml = `<p class="no-tools">${message}</p>`;
		} else {
			for (const group of filteredGroups) {
				const state = this._expandedGroups.has(group.key);
				serversHtml += `
					<div class="server ${group.classification}" data-group="${group.key}">
						<div class="server-header">
							<div>
								<div class="server-name">📦 ${this.escapeHtml(group.label)}</div>
								${group.id && group.id !== group.label ? `<div class="server-id">${this.escapeHtml(group.id)}</div>` : ''}
							</div>
							<span class="badge ${group.classification}">${this.renderClassificationLabel(group.classification)}</span>
						</div>
						<div class="server-stats">
							<span class="stat">🔧 ${group.tools.length} tool${group.tools.length !== 1 ? 's' : ''}</span>
							<span class="stat">🎫 ${group.tokenCount.toLocaleString()} tokens</span>
						</div>
						${this.renderToolList(group, state)}
					</div>
				`;
			}
		}

		const filterValue = this.escapeHtml(this._filterTerm);
		const sourceSummary = isFiltered
			? `${totals.servers}/${overallTotals.servers} sources`
			: `${totals.servers} ${totals.servers === 1 ? 'source' : 'sources'}`;
		const toolSummary = isFiltered
			? `${totals.tools}/${overallTotals.tools} tools`
			: `${totals.tools} total tools`;
		const tokenSummary = isFiltered
			? `${totals.tokens.toLocaleString()}/${overallTotals.tokens.toLocaleString()} tokens`
			: `${totals.tokens.toLocaleString()} tokens across all descriptions`;
		const filterIndicator = isFiltered ? `<span class="filter-indicator">Filter: "${filterValue}"</span>` : '';

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>MCP Servers & Tools</title>
			<style>
				body {
					padding: 10px;
					margin: 0;
					font-family: var(--vscode-font-family);
					font-size: var(--vscode-font-size);
					color: var(--vscode-foreground);
					background-color: var(--vscode-editor-background);
				}
				.summary {
					display: flex;
					gap: 12px;
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
					margin-bottom: 12px;
					flex-wrap: wrap;
				}
				.filter-indicator {
					color: var(--vscode-textLink-foreground);
				}
				.header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					margin-bottom: 16px;
					padding-bottom: 10px;
					border-bottom: 1px solid var(--vscode-panel-border);
				}
				h2 {
					margin: 0;
					color: var(--vscode-foreground);
					font-size: 14px;
					font-weight: 600;
					letter-spacing: 0.3px;
					text-transform: uppercase;
				}
				.refresh-btn {
					background: transparent;
					color: var(--vscode-foreground);
					border: 1px solid var(--vscode-panel-border);
					padding: 4px 8px;
					cursor: pointer;
					border-radius: 3px;
					font-size: 11px;
					display: flex;
					align-items: center;
					gap: 4px;
					transition: all 0.2s;
				}
				.refresh-btn:hover {
					background: var(--vscode-list-hoverBackground);
					border-color: var(--vscode-focusBorder);
				}
				.refresh-icon {
					font-size: 12px;
				}
				.server {
					margin-bottom: 12px;
					border: 1px solid var(--vscode-panel-border);
					border-radius: 4px;
					padding: 14px;
					background: var(--vscode-editor-background);
					transition: background 0.2s;
				}
				.server:hover {
					background: var(--vscode-list-hoverBackground);
				}
				.server-header {
					display: flex;
					justify-content: space-between;
					align-items: flex-start;
					margin-bottom: 8px;
				}
				.server-name {
					color: var(--vscode-textLink-foreground);
					font-size: 15px;
					font-weight: 600;
				}
				.server-id {
					font-size: 11px;
					color: var(--vscode-descriptionForeground);
				}
				.server-stats {
					display: flex;
					gap: 15px;
					flex-wrap: wrap;
				}
				.stat {
					color: var(--vscode-descriptionForeground);
					font-size: 13px;
					background: var(--vscode-editorWidget-background);
					padding: 4px 8px;
					border-radius: 3px;
				}
				.badge {
					font-size: 11px;
					padding: 2px 8px;
					border-radius: 999px;
					text-transform: uppercase;
					letter-spacing: 0.3px;
					border: 1px solid var(--vscode-panel-border);
					color: var(--vscode-descriptionForeground);
				}
				.badge.mcp {
					color: var(--vscode-testing-iconPassed);
					border-color: var(--vscode-testing-iconPassed);
				}
				.badge.extension {
					color: var(--vscode-focusBorder);
					border-color: var(--vscode-focusBorder);
				}
				.badge.builtin {
					color: var(--vscode-descriptionForeground);
				}
				.tool-list {
					margin-top: 10px;
					display: flex;
					flex-direction: column;
					gap: 8px;
				}
				.tool-list--collapsed {
					gap: 6px;
				}
				.tool-preview {
					display: flex;
					flex-wrap: wrap;
					gap: 6px;
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
				}
				.tool-chip {
					background: var(--vscode-editorWidget-background);
					border-radius: 999px;
					padding: 2px 8px;
					font-size: 11px;
					color: var(--vscode-descriptionForeground);
				}
				.tool-row {
					display: flex;
					justify-content: space-between;
					gap: 12px;
					padding-bottom: 6px;
					border-bottom: 1px solid var(--vscode-panel-border);
				}
				.tool-row:last-child {
					border-bottom: none;
					padding-bottom: 0;
				}
				.tool-name {
					font-weight: 600;
				}
				.tool-description {
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
				}
				.tool-meta {
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
					white-space: nowrap;
				}
				.tool-extra {
					text-align: right;
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
				}
				.link-button {
					background: none;
					border: none;
					color: var(--vscode-textLink-foreground);
					cursor: pointer;
					font-size: 12px;
					padding: 0;
					text-decoration: underline;
				}
				.link-button:focus {
					outline: 1px solid var(--vscode-focusBorder);
				}
				.no-tools {
					color: var(--vscode-descriptionForeground);
					font-style: italic;
					text-align: center;
					padding: 20px;
				}
				.filter-bar {
					display: flex;
					gap: 8px;
					margin-bottom: 12px;
				}
				.filter-input {
					flex: 1;
					padding: 6px 8px;
					border-radius: 4px;
					border: 1px solid var(--vscode-panel-border);
					background: var(--vscode-input-background);
					color: var(--vscode-input-foreground);
				}
				.clear-filter {
					border: none;
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
					padding: 6px 10px;
					border-radius: 4px;
					cursor: pointer;
				}
				.clear-filter:hover {
					background: var(--vscode-button-secondaryHoverBackground);
				}
			</style>
		</head>
		<body>
			<div class="summary">
				<span>🧩 ${sourceSummary}</span>
				<span>🔧 ${toolSummary}</span>
				<span>🎫 ${tokenSummary}</span>
				${filterIndicator}
			</div>
			<div class="header">
				<h2>MCP Servers</h2>
				<button class="refresh-btn" onclick="refresh()">
					<span class="refresh-icon">↻</span>
					<span>Refresh</span>
				</button>
			</div>
			<div class="filter-bar">
				<input class="filter-input" type="search" placeholder="Filter servers or tools" value="${filterValue}" oninput="onFilterChange(event)">
				${isFiltered ? '<button class="clear-filter" onclick="clearFilter()">Clear</button>' : ''}
			</div>
			${serversHtml}
			<script>
				const vscode = acquireVsCodeApi();
				function refresh() {
					vscode.postMessage({ command: 'refresh' });
				}
				function toggleGroup(key, expanded) {
					vscode.postMessage({ command: expanded ? 'collapse' : 'expand', key });
				}
				function onFilterChange(event) {
					vscode.postMessage({ command: 'filter', value: event.target.value || '' });
				}
				function clearFilter() {
					vscode.postMessage({ command: 'filter', value: '' });
				}
				document.addEventListener('click', (event) => {
					const target = event.target;
					if (target && target instanceof HTMLElement && target.dataset.action === 'toggle-tools') {
						const key = target.dataset.key;
						if (key) {
							const expanded = target.dataset.state === 'expanded';
							toggleGroup(key, expanded);
						}
					}
				});
				window.addEventListener('message', (event) => {
					const message = event.data;
					if (!message || typeof message !== 'object') {
						return;
					}
					if (message.command === 'updateTools') {
						const section = document.querySelector('.server[data-group="' + message.key + '"]');
						if (!section) {
							return;
						}
						const list = section.querySelector('.tool-list');
						if (!list) {
							return;
						}
						list.innerHTML = message.html;
					}
				});
			</script>
		</body>
		</html>`;
	}

	private escapeHtml(unsafe: string): string {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	private renderToolList(group: ToolGroup, expanded: boolean): string {
		if (group.tools.length === 0) {
			return '<div class="tool-list"><p class="no-tools">No tools registered.</p></div>';
		}

		if (!expanded) {
			const preview = group.tools.slice(0, 3).map(tool => `<span class="tool-chip">${this.escapeHtml(tool.shortName)}</span>`).join('');
			return `
				<div class="tool-list tool-list--collapsed">
					<div class="tool-preview">${preview || 'Tools unavailable'}</div>
					<button class="link-button" data-action="toggle-tools" data-state="collapsed" data-key="${group.key}">
						View all ${group.tools.length} tool${group.tools.length !== 1 ? 's' : ''}
					</button>
				</div>
			`;
		}

		const preview = group.tools.map(tool => `
			<div class="tool-row">
				<div>
					<div class="tool-name">${this.escapeHtml(tool.shortName)}</div>
					<div class="tool-description">${this.escapeHtml(tool.description || 'No description provided')}</div>
				</div>
				<span class="tool-meta">${tool.tokenCount.toLocaleString()} tokens</span>
			</div>
		`).join('');

		const footer = `<div class="tool-extra">
			<button class="link-button" data-action="toggle-tools" data-state="expanded" data-key="${group.key}">Show less</button>
		</div>`;

		return `<div class="tool-list">${preview}${footer}</div>`;
	}

	private renderClassificationLabel(kind: ToolGroupClassification): string {
		switch (kind) {
			case 'mcp':
				return 'MCP Server';
			case 'extension':
				return 'Extension Tool';
			case 'builtin':
				return 'Built-In';
			default:
				return 'Tool Source';
		}
	}

	private getGlobalTotals(groups: ToolGroup[]): { servers: number; tools: number; tokens: number } {
		return groups.reduce((acc, group) => {
			acc.servers += 1;
			acc.tools += group.tools.length;
			acc.tokens += group.tokenCount;
			return acc;
		}, { servers: 0, tools: 0, tokens: 0 });
	}

	private getToolGroups(): ToolGroup[] {
		const toolMap = new Map<string, ToolGroup>();
		for (const tool of vscode.lm.tools) {
			const source = this.resolveToolSource(tool);
			const enriched = this.enrichTool(tool);
			const key = source.id.toLowerCase();
			const entry = toolMap.get(key) ?? { ...source, tools: [], tokenCount: 0, key };
			entry.tools.push(enriched);
			entry.tokenCount += enriched.tokenCount;
			toolMap.set(key, entry);
		}

		return Array.from(toolMap.values())
			.sort((a, b) => {
				if (a.classification !== b.classification) {
					return this.classificationOrder(a.classification) - this.classificationOrder(b.classification);
				}
				if (b.tools.length !== a.tools.length) {
					return b.tools.length - a.tools.length;
				}
				if (b.tokenCount !== a.tokenCount) {
					return b.tokenCount - a.tokenCount;
				}
				return a.label.localeCompare(b.label);
			});
	}

	private applyFilter(groups: ToolGroup[]): ToolGroup[] {
		const term = this._filterTerm.trim().toLowerCase();
		if (!term) {
			return groups;
		}

		return groups.filter(group => {
			const labelMatch = group.label.toLowerCase().includes(term) || group.id.toLowerCase().includes(term);
			if (labelMatch) {
				return true;
			}
			return group.tools.some(tool =>
				tool.shortName.toLowerCase().includes(term) || (tool.description ?? '').toLowerCase().includes(term)
			);
		});
	}

	private expandGroup(view: vscode.WebviewView, key: string): void {
		this._expandedGroups.add(key);
		this.updateGroupSection(view, key);
	}

	private collapseGroup(view: vscode.WebviewView, key: string): void {
		this._expandedGroups.delete(key);
		this.updateGroupSection(view, key);
	}

	private updateGroupSection(view: vscode.WebviewView, key: string): void {
		const group = this.getToolGroupByKey(key);
		if (!group) {
			return;
		}
		const expanded = this._expandedGroups.has(key);
		const html = this.renderToolList(group, expanded);
		view.webview.postMessage({ command: 'updateTools', key, html });
	}

	private getToolGroupByKey(key: string): ToolGroup | undefined {
		return this.getToolGroups().find(group => group.key === key);
	}

	private enrichTool(tool: vscode.LanguageModelToolInformation): EnrichedTool {
		const tokenCount = tool.description ? this._encoding.encode(tool.description).length : 0;
		return {
			info: tool,
			tokenCount,
			shortName: this.humanizeToolName(tool.name),
			description: tool.description ?? ''
		};
	}

	private resolveToolSource(tool: vscode.LanguageModelToolInformation): ToolGroupInfo {
		const fromTags = this.extractSourceFromTags(tool.tags ?? []);
		if (fromTags) {
			return fromTags;
		}
		return this.extractSourceFromName(tool.name);
	}

	private extractSourceFromTags(tags: readonly string[]): ToolGroupInfo | undefined {
		for (const rawTag of tags) {
			const [key, ...rest] = rawTag.split(':');
			if (!rest.length) {
				continue;
			}
			const value = rest.join(':').trim();
			const lowerKey = key.toLowerCase();
			if (!value) {
				continue;
			}
			if (lowerKey === 'server' || lowerKey === 'mcp') {
				return this.createGroupInfo(value, 'mcp');
			}
			if (lowerKey === 'extension' || lowerKey === 'ext') {
				return this.createGroupInfo(value, 'extension');
			}
			if (lowerKey === 'source') {
				const classification = value.toLowerCase().includes('mcp') ? 'mcp' : 'extension';
				return this.createGroupInfo(value, classification);
			}
		}
		return undefined;
	}

	private extractSourceFromName(toolName: string): ToolGroupInfo {
		const normalized = toolName.trim();
		if (!normalized) {
			return this.createGroupInfo('Unknown Source', 'unknown');
		}

		const slash = normalized.lastIndexOf('/');
		if (slash > 0) {
			const prefix = normalized.slice(0, slash);
			return this.createGroupInfo(prefix, this.classifyPrefix(prefix));
		}

		const colon = normalized.indexOf(':');
		if (colon > 0) {
			const prefix = normalized.slice(0, colon);
			return this.createGroupInfo(prefix, this.classifyPrefix(prefix));
		}

		const dot = normalized.indexOf('.');
		if (dot > 0) {
			const prefix = normalized.slice(0, dot);
			return this.createGroupInfo(prefix, this.classifyPrefix(prefix));
		}

		if (normalized.startsWith('mcp_')) {
			const remainder = normalized.slice(4);
			const nextUnderscore = remainder.indexOf('_');
			const server = nextUnderscore > 0 ? remainder.slice(0, nextUnderscore) : remainder;
			return this.createGroupInfo(server, 'mcp');
		}

		const firstUnderscore = normalized.indexOf('_');
		if (firstUnderscore > 0) {
			const prefix = normalized.slice(0, firstUnderscore);
			return this.createGroupInfo(prefix, this.classifyPrefix(prefix));
		}

		return this.createGroupInfo('Built-In Tools', 'builtin');
	}

	private humanizeToolName(name: string): string {
		const trimmed = name.trim();
		if (!trimmed) {
			return 'Unnamed tool';
		}
		const lastSlash = trimmed.lastIndexOf('/');
		const base = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
		return this.formatLabel(base);
	}

	private classifyPrefix(prefix: string): ToolGroupClassification {
		const lower = prefix.toLowerCase();
		if (lower.includes('mcp')) {
			return 'mcp';
		}
		if (lower.includes('copilot') || lower.includes('github') || lower.includes('extension')) {
			return 'extension';
		}
		return 'extension';
	}

	private createGroupInfo(raw: string, classification: ToolGroupClassification): ToolGroupInfo {
		const id = raw || 'Built-In Tools';
		const label = id === 'Built-In Tools' ? id : this.formatLabel(id);
		const normalizedClassification = id === 'Built-In Tools' ? 'builtin' : classification;
		return { id, label, classification: normalizedClassification };
	}

	private formatLabel(value: string): string {
		const cleaned = value
			.replace(/[._-]/g, ' ')
			.replace(/\//g, ' / ')
			.replace(/\s+/g, ' ')
			.trim();
		if (!cleaned) {
			return value;
		}
		return cleaned
			.split(' ')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	private classificationOrder(kind: ToolGroupClassification): number {
		switch (kind) {
			case 'mcp':
				return 0;
			case 'extension':
				return 1;
			case 'builtin':
				return 2;
			default:
				return 3;
		}
	}
}

type ToolGroupClassification = 'mcp' | 'extension' | 'builtin' | 'unknown';

type ToolGroup = ToolGroupInfo & {
	tools: EnrichedTool[];
	tokenCount: number;
	key: string;
};

type ToolGroupInfo = {
	id: string;
	label: string;
	classification: ToolGroupClassification;
};

type EnrichedTool = {
	info: vscode.LanguageModelToolInformation;
	tokenCount: number;
	shortName: string;
	description: string;
};

// This method is called when your extension is deactivated
export function deactivate() {}
