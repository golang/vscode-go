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
import { URI } from 'vscode-uri';

export class VulncheckResultViewProvider implements vscode.CustomTextEditorProvider {
	public static readonly viewType = 'vulncheck.view';

	public static register({ extensionUri, subscriptions }: vscode.ExtensionContext): VulncheckResultViewProvider {
		const provider = new VulncheckResultViewProvider(extensionUri);
		subscriptions.push(vscode.window.registerCustomEditorProvider(VulncheckResultViewProvider.viewType, provider));
		return provider;
	}

	constructor(private readonly extensionUri: vscode.Uri) {}

	/**
	 * Called when our custom editor is opened.
	 */
	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_: vscode.CancellationToken // eslint-disable-line @typescript-eslint/no-unused-vars
	): Promise<void> {
		// Setup initial content for the webview
		webviewPanel.webview.options = { enableScripts: true };
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Receive message from the webview.
		webviewPanel.webview.onDidReceiveMessage(this.handleMessage);

		function updateWebview() {
			webviewPanel.webview.postMessage({ type: 'update', text: document.getText() });
		}

		// Hook up event handlers so that we can synchronize the webview with the text document.
		//
		// The text document acts as our model, so we have to sync change in the document to our
		// editor and sync changes in the editor back to the document.
		//
		// Remember that a single text document can also be shared between multiple custom
		// editors (this happens for example when you split a custom editor)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});

		updateWebview();
	}

	/**
	 * Get the static html used for the editor webviews.
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
		// Local path to script and css for the webview
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'vulncheckView.js'));
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'vulncheckView.css'));

		// Use a nonce to whitelist which scripts can be run
		const nonce = getNonce();

		return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet" />
				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleMainUri}" rel="stylesheet" />
				<title>Vulnerability Report - govulncheck</title>
			</head>
			<body>
			    <div class="log"></div>
				<div class="vulns"></div>
				
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private handleMessage(e: { type: string; target?: string }): void {
		switch (e.type) {
			case 'open':
				{
					if (!e.target) return;
					const uri = safeURIParse(e.target);
					if (!uri || !uri.scheme) return;
					if (uri.scheme === 'https') {
						vscode.env.openExternal(uri);
					} else if (uri.scheme === 'file') {
						const line = uri.query ? Number(uri.query.split(':')[0]) : undefined;
						const range = line ? new vscode.Range(line, 0, line, 0) : undefined;
						vscode.window.showTextDocument(
							vscode.Uri.from({ scheme: uri.scheme, path: uri.path }),
							// prefer the first column to present the source.
							{ viewColumn: vscode.ViewColumn.One, selection: range }
						);
					}
				}
				return;
			case 'snapshot-result':
				// response for `snapshot-request`.
				return;
			default:
				console.log(`unrecognized type message: ${e.type}`);
		}
	}
}

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
			const start = new Date();
			const vuln = await vulncheck(goCtx, dir, pattern, this.channel);

			if (vuln) {
				// record run info.
				vuln.Start = start;
				vuln.Duration = Date.now() - start.getTime();
				vuln.Dir = dir;
				vuln.Pattern = pattern;
				result = vuln.Vuln
					? vuln.Vuln.map(renderVuln).join('----------------------\n')
					: 'No known vulnerability found.';
			}
		} catch (e) {
			vscode.window.showErrorMessage(`error running vulncheck: ${e}`);
			this.channel.appendLine(`Vulncheck failed: ${e}`);
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
): Promise<VulncheckReport> {
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
	const task = vscode.window.withProgress<VulncheckReport>(options, (progress, token) => {
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

		const promise = new Promise<VulncheckReport>((resolve, reject) => {
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
					const res: VulncheckReport = JSON.parse(buf);
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

interface VulncheckReport {
	// Vulns populated by gopls vulncheck run.
	Vuln?: Vuln[];

	// analysis run information.
	Pattern?: string;
	Dir?: string;

	Start?: Date;
	Duration?: number; // milliseconds
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
	CallStacksSummary?: string[];
}

interface CallStack {
	Name: string;
	URI: string;
	Pos: {
		line: number;
		character: number;
	};
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function safeURIParse(s: string): URI | undefined {
	try {
		return URI.parse(s);
	} catch (_) {
		return undefined;
	}
}
