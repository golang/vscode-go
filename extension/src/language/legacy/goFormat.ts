/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import path = require('path');
import vscode = require('vscode');
import { getGoConfig } from '../../config';
import { toolExecutionEnvironment } from '../../goEnv';
import { promptForMissingTool, promptForUpdatingTool } from '../../goInstallTools';
import { getBinPath } from '../../util';
import { killProcessTree } from '../../utils/processUtils';
import { resolvePath } from '../../util';

/**
 * GoDocumentFormattingEditProvider is a feature that provides formatting
 * functionality. It is only used when the user has configured a formatter in
 * the "go.formatTool" setting.
 *
 * By default, the Go extension uses the language server (gopls) to provide
 * formatting, so this class is not instantiated.
 */
export class GoDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
	public provideDocumentFormattingEdits(
		document: vscode.TextDocument,
		options: vscode.FormattingOptions,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.TextEdit[]> {
		if (vscode.window.visibleTextEditors.every((e) => e.document.fileName !== document.fileName)) {
			return [];
		}

		const filename = document.fileName;
		const goConfig = getGoConfig(document.uri);
		const formatFlags = goConfig.get<string[]>('formatFlags') ?? [];

		// Ignore -w because we don't want to write directly to disk.
		if (formatFlags.indexOf('-w') > -1) {
			formatFlags.splice(formatFlags.indexOf('-w'), 1);
		}

		const formatTool = getFormatTool(goConfig);

		// Handle issues:
		//  https://github.com/Microsoft/vscode-go/issues/613
		//  https://github.com/Microsoft/vscode-go/issues/630
		if (formatTool === 'goimports' || formatTool === 'goreturns') {
			formatFlags.push('-srcdir', filename);
		}

		// Since goformat supports the style flag, set tabsize if the user hasn't.
		if (formatTool === 'goformat' && formatFlags.length === 0 && options.insertSpaces) {
			formatFlags.push('-style=indent=' + options.tabSize);
		}

		const resolvedFormatFlags: string[] = [];
		formatFlags.forEach((flag) => {
			// Ensure that flags like --config=${workspaceFolder} are resolved before their use.
			if (flag.startsWith('--config=') || flag.startsWith('-config=')) {
				let configFilePath = flag.substring(flag.indexOf('=') + 1).trim();
				if (!configFilePath) {
					return;
				}
				configFilePath = resolvePath(configFilePath);
				resolvedFormatFlags.push(`${flag.substring(0, flag.indexOf('=') + 1)}${configFilePath}`);
				return;
			}
			resolvedFormatFlags.push(flag);
		});

		return this.runFormatter(formatTool, resolvedFormatFlags, document, token).then(
			(edits) => edits,
			(err) => {
				if (typeof err === 'string' && err.startsWith('flag provided but not defined: -srcdir')) {
					promptForUpdatingTool(formatTool);
					return Promise.resolve([]);
				}
				if (err) {
					// TODO(hyangah): investigate why this console.log is not visible at all in dev console.
					// Ideally, this error message should be accessible through one of the output channels.
					console.log(err);
					return Promise.reject(
						`Check the console in dev tools to find errors when formatting with ${formatTool}`
					);
				}
			}
		);
	}

	private runFormatter(
		formatTool: string,
		formatFlags: string[],
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Thenable<vscode.TextEdit[]> {
		const formatCommandBinPath = getBinPath(formatTool);
		if (!path.isAbsolute(formatCommandBinPath)) {
			// executable not found.
			promptForMissingTool(formatTool);
			return Promise.reject('failed to find tool ' + formatTool);
		}
		return new Promise<vscode.TextEdit[]>((resolve, reject) => {
			const env = toolExecutionEnvironment();
			const cwd = path.dirname(document.fileName);
			let stdout = '';
			let stderr = '';

			// Use spawn instead of exec to avoid maxBufferExceeded error
			const p = cp.spawn(formatCommandBinPath, formatFlags, { env, cwd });
			token.onCancellationRequested(() => !p.killed && killProcessTree(p));
			p.stdout.setEncoding('utf8');
			p.stdout.on('data', (data) => (stdout += data));
			p.stderr.on('data', (data) => (stderr += data));
			p.on('error', (err) => {
				if (err && (<any>err).code === 'ENOENT') {
					promptForMissingTool(formatTool);
					return reject(`failed to find format tool: ${formatTool}`);
				}
			});
			p.on('close', (code) => {
				if (code !== 0) {
					return reject(stderr);
				}

				// Return the complete file content in the edit.
				// VS Code will calculate minimal edits to be applied
				const fileStart = new vscode.Position(0, 0);
				const fileEnd = document.lineAt(document.lineCount - 1).range.end;
				const textEdits: vscode.TextEdit[] = [
					new vscode.TextEdit(new vscode.Range(fileStart, fileEnd), stdout)
				];
				return resolve(textEdits);
			});
			if (p.pid) {
				p.stdin.end(document.getText());
			}
		});
	}
}

/**
 * getFormatTool returns the formatter tool configured through the "go.formatTool"
 * setting.
 *
 * If "go.formatTool" is set to "custom", it returns "customFormatter". User
 * should specify "customFormatter" in setting "go.alternateTools".
 *
 * If "go.formatTool" is not set, it returns an empty string, indicating that
 * no specific format tool is selected and gopls should be used.
 */
export function getFormatTool(goConfig: vscode.WorkspaceConfiguration): string {
	const formatTool = goConfig.get<string>('formatTool');

	if (formatTool === undefined || formatTool === 'default') {
		return ''; // not specified, yield to gopls by return empty string.
	}
	if (formatTool === 'custom') {
		return 'customFormatter';
	}
	return formatTool;
}
