/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import vscode = require('vscode');
import { ExecuteCommandRequest, ExecuteCommandParams } from 'vscode-languageserver-protocol';
import { toolExecutionEnvironment } from './goEnv';
import { promptForMissingTool } from './goInstallTools';
import { getImportablePackages } from './goPackages';
import { getBinPath, getImportPath, parseFilePrelude } from './util';
import { getEnvPath, getCurrentGoRoot } from './utils/pathUtils';
import { GoExtensionContext } from './context';
import { CommandFactory } from './commands';

const missingToolMsg = 'Missing tool: ';

async function golist(goCtx: GoExtensionContext): Promise<string[]> {
	const { languageClient, serverInfo } = goCtx;
	const COMMAND = 'gopls.list_known_packages';
	if (languageClient && serverInfo?.Commands?.includes(COMMAND)) {
		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('No active editor found.');
				return [];
			}
			const uri = languageClient.code2ProtocolConverter.asTextDocumentIdentifier(editor.document).uri;
			const params: ExecuteCommandParams = {
				command: COMMAND,
				arguments: [
					{
						URI: uri
					}
				]
			};
			const resp = await languageClient.sendRequest(ExecuteCommandRequest.type, params);
			return resp.Packages;
		} catch (e) {
			console.log(`error with gopls.list_known_packages: ${e}`);
		}
	}

	return [];
}

async function askUserForImport(goCtx: GoExtensionContext): Promise<string | undefined> {
	try {
		const packages = await golist(goCtx);
		return vscode.window.showQuickPick(packages);
	} catch (err) {
		if (typeof err === 'string' && err.startsWith(missingToolMsg)) {
			promptForMissingTool(err.substr(missingToolMsg.length));
		}
	}
}
export const addImport: CommandFactory = (ctx, goCtx) => (arg: { importPath: string }) => {
	const { languageClient, serverInfo } = goCtx;
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found to add imports.');
		return;
	}
	const p = arg && arg.importPath ? Promise.resolve(arg.importPath) : askUserForImport(goCtx);
	p.then(async (imp) => {
		if (!imp) {
			return;
		}

		const COMMAND = 'gopls.add_import';
		if (languageClient && serverInfo?.Commands?.includes(COMMAND)) {
			try {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					vscode.window.showErrorMessage('No active editor found to determine current package.');
					return [];
				}
				const uri = languageClient.code2ProtocolConverter.asTextDocumentIdentifier(editor.document).uri;
				const params: ExecuteCommandParams = {
					command: COMMAND,
					arguments: [
						{
							ImportPath: imp,
							URI: uri
						}
					]
				};
				await languageClient.sendRequest(ExecuteCommandRequest.type, params);
				return;
			} catch (e) {
				console.log(`error executing gopls.add_import: ${e}`);
			}
		}
	});
};

export const addImportToWorkspace: CommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found to determine current package.');
		return;
	}
	const selection = editor.selection;

	let importPath = '';
	if (!selection.isEmpty) {
		let selectedText = editor.document.getText(selection).trim();
		if (selectedText.length > 0) {
			if (selectedText.indexOf(' ') === -1) {
				// Attempt to load a partial import path based on currently selected text
				if (!selectedText.startsWith('"')) {
					selectedText = '"' + selectedText;
				}
				if (!selectedText.endsWith('"')) {
					selectedText = selectedText + '"';
				}
			}
			importPath = getImportPath(selectedText);
		}
	}

	if (importPath === '') {
		// Failing that use the current line
		const selectedText = editor.document.lineAt(selection.active.line).text;
		importPath = getImportPath(selectedText);
	}

	if (importPath === '') {
		vscode.window.showErrorMessage('No import path to add');
		return;
	}

	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go list" to find the package as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()})`
		);
		return;
	}
	const env = toolExecutionEnvironment();

	cp.execFile(goRuntimePath, ['list', '-f', '{{.Dir}}', importPath], { env }, (err, stdout, stderr) => {
		const dirs = (stdout || '').split('\n');
		if (!dirs.length || !dirs[0].trim()) {
			vscode.window.showErrorMessage(`Could not find package ${importPath}`);
			return;
		}

		const importPathUri = vscode.Uri.file(dirs[0]);

		const existingWorkspaceFolder = vscode.workspace.getWorkspaceFolder(importPathUri);
		if (existingWorkspaceFolder !== undefined) {
			vscode.window.showInformationMessage('Already available under ' + existingWorkspaceFolder.name);
			return;
		}

		vscode.workspace.updateWorkspaceFolders(
			vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
			null,
			{ uri: importPathUri }
		);
	});
};
