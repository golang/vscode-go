/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import path from 'path';
import * as vscode from 'vscode';
import { GoExtensionContext } from './context';
import { getBinPath } from './util';
import * as cp from 'child_process';
import { toolExecutionEnvironment } from './goEnv';
import { killProcessTree } from './utils/processUtils';
import * as readline from 'readline';

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

		this.channel.clear();
		this.channel.appendLine(`cd ${dir}; gopls vulncheck ${pattern}`);

		let result = '';
		try {
			const vuln = await vulncheck(goCtx, dir, pattern, this.channel);
			if (vuln) {
				result = vuln.Vuln
					? vuln.Vuln.map(renderVuln).join('----------------------\n')
					: 'No known vulnerability found.';
			}
		} catch (e) {
			vscode.window.showErrorMessage(`error running vulncheck: ${e}`);
		}

		this.channel.appendLine(result);
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

// run `gopls vulncheck`.
export async function vulncheck(
	goCtx: GoExtensionContext,
	dir: string,
	pattern = './...',
	channel: { appendLine: (msg: string) => void }
): Promise<VulncheckResponse> {
	const { languageClient, serverInfo } = goCtx;
	const COMMAND = 'gopls.run_vulncheck_exp';
	if (!languageClient || !serverInfo?.Commands?.includes(COMMAND)) {
		throw Promise.reject('this feature requires gopls v0.8.4 or newer');
	}
	// TODO: read back the actual package configuration from gopls.
	const gopls = getBinPath('gopls');
	const options: vscode.ProgressOptions = {
		cancellable: true,
		title: 'Run govulncheck',
		location: vscode.ProgressLocation.Notification
	};
	const task = vscode.window.withProgress<VulncheckResponse>(options, (progress, token) => {
		const p = cp.spawn(gopls, ['vulncheck', pattern], {
			cwd: dir,
			env: toolExecutionEnvironment(vscode.Uri.file(dir))
		});

		progress.report({ message: `starting command ${gopls} from ${dir}  (pid; ${p.pid})` });

		const d = token.onCancellationRequested(() => {
			channel.appendLine(`gopls vulncheck (pid: ${p.pid}) is cancelled`);
			killProcessTree(p);
			d.dispose();
		});

		const promise = new Promise<VulncheckResponse>((resolve, reject) => {
			const rl = readline.createInterface({ input: p.stderr });
			rl.on('line', (line) => {
				channel.appendLine(line);
				const msg = line.match(/^\d+\/\d+\/\d+\s+\d+:\d+:\d+\s+(.*)/);
				if (msg && msg[1]) {
					progress.report({ message: msg[1] });
				}
			});

			let buf = '';
			p.stdout.on('data', (chunk) => {
				buf += chunk;
			});
			p.stdout.on('close', () => {
				try {
					const res: VulncheckResponse = JSON.parse(buf);
					resolve(res);
				} catch (e) {
					if (token.isCancellationRequested) {
						reject('analysis cancelled');
					} else {
						channel.appendLine(buf);
						reject(`result in unexpected format: ${e}`);
					}
				}
			});
		});
		return promise;
	});
	return await task;
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

interface VulncheckResponse {
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
