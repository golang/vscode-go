/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { extensionInfo, getGoConfig } from './config';
import { browsePackages } from './goBrowsePackage';
import { buildCode } from './goBuild';
import { notifyIfGeneratedFile, removeTestStatus } from './goCheck';
import {
	applyCodeCoverage,
	initCoverageDecorators,
	removeCodeCoverageOnFileSave,
	toggleCoverageCurrentPackage,
	trackCodeCoverageRemovalOnFileChange,
	updateCodeCoverageDecorators
} from './goCover';
import { GoDebugConfigurationProvider } from './goDebugConfiguration';
import * as GoDebugFactory from './goDebugFactory';
import { setGOROOTEnvVar, toolExecutionEnvironment } from './goEnv';
import {
	chooseGoEnvironment,
	offerToInstallLatestGoVersion,
	setEnvironmentVariableCollection
} from './goEnvironmentStatus';
import * as goGenerateTests from './goGenerateTests';
import { goGetPackage } from './goGetPackage';
import { addImport, addImportToWorkspace } from './goImport';
import { installCurrentPackage } from './goInstall';
import {
	promptForMissingTool,
	updateGoVarsFromConfig,
	suggestUpdates,
	maybeInstallVSCGO,
	maybeInstallImportantTools
} from './goInstallTools';
import { RestartReason, showServerOutputChannel, watchLanguageServerConfiguration } from './language/goLanguageServer';
import { lintCode } from './goLint';
import { GO_MODE } from './goMode';
import { GO111MODULE, goModInit } from './goModules';
import { playgroundCommand } from './goPlayground';
import { GoRunTestCodeLensProvider } from './goRunTestCodelens';
import { disposeGoStatusBar, expandGoStatusBar, outputChannel, updateGoStatusBar } from './goStatus';

import { vetCode } from './goVet';
import {
	getFromGlobalState,
	resetGlobalState,
	resetWorkspaceState,
	setGlobalState,
	setWorkspaceState,
	updateGlobalState
} from './stateUtils';
import { cancelRunningTests, showTestOutput } from './testUtils';
import { cleanupTempDir, getBinPath, getToolsGopath } from './util';
import { clearCacheForTools } from './utils/pathUtils';
import { WelcomePanel } from './welcome';
import vscode = require('vscode');
import { getFormatTool } from './language/legacy/goFormat';
import { resetSurveyConfigs, showSurveyConfig } from './goSurvey';
import { ExtensionAPI } from './export';
import extensionAPI from './extensionAPI';
import { GoTestExplorer, isVscodeTestingAPIAvailable } from './goTest/explore';
import { killRunningPprof } from './goTest/profile';
import { GoExplorerProvider } from './goExplorer';
import { GoExtensionContext } from './context';
import * as commands from './commands';
import { toggleVulncheckCommandFactory } from './goVulncheck';
import { GoTaskProvider } from './goTaskProvider';
import { setTelemetryEnvVars, telemetryReporter } from './goTelemetry';

const goCtx: GoExtensionContext = {};

// Allow tests to access the extension context utilities.
interface ExtensionTestAPI {
	globalState: vscode.Memento;
}

export async function activate(ctx: vscode.ExtensionContext): Promise<ExtensionAPI | ExtensionTestAPI | undefined> {
	if (process.env['VSCODE_GO_IN_TEST'] === '1') {
		// TODO: VSCODE_GO_IN_TEST was introduced long before we learned about
		// ctx.extensionMode, and used in multiple places.
		// Investigate if use of VSCODE_GO_IN_TEST can be removed
		// in favor of ctx.extensionMode and clean up.
		if (ctx.extensionMode === vscode.ExtensionMode.Test) {
			return { globalState: ctx.globalState };
		}
		// We shouldn't expose the memento in production mode even when VSCODE_GO_IN_TEST
		// environment variable is set.
		return; // Skip the remaining activation work.
	}
	const start = Date.now();
	setGlobalState(ctx.globalState);
	setWorkspaceState(ctx.workspaceState);
	setEnvironmentVariableCollection(ctx.environmentVariableCollection);

	setTelemetryEnvVars(ctx.globalState, process.env);

	const cfg = getGoConfig();
	WelcomePanel.activate(ctx, goCtx);

	const configGOROOT = getGoConfig()['goroot'];
	if (configGOROOT) {
		// We don't support unsetting go.goroot because we don't know whether
		// !configGOROOT case indicates the user wants to unset process.env['GOROOT']
		// or the user wants the extension to use the current process.env['GOROOT'] value.
		// TODO(hyangah): consider utilizing an empty value to indicate unset?
		await setGOROOTEnvVar(configGOROOT);
	}

	await updateGoVarsFromConfig(goCtx);

	// for testing or development mode, always rebuild vscgo.
	if (process.platform !== 'win32') {
		// skip windows until Windows Defender issue reported in golang/vscode-go#3182 can be addressed
		maybeInstallVSCGO(
			ctx.extensionMode,
			ctx.extension.id,
			extensionInfo.version || '',
			ctx.extensionPath,
			extensionInfo.isPreview
		)
			.then((path) => telemetryReporter.setTool(path))
			.catch((reason) => console.error(reason));
	}

	const registerCommand = commands.createRegisterCommand(ctx, goCtx);
	registerCommand('go.languageserver.restart', commands.startLanguageServer);
	registerCommand('go.languageserver.maintain', commands.startGoplsMaintainerInterface);

	await maybeInstallImportantTools(cfg.get('alternateTools'));
	await commands.startLanguageServer(ctx, goCtx)(RestartReason.ACTIVATION);

	suggestUpdates();
	offerToInstallLatestGoVersion(ctx);

	initCoverageDecorators(ctx);

	registerCommand('go.builds.run', commands.runBuilds);
	registerCommand('go.environment.status', expandGoStatusBar);

	GoRunTestCodeLensProvider.activate(ctx, goCtx);
	GoDebugConfigurationProvider.activate(ctx, goCtx);
	GoDebugFactory.activate(ctx, goCtx);

	goCtx.buildDiagnosticCollection = vscode.languages.createDiagnosticCollection('go');
	ctx.subscriptions.push(goCtx.buildDiagnosticCollection);
	goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(
		lintDiagnosticCollectionName(getGoConfig()['lintTool'])
	);
	ctx.subscriptions.push(goCtx.lintDiagnosticCollection);
	goCtx.vetDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-vet');
	ctx.subscriptions.push(goCtx.vetDiagnosticCollection);

	registerCommand('go.gopath', commands.getCurrentGoPath);
	registerCommand('go.goroot', commands.getCurrentGoRoot);
	registerCommand('go.locate.tools', commands.getConfiguredGoTools);
	registerCommand('go.add.tags', commands.addTags);
	registerCommand('go.remove.tags', commands.removeTags);
	registerCommand('go.impl.cursor', commands.implCursor);
	registerCommand('go.test.cursor', commands.testAtCursor('test'));
	registerCommand('go.test.cursorOrPrevious', commands.testAtCursorOrPrevious('test'));
	registerCommand('go.subtest.cursor', commands.subTestAtCursor('test'));
	registerCommand('go.debug.cursor', commands.testAtCursor('debug'));
	registerCommand('go.debug.subtest.cursor', commands.subTestAtCursor('debug'));
	registerCommand('go.benchmark.cursor', commands.testAtCursor('benchmark'));
	registerCommand('go.test.package', commands.testCurrentPackage(false));
	registerCommand('go.benchmark.package', commands.testCurrentPackage(true));
	registerCommand('go.test.file', commands.testCurrentFile(false));
	registerCommand('go.benchmark.file', commands.testCurrentFile(true));
	registerCommand('go.test.workspace', commands.testWorkspace);
	registerCommand('go.test.previous', commands.testPrevious);
	registerCommand('go.debug.previous', commands.debugPrevious);

	registerCommand('go.test.coverage', toggleCoverageCurrentPackage);
	registerCommand('go.test.showOutput', () => showTestOutput);
	registerCommand('go.test.cancel', () => cancelRunningTests);
	registerCommand('go.import.add', addImport);
	registerCommand('go.add.package.workspace', addImportToWorkspace);
	registerCommand('go.tools.install', commands.installTools);
	registerCommand('go.browse.packages', browsePackages);

	if (isVscodeTestingAPIAvailable && cfg.get<boolean>('testExplorer.enable')) {
		GoTestExplorer.setup(ctx, goCtx);
	}

	GoExplorerProvider.setup(ctx);

	registerCommand('go.test.generate.package', goGenerateTests.generateTestCurrentPackage);
	registerCommand('go.test.generate.file', goGenerateTests.generateTestCurrentFile);
	registerCommand('go.test.generate.function', goGenerateTests.generateTestCurrentFunction);
	registerCommand('go.toggle.test.file', goGenerateTests.toggleTestFile);
	registerCommand('go.debug.startSession', commands.startDebugSession);
	registerCommand('go.show.commands', commands.showCommands);
	registerCommand('go.get.package', goGetPackage);
	registerCommand('go.playground', playgroundCommand);
	registerCommand('go.lint.package', lintCode('package'));
	registerCommand('go.lint.workspace', lintCode('workspace'));
	registerCommand('go.lint.file', lintCode('file'));
	registerCommand('go.vet.package', vetCode(false));
	registerCommand('go.vet.workspace', vetCode(true));
	registerCommand('go.build.package', buildCode(false));
	registerCommand('go.build.workspace', buildCode(true));
	registerCommand('go.install.package', installCurrentPackage);
	registerCommand('go.run.modinit', goModInit);
	registerCommand('go.extractServerChannel', showServerOutputChannel);
	registerCommand('go.workspace.resetState', resetWorkspaceState);
	registerCommand('go.global.resetState', resetGlobalState);
	registerCommand('go.toggle.gc_details', commands.toggleGCDetails);
	registerCommand('go.apply.coverprofile', commands.applyCoverprofile);

	// Go Environment switching commands
	registerCommand('go.environment.choose', chooseGoEnvironment);

	// Survey related commands
	registerCommand('go.survey.showConfig', showSurveyConfig);
	registerCommand('go.survey.resetConfig', resetSurveyConfigs);

	addOnDidChangeConfigListeners(ctx);
	addOnChangeTextDocumentListeners(ctx);
	addOnChangeActiveTextEditorListeners(ctx);
	addOnSaveTextDocumentListeners(ctx);

	vscode.languages.setLanguageConfiguration(GO_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g
	});

	GoTaskProvider.setup(ctx, vscode.workspace);

	registerCommand('go.vulncheck.toggle', toggleVulncheckCommandFactory);

	telemetryReporter.add(activationLatency(Date.now() - start), 1);

	return extensionAPI;
}

function activationLatency(duration: number): string {
	// TODO: generalize and move to goTelemetry.ts
	let bucket = '>=5s';

	if (duration < 100) {
		bucket = '<100ms';
	} else if (duration < 500) {
		bucket = '<500ms';
	} else if (duration < 1000) {
		bucket = '<1s';
	} else if (duration < 5000) {
		bucket = '<5s';
	}
	return 'activation_latency:' + bucket;
}

export function deactivate() {
	return Promise.all([
		goCtx.languageClient?.stop(),
		cancelRunningTests(),
		killRunningPprof(),
		Promise.resolve(cleanupTempDir()),
		Promise.resolve(disposeGoStatusBar()),
		telemetryReporter.dispose()
	]);
}

function addOnDidChangeConfigListeners(ctx: vscode.ExtensionContext) {
	// Subscribe to notifications for changes to the configuration
	// of the language server, even if it's not currently in use.
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => watchLanguageServerConfiguration(goCtx, e))
	);
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
			if (!e.affectsConfiguration('go')) {
				return;
			}
			const updatedGoConfig = getGoConfig();

			if (e.affectsConfiguration('go.goroot')) {
				const configGOROOT = updatedGoConfig['goroot'];
				if (configGOROOT) {
					await setGOROOTEnvVar(configGOROOT);
				}
			}
			if (
				e.affectsConfiguration('go.goroot') ||
				e.affectsConfiguration('go.alternateTools') ||
				e.affectsConfiguration('go.gopath') ||
				e.affectsConfiguration('go.toolsEnvVars') ||
				e.affectsConfiguration('go.testEnvFile')
			) {
				updateGoVarsFromConfig(goCtx);
			}
			// If there was a change in "toolsGopath" setting, then clear cache for go tools
			if (getToolsGopath() !== getToolsGopath(false)) {
				clearCacheForTools();
			}

			if (e.affectsConfiguration('go.formatTool')) {
				checkToolExists(getFormatTool(updatedGoConfig));
			}
			if (e.affectsConfiguration('go.lintTool')) {
				checkToolExists(updatedGoConfig['lintTool']);
			}
			if (e.affectsConfiguration('go.docsTool')) {
				checkToolExists(updatedGoConfig['docsTool']);
			}
			if (e.affectsConfiguration('go.coverageDecorator')) {
				updateCodeCoverageDecorators(updatedGoConfig['coverageDecorator']);
			}
			if (e.affectsConfiguration('go.toolsEnvVars')) {
				const env = toolExecutionEnvironment();
				if (GO111MODULE !== env['GO111MODULE']) {
					const reloadMsg =
						'Reload VS Code window so that the Go tools can respect the change to GO111MODULE';
					vscode.window.showInformationMessage(reloadMsg, 'Reload').then((selected) => {
						if (selected === 'Reload') {
							vscode.commands.executeCommand('workbench.action.reloadWindow');
						}
					});
				}
			}
			if (e.affectsConfiguration('go.lintTool')) {
				const lintTool = lintDiagnosticCollectionName(updatedGoConfig['lintTool']);
				if (goCtx.lintDiagnosticCollection && goCtx.lintDiagnosticCollection.name !== lintTool) {
					goCtx.lintDiagnosticCollection.dispose();
					goCtx.lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(lintTool);
					ctx.subscriptions.push(goCtx.lintDiagnosticCollection);
					// TODO: actively maintain our own disposables instead of keeping pushing to ctx.subscription.
				}
			}
			if (e.affectsConfiguration('go.testExplorer.enable')) {
				const msg =
					'Go test explorer has been enabled or disabled. For this change to take effect, the window must be reloaded.';
				vscode.window.showInformationMessage(msg, 'Reload').then((selected) => {
					if (selected === 'Reload') {
						vscode.commands.executeCommand('workbench.action.reloadWindow');
					}
				});
			}
		})
	);
}

function addOnSaveTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidSaveTextDocument(removeCodeCoverageOnFileSave, null, ctx.subscriptions);
	vscode.workspace.onDidSaveTextDocument(
		(document) => {
			if (document.languageId !== 'go') {
				return;
			}
			const session = vscode.debug.activeDebugSession;
			if (session && session.type === 'go') {
				const neverAgain = { title: "Don't Show Again" };
				const ignoreActiveDebugWarningKey = 'ignoreActiveDebugWarningKey';
				const ignoreActiveDebugWarning = getFromGlobalState(ignoreActiveDebugWarningKey);
				if (!ignoreActiveDebugWarning) {
					vscode.window
						.showWarningMessage(
							'A debug session is currently active. Changes to your Go files may result in unexpected behaviour.',
							neverAgain
						)
						.then((result) => {
							if (result === neverAgain) {
								updateGlobalState(ignoreActiveDebugWarningKey, true);
							}
						});
				}
			}
			if (vscode.window.visibleTextEditors.some((e) => e.document.fileName === document.fileName)) {
				vscode.commands.executeCommand('go.builds.run', document, getGoConfig(document.uri));
			}
		},
		null,
		ctx.subscriptions
	);
}

function addOnChangeTextDocumentListeners(ctx: vscode.ExtensionContext) {
	vscode.workspace.onDidChangeTextDocument(trackCodeCoverageRemovalOnFileChange, null, ctx.subscriptions);
	vscode.workspace.onDidChangeTextDocument(removeTestStatus, null, ctx.subscriptions);
	vscode.workspace.onDidChangeTextDocument(notifyIfGeneratedFile, ctx, ctx.subscriptions);
}

function addOnChangeActiveTextEditorListeners(ctx: vscode.ExtensionContext) {
	[updateGoStatusBar, applyCodeCoverage].forEach((listener) => {
		// Call the listeners on initilization for current active text editor
		if (vscode.window.activeTextEditor) {
			listener(vscode.window.activeTextEditor);
		}
		vscode.window.onDidChangeActiveTextEditor(listener, null, ctx.subscriptions);
	});
}

function checkToolExists(tool: string) {
	if (tool === getBinPath(tool)) {
		promptForMissingTool(tool);
	}
}

function lintDiagnosticCollectionName(lintToolName: string) {
	if (!lintToolName || lintToolName === 'golint') {
		return 'go-lint';
	}
	return `go-${lintToolName}`;
}
