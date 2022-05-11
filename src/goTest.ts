/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
'use strict';

import path = require('path');
import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig } from './config';
import { GoExtensionContext } from './context';
import { isModSupported } from './goModules';
import {
	extractInstanceTestName,
	findAllTestSuiteRuns,
	getBenchmarkFunctions,
	getTestFlags,
	getTestFunctionDebugArgs,
	getTestFunctions,
	getTestTags,
	goTest,
	TestConfig
} from './testUtils';

// lastTestConfig holds a reference to the last executed TestConfig which allows
// the last test to be easily re-executed.
let lastTestConfig: TestConfig | undefined;

// lastDebugConfig holds a reference to the last executed DebugConfiguration which allows
// the last test to be easily re-executed and debugged.
let lastDebugConfig: vscode.DebugConfiguration | undefined;
let lastDebugWorkspaceFolder: vscode.WorkspaceFolder | undefined;

export type TestAtCursorCmd = 'debug' | 'test' | 'benchmark';

class NotFoundError extends Error {}

async function _testAtCursor(
	goCtx: GoExtensionContext,
	goConfig: vscode.WorkspaceConfiguration,
	cmd: TestAtCursorCmd,
	args: any
) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		throw new NotFoundError('No editor is active.');
	}
	if (!editor.document.fileName.endsWith('_test.go')) {
		throw new NotFoundError('No tests found. Current file is not a test file.');
	}

	const getFunctions = cmd === 'benchmark' ? getBenchmarkFunctions : getTestFunctions;
	const testFunctions = (await getFunctions(goCtx, editor.document)) ?? [];
	// We use functionName if it was provided as argument
	// Otherwise find any test function containing the cursor.
	const testFunctionName =
		args && args.functionName
			? args.functionName
			: testFunctions?.filter((func) => func.range.contains(editor.selection.start)).map((el) => el.name)[0];
	if (!testFunctionName) {
		throw new NotFoundError('No test function found at cursor.');
	}

	await editor.document.save();

	if (cmd === 'debug') {
		return debugTestAtCursor(editor, testFunctionName, testFunctions, goConfig);
	} else if (cmd === 'benchmark' || cmd === 'test') {
		return runTestAtCursor(editor, testFunctionName, testFunctions, goConfig, cmd, args);
	} else {
		throw new Error(`Unsupported command: ${cmd}`);
	}
}

/**
 * Executes the unit test at the primary cursor using `go test`. Output
 * is sent to the 'Go' channel.
 * @param goConfig Configuration for the Go extension.
 * @param cmd Whether the command is test, benchmark, or debug.
 * @param args
 */
export function testAtCursor(cmd: TestAtCursorCmd): CommandFactory {
	return (ctx, goCtx) => (args: any) => {
		const goConfig = getGoConfig();
		_testAtCursor(goCtx, goConfig, cmd, args).catch((err) => {
			if (err instanceof NotFoundError) {
				vscode.window.showInformationMessage(err.message);
			} else {
				console.error(err);
			}
		});
	};
}

/**
 * Executes the unit test at the primary cursor if found, otherwise re-runs the previous test.
 * @param goConfig Configuration for the Go extension.
 * @param cmd Whether the command is test, benchmark, or debug.
 * @param args
 */
export function testAtCursorOrPrevious(cmd: TestAtCursorCmd): CommandFactory {
	return (ctx, goCtx) => async (args: any) => {
		const goConfig = getGoConfig();
		try {
			await _testAtCursor(goCtx, goConfig, cmd, args);
		} catch (err) {
			if (err instanceof NotFoundError) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					await editor.document.save();
				}
				await testPrevious(ctx, goCtx)();
			} else {
				console.error(err);
			}
		}
	};
}

/**
 * Runs the test at cursor.
 */
async function runTestAtCursor(
	editor: vscode.TextEditor,
	testFunctionName: string,
	testFunctions: vscode.DocumentSymbol[],
	goConfig: vscode.WorkspaceConfiguration,
	cmd: TestAtCursorCmd,
	args: any
) {
	const testConfigFns = [testFunctionName];
	if (cmd !== 'benchmark' && extractInstanceTestName(testFunctionName)) {
		testConfigFns.push(...findAllTestSuiteRuns(editor.document, testFunctions).map((t) => t.name));
	}

	const isMod = await isModSupported(editor.document.uri);
	const testConfig: TestConfig = {
		goConfig,
		dir: path.dirname(editor.document.fileName),
		flags: getTestFlags(goConfig, args),
		functions: testConfigFns,
		isBenchmark: cmd === 'benchmark',
		isMod,
		applyCodeCoverage: goConfig.get<boolean>('coverOnSingleTest')
	};
	// Remember this config as the last executed test.
	lastTestConfig = testConfig;
	return goTest(testConfig);
}

/**
 * Executes the sub unit test at the primary cursor using `go test`. Output
 * is sent to the 'Go' channel.
 */
export const subTestAtCursor: CommandFactory = (ctx, goCtx) => {
	return async (args: any) => {
		const goConfig = getGoConfig();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active.');
			return;
		}
		if (!editor.document.fileName.endsWith('_test.go')) {
			vscode.window.showInformationMessage('No tests found. Current file is not a test file.');
			return;
		}

		await editor.document.save();
		try {
			const testFunctions = (await getTestFunctions(goCtx, editor.document)) ?? [];
			// We use functionName if it was provided as argument
			// Otherwise find any test function containing the cursor.
			const currentTestFunctions = testFunctions.filter((func) => func.range.contains(editor.selection.start));
			const testFunctionName =
				args && args.functionName ? args.functionName : currentTestFunctions.map((el) => el.name)[0];

			if (!testFunctionName || currentTestFunctions.length === 0) {
				vscode.window.showInformationMessage('No test function found at cursor.');
				return;
			}

			const testFunction = currentTestFunctions[0];
			const simpleRunRegex = /t.Run\("([^"]+)",/;
			const runRegex = /t.Run\(/;
			let lineText: string;
			let runMatch: RegExpMatchArray | null | undefined;
			let simpleMatch: RegExpMatchArray | null | undefined;
			for (let i = editor.selection.start.line; i >= testFunction.range.start.line; i--) {
				lineText = editor.document.lineAt(i).text;
				simpleMatch = lineText.match(simpleRunRegex);
				runMatch = lineText.match(runRegex);
				if (simpleMatch || (runMatch && !simpleMatch)) {
					break;
				}
			}

			let subtest: string;
			if (!simpleMatch) {
				const input = await vscode.window.showInputBox({
					prompt: 'Enter sub test name'
				});
				if (input) {
					subtest = input;
				} else {
					vscode.window.showInformationMessage(
						'No subtest function with a simple subtest name found at cursor.'
					);
					return;
				}
			} else {
				subtest = simpleMatch[1];
			}

			const subTestName = testFunctionName + '/' + subtest;

			return await runTestAtCursor(editor, subTestName, testFunctions, goConfig, 'test', args);
		} catch (err) {
			vscode.window.showInformationMessage('Unable to run subtest: ' + (err as any).toString());
			console.error(err);
		}
	};
};

/**
 * Debugs the test at cursor.
 * @param editorOrDocument The text document (or editor) that defines the test.
 * @param testFunctionName The name of the test function.
 * @param testFunctions All test function symbols defined by the document.
 * @param goConfig Go configuration, i.e. flags, tags, environment, etc.
 * @param sessionID If specified, `sessionID` is added to the debug
 * configuration and can be used to identify the debug session.
 * @returns Whether the debug session was successfully started.
 */
export async function debugTestAtCursor(
	editorOrDocument: vscode.TextEditor | vscode.TextDocument,
	testFunctionName: string,
	testFunctions: vscode.DocumentSymbol[],
	goConfig: vscode.WorkspaceConfiguration,
	sessionID?: string
) {
	const doc = 'document' in editorOrDocument ? editorOrDocument.document : editorOrDocument;
	const args = getTestFunctionDebugArgs(doc, testFunctionName, testFunctions);
	const tags = getTestTags(goConfig);
	const buildFlags = tags ? ['-tags', tags] : [];
	const flagsFromConfig = getTestFlags(goConfig);
	let foundArgsFlag = false;
	flagsFromConfig.forEach((x) => {
		if (foundArgsFlag) {
			args.push(x);
			return;
		}
		if (x === '-args') {
			foundArgsFlag = true;
			return;
		}
		buildFlags.push(x);
	});
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
	const debugConfig: vscode.DebugConfiguration = {
		name: 'Debug Test',
		type: 'go',
		request: 'launch',
		mode: 'test',
		program: path.dirname(doc.fileName),
		env: goConfig.get('testEnvVars', {}),
		envFile: goConfig.get('testEnvFile'),
		args,
		buildFlags: buildFlags.join(' '),
		sessionID
	};
	lastDebugConfig = debugConfig;
	lastDebugWorkspaceFolder = workspaceFolder;
	return await vscode.debug.startDebugging(workspaceFolder, debugConfig);
}

/**
 * Runs all tests in the package of the source of the active editor.
 *
 * @param goConfig Configuration for the Go extension.
 */
export function testCurrentPackage(isBenchmark: boolean): CommandFactory {
	return () => async (args: any) => {
		const goConfig = getGoConfig();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active.');
			return;
		}

		const isMod = await isModSupported(editor.document.uri);
		const testConfig: TestConfig = {
			goConfig,
			dir: path.dirname(editor.document.fileName),
			flags: getTestFlags(goConfig, args),
			isBenchmark,
			isMod,
			applyCodeCoverage: goConfig.get<boolean>('coverOnTestPackage')
		};
		// Remember this config as the last executed test.
		lastTestConfig = testConfig;
		return goTest(testConfig);
	};
}

/**
 * Runs all tests from all directories in the workspace.
 *
 * @param goConfig Configuration for the Go extension.
 */
export const testWorkspace: CommandFactory = () => (args: any) => {
	const goConfig = getGoConfig();
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showInformationMessage('No workspace is open to run tests.');
		return;
	}
	let workspaceUri: vscode.Uri | undefined = vscode.workspace.workspaceFolders[0].uri;
	if (
		vscode.window.activeTextEditor &&
		vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
	) {
		workspaceUri = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)!.uri;
	}

	const testConfig: TestConfig = {
		goConfig,
		dir: workspaceUri.fsPath,
		flags: getTestFlags(goConfig, args),
		includeSubDirectories: true
	};
	// Remember this config as the last executed test.
	lastTestConfig = testConfig;

	isModSupported(workspaceUri, true).then((isMod) => {
		testConfig.isMod = isMod;
		goTest(testConfig).then(null, (err) => {
			console.error(err);
		});
	});
};

/**
 * Runs all tests in the source of the active editor.
 *
 * @param goConfig Configuration for the Go extension.
 * @param isBenchmark Boolean flag indicating if these are benchmark tests or not.
 */
export function testCurrentFile(isBenchmark: boolean, getConfig = getGoConfig): CommandFactory {
	return (ctx, goCtx) => async (args: string[]) => {
		const goConfig = getConfig();
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No editor is active.');
			return false;
		}
		if (!editor.document.fileName.endsWith('_test.go')) {
			vscode.window.showInformationMessage('No tests found. Current file is not a test file.');
			return false;
		}

		const getFunctions = isBenchmark ? getBenchmarkFunctions : getTestFunctions;
		const isMod = await isModSupported(editor.document.uri);

		return editor.document
			.save()
			.then(() => {
				return getFunctions(goCtx, editor.document).then((testFunctions) => {
					const testConfig: TestConfig = {
						goConfig,
						dir: path.dirname(editor.document.fileName),
						flags: getTestFlags(goConfig, args),
						functions: testFunctions?.map((sym) => sym.name),
						isBenchmark,
						isMod,
						applyCodeCoverage: goConfig.get<boolean>('coverOnSingleTestFile')
					};
					// Remember this config as the last executed test.
					lastTestConfig = testConfig;
					return goTest(testConfig);
				});
			})
			.then(undefined, (err) => {
				console.error(err);
				return Promise.resolve(false);
			});
	};
}

/**
 * Runs the previously executed test.
 */
export const testPrevious: CommandFactory = () => () => {
	if (!lastTestConfig) {
		vscode.window.showInformationMessage('No test has been recently executed.');
		return;
	}
	goTest(lastTestConfig).then(null, (err) => {
		console.error(err);
	});
};

/**
 * Runs the previously executed test.
 */
export const debugPrevious: CommandFactory = () => () => {
	if (!lastDebugConfig) {
		vscode.window.showInformationMessage('No test has been recently debugged.');
		return;
	}
	return vscode.debug.startDebugging(lastDebugWorkspaceFolder, lastDebugConfig);
};
