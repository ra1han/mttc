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
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.command === 'refresh') {
				webviewView.webview.html = this.getWebviewContent();
			}
		});
	}

	private getWebviewContent(): string {
		const groups = this.getToolGroups();
		let serversHtml = '';

		if (groups.length === 0) {
			serversHtml = '<p class="no-tools">No MCP servers or tools found.</p>';
		} else {
			for (const group of groups) {
				serversHtml += `
					<div class="server">
						<div class="server-name">📦 ${this.escapeHtml(group.source)}</div>
						<div class="server-stats">
							<span class="stat">🔧 ${group.tools.length} tool${group.tools.length !== 1 ? 's' : ''}</span>
							<span class="stat">🎫 ${group.tokenCount.toLocaleString()} tokens</span>
						</div>
					</div>
				`;
			}
		}

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
				.server-name {
					color: var(--vscode-textLink-foreground);
					font-size: 15px;
					font-weight: 600;
					margin-bottom: 8px;
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
				.no-tools {
					color: var(--vscode-descriptionForeground);
					font-style: italic;
					text-align: center;
					padding: 20px;
				}
			</style>
		</head>
		<body>
			<div class="header">
				<h2>MCP Servers</h2>
				<button class="refresh-btn" onclick="refresh()">
					<span class="refresh-icon">↻</span>
					<span>Refresh</span>
				</button>
			</div>
			${serversHtml}
			<script>
				const vscode = acquireVsCodeApi();
				function refresh() {
					vscode.postMessage({ command: 'refresh' });
				}
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

	private getToolGroups(): { source: string; tools: vscode.LanguageModelToolInformation[]; tokenCount: number }[] {
		const toolMap = new Map<string, { tools: vscode.LanguageModelToolInformation[]; tokenCount: number }>();
		for (const tool of vscode.lm.tools) {
			const sourceLabel = this.deriveToolSource(tool.name);
			const entry = toolMap.get(sourceLabel) ?? { tools: [], tokenCount: 0 };
			entry.tools.push(tool);
			if (tool.description) {
				entry.tokenCount += this._encoding.encode(tool.description).length;
			}
			toolMap.set(sourceLabel, entry);
		}

		return Array.from(toolMap.entries())
			.map(([source, data]) => ({ source, ...data }))
			.sort((a, b) => {
				if (b.tools.length !== a.tools.length) {
					return b.tools.length - a.tools.length;
				}
				if (b.tokenCount !== a.tokenCount) {
					return b.tokenCount - a.tokenCount;
				}
				return a.source.localeCompare(b.source);
			});
	}

	private deriveToolSource(toolName: string): string {
		const normalized = toolName.trim();
		if (!normalized) {
			return 'Unknown Tool Source';
		}

		const slashIndex = normalized.lastIndexOf('/');
		if (slashIndex > 0) {
			return normalized.slice(0, slashIndex);
		}

		const colonIndex = normalized.indexOf(':');
		if (colonIndex > 0) {
			return normalized.slice(0, colonIndex);
		}

		const dotIndex = normalized.indexOf('.');
		if (dotIndex > 0) {
			return normalized.slice(0, dotIndex);
		}

		return 'Built-In Tools';
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
