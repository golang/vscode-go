/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import path from 'path';
import { pathToFileURL } from 'url';
import * as vscode from 'vscode';
import { ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { GoExtensionContext } from './context';

export class VulncheckProvider {
	static scheme = 'govulncheck';
	static setup({ subscriptions }: vscode.ExtensionContext, goCtx: GoExtensionContext) {
		const channel = vscode.window.createOutputChannel('govulncheck');
		const instance = new this(channel);
		subscriptions.push(
			vscode.commands.registerCommand('go.vulncheck.run', async () => {
				instance.run(goCtx);
			})
		);
		return instance;
	}

	constructor(private channel: vscode.OutputChannel) {}

	private running = false;

	async run(goCtx: GoExtensionContext) {
		if (this.running) {
			vscode.window.showWarningMessage('another vulncheck is in progress');
			return;
		}
		try {
			this.running = true;
			await this.runInternal(goCtx);
		} finally {
			this.running = false;
		}
	}

	private async runInternal(goCtx: GoExtensionContext) {
		const pick = await vscode.window.showQuickPick(['Current Package', 'Workspace']);
		let dir, pattern: string;
		const document = vscode.window.activeTextEditor?.document;
		switch (pick) {
			case 'Current Package':
				if (!document) {
					vscode.window.showErrorMessage('vulncheck error: no current package');
					return;
				}
				if (document.languageId !== 'go') {
					vscode.window.showErrorMessage(
						'File in the active editor is not a Go file, cannot find current package to check.'
					);
					return;
				}
				dir = path.dirname(document.fileName);
				pattern = '.';
				break;
			case 'Workspace':
				dir = await this.activeDir();
				pattern = './...';
				break;
			default:
				return;
		}
		if (!dir) {
			return;
		}

		let result = '\nNo known vulnerabilities found.';
		try {
			const vuln = await vulncheck(goCtx, dir, pattern);
			if (vuln?.Vuln) {
				result = vuln.Vuln.map(renderVuln).join('----------------------\n');
			}
		} catch (e) {
			if (e instanceof Error) {
				result = e.message;
			}
			vscode.window.showErrorMessage(`error running vulncheck: ${e}`);
		}

		result = `DIR=${dir} govulncheck ${pattern}\n${result}`;
		this.channel.clear();
		this.channel.append(result);
		this.channel.show();
	}

	private async activeDir() {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) return;
		let dir: string | undefined = '';
		if (folders.length === 1) {
			dir = folders[0].uri.path;
		} else {
			const pick = await vscode.window.showQuickPick(
				folders.map((f) => ({ label: f.name, description: f.uri.path }))
			);
			dir = pick?.description;
		}
		return dir;
	}
}

async function vulncheck(
	goCtx: GoExtensionContext,
	dir: string,
	pattern = './...'
): Promise<VulncheckReponse | undefined> {
	const { languageClient, serverInfo } = goCtx;
	const COMMAND = 'gopls.run_vulncheck_exp';
	if (languageClient && serverInfo?.Commands?.includes(COMMAND)) {
		const request = {
			command: COMMAND,
			arguments: [
				{
					Dir: pathToFileURL(dir).toString(),
					Pattern: pattern
				}
			]
		};
		const resp = await languageClient.sendRequest(ExecuteCommandRequest.type, request);
		return resp;
	}
}

const renderVuln = (v: Vuln) => `
ID:               ${v.ID}
Aliases:          ${v.Aliases?.join(', ') ?? 'None'}
Symbol:           ${v.Symbol}
Pkg Path:         ${v.PkgPath}
Mod Path:         ${v.ModPath}
URL:              ${v.URL}
Current Version:  ${v.CurrentVersion}
Fixed Version:    ${v.FixedVersion}

${v.Details}
${renderStack(v)}`;

const renderStack = (v: Vuln) => {
	const content = [];
	for (const stack of v.CallStacks ?? []) {
		for (const [, line] of stack.entries()) {
			content.push(`\t${line.Name}`);
			const loc = renderUri(line);
			if (loc) {
				content.push(`\t\t${loc}`);
			}
		}
		content.push('');
	}
	return content.join('\n');
};

const renderUri = (stack: CallStack) => {
	if (!stack.URI) {
		// generated file or dummy location may not have a file name.
		return '';
	}
	const parsed = vscode.Uri.parse(stack.URI);
	const line = stack.Pos.line + 1; // Position uses 0-based line number.
	const folder = vscode.workspace.getWorkspaceFolder(parsed);
	if (folder) {
		return `${parsed.path}:${line}:${stack.Pos.character}`;
	}
	return `${stack.URI}#${line}:${stack.Pos.character}`;
};

interface VulncheckReponse {
	Vuln?: Vuln[];
}

interface Vuln {
	ID: string;
	Details: string;
	Aliases: string[];
	Symbol: string;
	PkgPath: string;
	ModPath: string;
	URL: string;
	CurrentVersion: string;
	FixedVersion: string;
	CallStacks?: CallStack[][];
}

interface CallStack {
	Name: string;
	URI: string;
	Pos: {
		line: number;
		character: number;
	};
}
