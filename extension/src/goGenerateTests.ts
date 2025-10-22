/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable eqeqeq */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import path = require('path');
import vscode = require('vscode');
import { getGoConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import { promptForMissingTool } from './goInstallTools';
import { GoDocumentSymbolProvider } from './goDocumentSymbols';
import { outputChannel } from './goStatus';
import { getBinPath, resolvePath } from './util';
import { CommandFactory } from './commands';
import { GoExtensionContext } from './context';
import { TelemetryKey, telemetryReporter } from './goTelemetry';
import { getFromGlobalState, updateGlobalState } from './stateUtils';

const generatedWord = 'Generated ';

export const COMMAND = 'gopls.add_test';

/**
 * If current active editor has a Go file, returns the editor.
 */
function checkActiveEditor(): vscode.TextEditor | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('Cannot generate unit tests. No editor selected.');
		return;
	}
	if (!editor.document.fileName.endsWith('.go')) {
		vscode.window.showInformationMessage('Cannot generate unit tests. File in the editor is not a Go file.');
		return;
	}
	if (editor.document.isDirty) {
		vscode.window.showInformationMessage('File has unsaved changes. Save and try again.');
		return;
	}
	return editor;
}

/**
 * Toggles between file in current active editor and the corresponding test file.
 */
export const toggleTestFile: CommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('Cannot toggle test file. No editor selected.');
		return;
	}
	const currentFilePath = editor.document.fileName;
	if (!currentFilePath.endsWith('.go')) {
		vscode.window.showInformationMessage('Cannot toggle test file. File in the editor is not a Go file.');
		return;
	}
	let targetFilePath = '';
	if (currentFilePath.endsWith('_test.go')) {
		targetFilePath = currentFilePath.substr(0, currentFilePath.lastIndexOf('_test.go')) + '.go';
	} else {
		targetFilePath = currentFilePath.substr(0, currentFilePath.lastIndexOf('.go')) + '_test.go';
	}
	for (const doc of vscode.window.visibleTextEditors) {
		if (doc.document.fileName === targetFilePath) {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFilePath), doc.viewColumn);
			return;
		}
	}
	vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetFilePath));
};

export const generateTestCurrentPackage: CommandFactory = (ctx, goCtx) => (uri: vscode.Uri) => {
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_COMMAND_PALETTE, 1);
	}

	const editor = checkActiveEditor();
	if (!editor) {
		return false;
	}
	return generateTests(
		ctx,
		goCtx,
		{
			dir: path.dirname(editor.document.uri.fsPath),
			isTestFile: editor.document.fileName.endsWith('_test.go')
		},
		getGoConfig(editor.document.uri)
	);
};

export const generateTestCurrentFile: CommandFactory = (ctx, goCtx) => (uri: vscode.Uri) => {
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_COMMAND_PALETTE, 1);
	}

	const editor = checkActiveEditor();
	if (!editor) {
		return false;
	}

	return generateTests(
		ctx,
		goCtx,
		{
			dir: editor.document.uri.fsPath,
			isTestFile: editor.document.fileName.endsWith('_test.go')
		},
		getGoConfig(editor.document.uri)
	);
};

/**
 * Generates a test for the selected function using 'gopls.add_test'.
 */
export const goplsGenerateTest: CommandFactory = (_, goCtx) => async (uri: vscode.Uri) => {
	// When invoked from command palette, the input uri is undefined.
	// When invoked from an editor, the URI of the document is passed in to the
	// function.
	// https://code.visualstudio.com/api/references/contribution-points#contributes.menus
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_ADD_TEST_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOPLS_ADD_TEST_COMMAND_PALETTE, 1);
	}
	if (!goCtx.serverInfo?.Commands?.includes(COMMAND)) {
		vscode.window.showWarningMessage(`Please upgrade gopls to use the '${COMMAND}' command`);
		return;
	}

	const editor = checkActiveEditor();
	if (!editor) {
		return;
	}

	await vscode.commands.executeCommand(COMMAND, {
		URI: editor.document.uri.toString(),
		range: editor.selection
	});
};

export const generateTestCurrentFunction: CommandFactory = (ctx, goCtx) => async (uri: vscode.Uri) => {
	if (uri) {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_CONTEXT_MENU, 1);
	} else {
		telemetryReporter.add(TelemetryKey.COMMAND_TRIGGER_GOTESTS_COMMAND_PALETTE, 1);
	}

	const editor = checkActiveEditor();
	if (!editor) {
		return false;
	}

	const functions = await getFunctions(goCtx, editor.document);
	const selection = editor.selection;
	const currentFunction = functions.find((func) => selection && func.range.contains(selection.start));

	if (!currentFunction) {
		vscode.window.showInformationMessage('No function found at cursor.');
		return Promise.resolve(false);
	}
	let funcName = currentFunction.name;
	const funcNameParts = funcName.match(/^\(\*?(.*)\)\.(.*)$/);
	if (funcNameParts != null && funcNameParts.length === 3) {
		// receiver type specified
		const rType = funcNameParts[1].replace(/^\w/, (c) => c.toUpperCase());
		const fName = funcNameParts[2].replace(/^\w/, (c) => c.toUpperCase());
		funcName = rType + fName;
	}

	return generateTests(
		ctx,
		goCtx,
		{
			dir: editor.document.uri.fsPath,
			func: funcName,
			isTestFile: editor.document.fileName.endsWith('_test.go')
		},
		getGoConfig(editor.document.uri)
	);
};

/**
 * Input to goTests.
 */
interface Config {
	/**
	 * The working directory for `gotests`.
	 */
	dir: string;
	/**
	 * Specific function names to generate tests skeleton.
	 */
	func?: string;

	/**
	 * Whether or not the file to generate test functions for is a test file.
	 */
	isTestFile?: boolean;
}

/**
 * THIRD_PARTY_TOOL_SUGGESTION_PREFIX_KEY is the prefix of key storing whether
 * we have suggested user to provide feedbacks about gopls's source code actions.
 */
export const THIRD_PARTY_TOOL_SUGGESTION_PREFIX_KEY = 'third-party-tool-suggested-';

export async function promptForFeedback(tool: string) {
	let command: string;
	if (tool === 'gotests') {
		command = 'add_test';
	} else if (tool === 'gomodifytags') {
		command = 'modify_tags';
	} else {
		return;
	}

	const suggested: Boolean = getFromGlobalState(THIRD_PARTY_TOOL_SUGGESTION_PREFIX_KEY + tool, false);
	if (suggested) {
		return;
	}
	updateGlobalState(THIRD_PARTY_TOOL_SUGGESTION_PREFIX_KEY + tool, true);

	const message = `It looks like you are using legacy tool "${tool}". Do you know gopls offers the same functionality builtin to gopls through the context menu, the command palette, or source code actions? Would you be willing to tell us why you choose the legacy tools, so that we can improve gopls?`;

	const selected = await vscode.window.showWarningMessage(message, 'Yes', 'No');

	if (selected === undefined || selected === 'No') {
		return;
	}

	await vscode.env.openExternal(
		vscode.Uri.parse(
			`https://github.com/golang/go/issues/new?title=x%2Ftools%2Fgopls%3A+${command}+source+code+action+feedback&labels=tools,gopls`
		)
	);
}

function generateTests(
	ctx: vscode.ExtensionContext,
	goCtx: GoExtensionContext,
	conf: Config,
	goConfig: vscode.WorkspaceConfiguration
): Promise<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		telemetryReporter.add(TelemetryKey.TOOL_USAGE_GOTESTS, 1);

		if (goConfig.get('useLanguageServer') === 'true') {
			promptForFeedback('gotests');
		}

		const cmd = getBinPath('gotests');
		let args = ['-w'];
		const goGenerateTestsFlags: string[] = goConfig['generateTestsFlags'] || [];

		for (let i = 0; i < goGenerateTestsFlags.length; i++) {
			const flag = goGenerateTestsFlags[i];
			if (flag === '-w' || flag === 'all') {
				continue;
			}
			if (flag === '-only') {
				i++;
				continue;
			}
			if (i + 1 < goGenerateTestsFlags.length && (flag === '-template_dir' || flag === '-template_params_file')) {
				const configFilePath = resolvePath(goGenerateTestsFlags[i + 1]);
				args.push(flag, configFilePath);
				i++;
				continue;
			}
			args.push(flag);
		}

		if (conf.func) {
			args = args.concat(['-only', `^${conf.func}$`, conf.dir]);
		} else {
			args = args.concat(['-all', conf.dir]);
		}

		cp.execFile(cmd, args, { env: toolExecutionEnvironment() }, (err, stdout, stderr) => {
			outputChannel.info('Generating Tests: ' + cmd + ' ' + args.join(' '));

			try {
				if (err && (<any>err).code === 'ENOENT') {
					promptForMissingTool('gotests');
					return resolve(false);
				}
				if (err) {
					outputChannel.error(err.message);
					return reject('Cannot generate test due to errors');
				}

				let message = stdout;
				let testsGenerated = false;

				// Expected stdout is of the format "Generated TestMain\nGenerated Testhello\n"
				if (stdout.startsWith(generatedWord)) {
					const lines = stdout
						.split('\n')
						.filter((element) => {
							return element.startsWith(generatedWord);
						})
						.map((element) => {
							return element.substr(generatedWord.length);
						});
					message = `Generated ${lines.join(', ')}`;
					testsGenerated = true;
				}

				vscode.window.showInformationMessage(message);
				outputChannel.info(message);

				if (testsGenerated && !conf.isTestFile) {
					toggleTestFile(ctx, goCtx)();
				}

				return resolve(true);
			} catch (e) {
				vscode.window.showInformationMessage((e as any).msg);
				outputChannel.info((e as any).msg);
				reject(e);
			}
		});
	});
}

async function getFunctions(goCtx: GoExtensionContext, doc: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
	const documentSymbolProvider = GoDocumentSymbolProvider(goCtx);
	const symbols = await documentSymbolProvider.provideDocumentSymbols(doc);
	if (!symbols || symbols.length == 0) {
		return [];
	}
	return symbols[0].children.filter((sym) =>
		[vscode.SymbolKind.Function, vscode.SymbolKind.Method].includes(sym.kind)
	);
}
