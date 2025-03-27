/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import path = require('path');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig, getGoplsConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import { diagnosticsStatusBarItem, outputChannel } from './goStatus';
import { goplsStaticcheckEnabled } from './goTools';
import { getWorkspaceFolderPath, handleDiagnosticErrors, ICheckResult, resolvePath, runTool } from './util';

/**
 * Runs linter on the current file, package or workspace.
 */
export function lintCode(scope?: string): CommandFactory {
	return (ctx, goCtx) => () => {
		const editor = vscode.window.activeTextEditor;
		if (scope !== 'workspace') {
			if (!editor) {
				vscode.window.showInformationMessage('No editor is active, cannot find current package to lint');
				return;
			}
			if (editor.document.languageId !== 'go') {
				vscode.window.showInformationMessage(
					'File in the active editor is not a Go file, cannot find current package to lint'
				);
				return;
			}
		}

		const documentUri = editor ? editor.document.uri : undefined;
		const goConfig = getGoConfig(documentUri);
		const goplsConfig = getGoplsConfig(documentUri);

		outputChannel.appendLine('Linting...');
		diagnosticsStatusBarItem.show();
		diagnosticsStatusBarItem.text = 'Linting...';

		goLint(documentUri, goConfig, goplsConfig, scope)
			.then((warnings) => {
				handleDiagnosticErrors(
					goCtx,
					editor ? editor.document : undefined,
					warnings,
					goCtx.lintDiagnosticCollection
				);
				diagnosticsStatusBarItem.hide();
			})
			.catch((err) => {
				vscode.window.showInformationMessage('Error: ' + err);
				diagnosticsStatusBarItem.text = 'Linting Failed';
			});
	};
}

/**
 * Runs linter and presents the output in the 'Go' channel and in the diagnostic collections.
 *
 * @param fileUri Document uri.
 * @param goConfig Configuration for the Go extension.
 * @param scope Scope in which to run the linter.
 */
export function goLint(
	fileUri: vscode.Uri | undefined,
	goConfig: vscode.WorkspaceConfiguration,
	goplsConfig: vscode.WorkspaceConfiguration,
	scope?: string
): Promise<ICheckResult[]> {
	const lintTool = goConfig['lintTool'] || 'staticcheck';
	if (lintTool === 'staticcheck' && goplsStaticcheckEnabled(goConfig, goplsConfig)) {
		return Promise.resolve([]);
	}

	epoch++;
	const closureEpoch = epoch;
	if (tokenSource) {
		if (running) {
			tokenSource.cancel();
		}
		tokenSource.dispose();
	}
	tokenSource = new vscode.CancellationTokenSource();

	const currentWorkspace = getWorkspaceFolderPath(fileUri);

	const cwd = scope === 'workspace' && currentWorkspace ? currentWorkspace : path.dirname(fileUri?.fsPath ?? '');

	if (!path.isAbsolute(cwd)) {
		return Promise.resolve([]);
	}

	const lintFlags: string[] = goConfig['lintFlags'] || [];
	const lintEnv = toolExecutionEnvironment();
	const args: string[] = [];

	lintFlags.forEach((flag) => {
		// --json is not a valid flag for golint and in gometalinter, it is used to print output in json which we dont want
		if (flag === '--json') {
			return;
		}
		if (flag.startsWith('--config=') || flag.startsWith('-config=')) {
			let configFilePath = flag.substr(flag.indexOf('=') + 1).trim();
			if (!configFilePath) {
				return;
			}
			configFilePath = resolvePath(configFilePath);
			args.push(`${flag.substr(0, flag.indexOf('=') + 1)}${configFilePath}`);
			return;
		}
		args.push(flag);
	});

	if (lintTool === 'golangci-lint') {
		if (args.indexOf('run') === -1) {
			args.unshift('run');
		}
		if (args.indexOf('--print-issued-lines=false') === -1) {
			// print only file:number:column
			args.push('--print-issued-lines=false');
		}
		if (args.indexOf('--out-format=colored-line-number') === -1) {
			// print file:number:column.
			// Explicit override in case .golangci.yml calls for a format we don't understand
			args.push('--out-format=colored-line-number');
		}
		if (args.indexOf('--issues-exit-code=') === -1) {
			// adds an explicit no-error-code return argument, to avoid npm error
			// message detection logic. See golang/vscode-go/issues/411
			args.push('--issues-exit-code=0');
		}
	}

	if (lintTool === 'golangci-lint-v2') {
		if (args.indexOf('run') === -1) {
			args.unshift('run');
		}
		if (args.indexOf('--output.text.print-issued-lines') === -1) {
			// print only file:number:column
			args.push('--output.text.print-issued-lines=false');
		}
		if (args.indexOf('--output.text.colors') === -1) {
			// print only file:number:column
			args.push('--output.text.colors=true');
		}
		if (args.indexOf('--show-stats') === -1) {
			// print only file:number:column
			args.push('--show-stats=false');
		}
		if (args.indexOf('--output.text.path') === -1) {
			// print file:number:column.
			// Explicit override in case .golangci.yml calls for a format we don't understand
			args.push('--output.text.path=stdout');
		}
		if (args.indexOf('--issues-exit-code=') === -1) {
			// adds an explicit no-error-code return argument, to avoid npm error
			// message detection logic. See golang/vscode-go/issues/411
			args.push('--issues-exit-code=0');
		}
	}

	if (scope === 'workspace' && currentWorkspace) {
		args.push('./...');
		outputChannel.appendLine(`Starting linting the current workspace at ${currentWorkspace}`);
	} else if (scope === 'file') {
		args.push(fileUri?.fsPath ?? '');
		outputChannel.appendLine(`Starting linting the current file at ${fileUri?.fsPath}`);
	} else {
		outputChannel.appendLine(`Starting linting the current package at ${cwd}`);
	}

	running = true;
	const lintPromise = runTool(args, cwd, 'warning', false, lintTool, lintEnv, false, tokenSource.token).then(
		(result) => {
			if (closureEpoch === epoch) {
				running = false;
			}
			return result;
		}
	);

	return lintPromise;
}

let epoch = 0;
let tokenSource: vscode.CancellationTokenSource;
let running = false;
