# MCP Tools Token Counter

<p align="center">
  <img src="https://raw.githubusercontent.com/ra1han/mttc/refs/heads/main/logo.png" alt="MCP Tools Token Counter Logo" width="128" height="128">
</p>

A VS Code extension that displays all available MCP (Model Context Protocol) servers and calculates the token count of their tool descriptions using tiktoken.

## Features

- **MCP Server Overview**: View all available MCP servers in your VS Code environment
- **Token Counting**: Accurate token count calculation using tiktoken with `cl100k_base` encoding (same as GPT-4/GPT-3.5-turbo)
- **Tool Statistics**: See the number of tools each server provides
- **Activity Bar Integration**: Persistent view accessible from the activity bar
- **Real-time Refresh**: Update counts dynamically as you add or remove MCP servers

## Usage

1. Click the MCP Tools Token Counter icon in the activity bar (left sidebar)
2. The view will display all detected MCP servers with:
   - Server name
   - Number of tools
   - Total token count of all tool descriptions
3. Click the "Refresh" button to update the statistics after configuration changes

## Why Token Counting?

Token counts are more accurate than character counts for understanding the actual usage and cost of language model tool descriptions. This extension helps you:

- Monitor the token usage of your MCP server configurations
- Optimize tool descriptions to reduce token consumption
- Understand the token overhead of different MCP servers

### About Token Encoding

This extension uses the `cl100k_base` tokenizer, which is the encoding used by OpenAI's GPT-4 and GPT-3.5-turbo models. While this encoding is specifically designed for OpenAI models, it provides a reliable estimate for other language model providers as well:

- **Claude (Anthropic)**: Uses a similar BPE-based tokenizer with comparable token counts
- **Gemini (Google)**: Token counts typically within 10-20% of cl100k_base estimates
- **Other Models**: Most modern LLMs use similar tokenization strategies

The `cl100k_base` encoding serves as an industry-standard reference point, giving you a practical estimate of token usage across different model providers, even if not perfectly exact.

## Requirements

- VS Code
- MCP servers configured in your VS Code environment

## Development

### Setup

```bash
npm install
```

### Compile

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Run Extension

Press `F5` to open a new VS Code window with the extension loaded.

## Technical Details

- Uses `vscode.lm.tools` API to detect available language model tools
- Implements webview view provider for persistent sidebar integration
- Token counting powered by tiktoken with `cl100k_base` encoding
- Automatically groups tools by MCP server name

## Release Notes

### 0.0.1

Initial release:
- MCP server detection and grouping
- Token count calculation using tiktoken
- Professional UI with activity bar integration
- Real-time refresh capability
