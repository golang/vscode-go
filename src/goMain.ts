/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { extensionInfo, getGoConfig, getGoplsConfig } from './config';
import { browsePackages } from './goBrowsePackage';
import { buildCode } from './goBuild';
import { check, notifyIfGeneratedFile, removeTestStatus } from './goCheck';
import {
	applyCodeCoverage,
	initCoverageDecorators,
	removeCodeCoverageOnFileSave,
	toggleCoverageCurrentPackage,
	trackCodeCoverageRemovalOnFileChange,
	updateCodeCoverageDecorators
} from './goCover';
import { GoDebugConfigurationProvider } from './goDebugConfiguration';
import { GoDebugAdapterDescriptorFactory, GoDebugAdapterTrackerFactory } from './goDebugFactory';
import { extractFunction, extractVariable } from './goDoctor';
import { toolExecutionEnvironment } from './goEnv';
import {
	chooseGoEnvironment,
	offerToInstallLatestGoVersion,
	setEnvironmentVariableCollection
} from './goEnvironmentStatus';
import { runFillStruct } from './goFillStruct';
import * as goGenerateTests from './goGenerateTests';
import { goGetPackage } from './goGetPackage';
import { implCursor } from './goImpl';
import { addImport, addImportToWorkspace } from './goImport';
import { installCurrentPackage } from './goInstall';
import {
	inspectGoToolVersion,
	installTools,
	offerToInstallTools,
	promptForMissingTool,
	updateGoVarsFromConfig
} from './goInstallTools';
import { RestartReason, showServerOutputChannel, watchLanguageServerConfiguration } from './language/goLanguageServer';
import { lintCode } from './goLint';
import { logVerbose, setLogConfig } from './goLogging';
import { GO_MODE } from './goMode';
import { addTags, removeTags } from './goModifytags';
import { GO111MODULE, goModInit, isModSupported } from './goModules';
import { playgroundCommand } from './goPlayground';
import { GoReferencesCodeLensProvider } from './goReferencesCodelens';
import { GoRunTestCodeLensProvider } from './goRunTestCodelens';
import { disposeGoStatusBar, expandGoStatusBar, updateGoStatusBar } from './goStatus';
import {
	debugPrevious,
	subTestAtCursor,
	testAtCursor,
	testAtCursorOrPrevious,
	testCurrentFile,
	testCurrentPackage,
	testPrevious,
	testWorkspace
} from './goTest';
import { getConfiguredTools, Tool } from './goTools';
import { vetCode } from './goVet';
import { pickGoProcess, pickProcess } from './pickProcess';
import {
	getFromGlobalState,
	resetGlobalState,
	resetWorkspaceState,
	setGlobalState,
	setWorkspaceState,
	updateGlobalState
} from './stateUtils';
import { cancelRunningTests, showTestOutput } from './testUtils';
import {
	cleanupTempDir,
	getBinPath,
	getGoVersion,
	getToolsGopath,
	GoVersion,
	handleDiagnosticErrors,
	isGoPathSet,
	resolvePath
} from './util';
import { clearCacheForTools, dirExists } from './utils/pathUtils';
import { WelcomePanel } from './welcome';
import semver = require('semver');
import vscode = require('vscode');
import { getFormatTool } from './language/legacy/goFormat';
import { resetSurveyConfigs, showSurveyConfig } from './goSurvey';
import { ExtensionAPI } from './export';
import extensionAPI from './extensionAPI';
import { GoTestExplorer, isVscodeTestingAPIAvailable } from './goTest/explore';
import { killRunningPprof } from './goTest/profile';
import { GoExplorerProvider } from './goExplorer';
import { VulncheckProvider } from './goVulncheck';

import { GoExtensionContext } from './context';
import * as commands from './commands';

// TODO: Remove this export. Temporarily exporting the context for import into the
// legacy DocumentSymbolProvider.
export const goCtx: GoExtensionContext = {
	lastUserAction: new Date(),
	crashCount: 0,
	restartHistory: []
};

export let buildDiagnosticCollection: vscode.DiagnosticCollection;
export let lintDiagnosticCollection: vscode.DiagnosticCollection;
export let vetDiagnosticCollection: vscode.DiagnosticCollection;

export async function activate(ctx: vscode.ExtensionContext): Promise<ExtensionAPI | undefined> {
	if (process.env['VSCODE_GO_IN_TEST'] === '1') {
		// Make sure this does not run when running in test.
		return;
	}

	setGlobalState(ctx.globalState);
	setWorkspaceState(ctx.workspaceState);
	setEnvironmentVariableCollection(ctx.environmentVariableCollection);

	const cfg = getGoConfig();
	setLogConfig(cfg['logging']);

	WelcomePanel.activate(ctx, goCtx);

	const configGOROOT = getGoConfig()['goroot'];
	if (configGOROOT) {
		// We don't support unsetting go.goroot because we don't know whether
		// !configGOROOT case indicates the user wants to unset process.env['GOROOT']
		// or the user wants the extension to use the current process.env['GOROOT'] value.
		// TODO(hyangah): consider utilizing an empty value to indicate unset?
		await setGOROOTEnvVar(configGOROOT);
	}

	// Present a warning about the deprecation of the go.documentLink setting.
	const experimentalFeatures = getGoConfig()['languageServerExperimentalFeatures'];
	if (experimentalFeatures) {
		// TODO(golang/vscode-go#50): Eventually notify about deprecation of
		// all of the settings. See golang/vscode-go#1109 too.
		// The `diagnostics` setting is still used as a workaround for running custom vet.
		if (experimentalFeatures['documentLink'] === false) {
			vscode.window
				.showErrorMessage(`The 'go.languageServerExperimentalFeature.documentLink' setting is now deprecated.
Please use '"gopls": {"ui.navigation.importShortcut": "Definition" }' instead.
See [the settings doc](https://github.com/golang/vscode-go/blob/master/docs/settings.md#uinavigationimportshortcut) for more details.`);
		}
		const promptKey = 'promptedLanguageServerExperimentalFeatureDeprecation';
		const prompted = getFromGlobalState(promptKey, false);
		if (!prompted && experimentalFeatures['diagnostics'] === false) {
			const msg = `The 'go.languageServerExperimentalFeature.diagnostics' setting will be deprecated soon.
If you would like additional configuration for diagnostics from gopls, please see and response to [Issue 50](https://github.com/golang/vscode-go/issues/50).`;
			const selected = await vscode.window.showInformationMessage(msg, "Don't show again");
			switch (selected) {
				case "Don't show again":
					updateGlobalState(promptKey, true);
			}
		}
	}

	return activateContinued(ctx, cfg);
}

async function activateContinued(
	ctx: vscode.ExtensionContext,
	cfg: vscode.WorkspaceConfiguration
): Promise<ExtensionAPI> {
	await updateGoVarsFromConfig(goCtx);

	suggestUpdates(ctx);
	offerToInstallLatestGoVersion();
	offerToInstallTools();

	await commands.startLanguageServer(ctx, goCtx)(RestartReason.ACTIVATION);

	const activeDoc = vscode.window.activeTextEditor?.document;
	if (!goCtx.languageServerIsRunning && activeDoc?.languageId === 'go' && isGoPathSet()) {
		// Check mod status so that cache is updated and then run build/lint/vet
		isModSupported(activeDoc.uri).then(() => {
			runBuilds(activeDoc, getGoConfig());
		});
	}

	initCoverageDecorators(ctx);

	const registerCommand = commands.createRegisterCommand(ctx, goCtx);

	registerCommand('go.languageserver.restart', commands.startLanguageServer);

	// Subscribe to notifications for changes to the configuration
	// of the language server, even if it's not currently in use.
	ctx.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => watchLanguageServerConfiguration(goCtx, e))
	);

	registerCommand('go.environment.status', (_ctx, goCtx) => () => expandGoStatusBar(goCtx));

	const testCodeLensProvider = new GoRunTestCodeLensProvider();
	const referencesCodeLensProvider = new GoReferencesCodeLensProvider();

	ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, testCodeLensProvider));
	ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(GO_MODE, referencesCodeLensProvider));

	// debug
	ctx.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider('go', new GoDebugConfigurationProvider('go'))
	);
	registerCommand('go.debug.pickProcess', () => pickProcess);
	registerCommand('go.debug.pickGoProcess', () => pickGoProcess);

	const debugOutputChannel = vscode.window.createOutputChannel('Go Debug');
	ctx.subscriptions.push(debugOutputChannel);

	const factory = new GoDebugAdapterDescriptorFactory(debugOutputChannel);
	ctx.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('go', factory));
	if ('dispose' in factory) {
		ctx.subscriptions.push(factory);
	}

	const tracker = new GoDebugAdapterTrackerFactory(debugOutputChannel);
	ctx.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory('go', tracker));
	if ('dispose' in tracker) {
		ctx.subscriptions.push(tracker);
	}

	buildDiagnosticCollection = vscode.languages.createDiagnosticCollection('go');
	ctx.subscriptions.push(buildDiagnosticCollection);
	lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(
		lintDiagnosticCollectionName(getGoConfig()['lintTool'])
	);
	ctx.subscriptions.push(lintDiagnosticCollection);
	vetDiagnosticCollection = vscode.languages.createDiagnosticCollection('go-vet');
	ctx.subscriptions.push(vetDiagnosticCollection);

	addOnChangeTextDocumentListeners(ctx);
	addOnChangeActiveTextEditorListeners(ctx);
	addOnSaveTextDocumentListeners(ctx);

	registerCommand('go.gopath', commands.getCurrentGoPath);
	registerCommand('go.locate.tools', commands.getConfiguredGoTools);
	registerCommand('go.add.tags', () => addTags);
	registerCommand('go.remove.tags', () => removeTags);
	registerCommand('go.fill.struct', () => () => runFillStruct(vscode.window.activeTextEditor));
	registerCommand('go.impl.cursor', () => implCursor);
	registerCommand('go.godoctor.extract', () => extractFunction);
	registerCommand('go.godoctor.var', () => extractVariable);
	registerCommand('go.test.cursor', () => (args) => testAtCursor(getGoConfig(), 'test', args));
	registerCommand('go.test.cursorOrPrevious', () => (args) => testAtCursorOrPrevious(getGoConfig(), 'test', args));

	if (isVscodeTestingAPIAvailable && cfg.get<boolean>('testExplorer.enable')) {
		GoTestExplorer.setup(ctx);
	}

	GoExplorerProvider.setup(ctx);
	VulncheckProvider.setup(ctx, goCtx);

	registerCommand('go.subtest.cursor', () => (args) => subTestAtCursor(getGoConfig(), args));
	registerCommand('go.debug.cursor', () => (args) => testAtCursor(getGoConfig(), 'debug', args));
	registerCommand('go.benchmark.cursor', () => (args) => testAtCursor(getGoConfig(), 'benchmark', args));
	registerCommand('go.test.package', () => (args) => testCurrentPackage(getGoConfig(), false, args));
	registerCommand('go.benchmark.package', () => (args) => testCurrentPackage(getGoConfig(), true, args));
	registerCommand('go.test.file', () => (args) => testCurrentFile(getGoConfig(), false, args));
	registerCommand('go.benchmark.file', () => (args) => testCurrentFile(getGoConfig(), true, args));
	registerCommand('go.test.workspace', () => (args) => testWorkspace(getGoConfig(), args));
	registerCommand('go.test.previous', () => testPrevious);
	registerCommand('go.debug.previous', () => debugPrevious);
	registerCommand('go.test.coverage', () => toggleCoverageCurrentPackage);
	registerCommand('go.test.showOutput', () => showTestOutput);
	registerCommand('go.test.cancel', () => cancelRunningTests);
	registerCommand('go.import.add', () => (arg) => addImport(goCtx, arg));
	registerCommand('go.add.package.workspace', () => addImportToWorkspace);
	registerCommand('go.tools.install', commands.installTools);
	registerCommand('go.browse.packages', () => browsePackages);

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
			if (e.affectsConfiguration('go.logging')) {
				setLogConfig(updatedGoConfig['logging']);
			}
			// If there was a change in "toolsGopath" setting, then clear cache for go tools
			if (getToolsGopath() !== getToolsGopath(false)) {
				clearCacheForTools();
			}

			if (updatedGoConfig['enableCodeLens']) {
				testCodeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['runtest']);
				referencesCodeLensProvider.setEnabled(updatedGoConfig['enableCodeLens']['references']);
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
				if (lintDiagnosticCollection && lintDiagnosticCollection.name !== lintTool) {
					lintDiagnosticCollection.dispose();
					lintDiagnosticCollection = vscode.languages.createDiagnosticCollection(lintTool);
					ctx.subscriptions.push(lintDiagnosticCollection);
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

	registerCommand('go.test.generate.package', () => goGenerateTests.generateTestCurrentPackage);
	registerCommand('go.test.generate.file', () => goGenerateTests.generateTestCurrentFile);
	registerCommand('go.test.generate.function', () => goGenerateTests.generateTestCurrentFunction);
	registerCommand('go.toggle.test.file', () => goGenerateTests.toggleTestFile);
	registerCommand('go.debug.startSession', commands.startDebugSession);
	registerCommand('go.show.commands', commands.showCommands);
	registerCommand('go.get.package', () => goGetPackage);
	registerCommand('go.playground', () => playgroundCommand);
	registerCommand('go.lint.package', () => () => lintCode('package'));
	registerCommand('go.lint.workspace', () => () => lintCode('workspace'));
	registerCommand('go.lint.file', () => () => lintCode('file'));
	registerCommand('go.vet.package', () => vetCode);
	registerCommand('go.vet.workspace', () => () => vetCode(true));
	registerCommand('go.build.package', () => buildCode);
	registerCommand('go.build.workspace', () => () => buildCode(true));
	registerCommand('go.install.package', () => installCurrentPackage);
	registerCommand('go.run.modinit', () => goModInit);
	registerCommand('go.extractServerChannel', (_ctx, goCtx) => () => showServerOutputChannel(goCtx));
	registerCommand('go.workspace.resetState', () => resetWorkspaceState);
	registerCommand('go.global.resetState', () => resetGlobalState);
	registerCommand('go.toggle.gc_details', commands.toggleGCDetails);
	registerCommand('go.apply.coverprofile', commands.applyCoverprofile);

	// Go Enviornment switching commands
	registerCommand('go.environment.choose', () => chooseGoEnvironment);

	// Survey related commands
	registerCommand('go.survey.showConfig', (_ctx, goCtx) => () => showSurveyConfig(goCtx));
	registerCommand('go.survey.resetConfig', () => resetSurveyConfigs);

	vscode.languages.setLanguageConfiguration(GO_MODE.language, {
		wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)/g
	});

	return extensionAPI;
}

export function deactivate() {
	return Promise.all([
		cancelRunningTests(),
		killRunningPprof(),
		Promise.resolve(cleanupTempDir()),
		Promise.resolve(disposeGoStatusBar())
	]);
}

function runBuilds(document: vscode.TextDocument, goConfig: vscode.WorkspaceConfiguration) {
	if (document.languageId !== 'go') {
		return;
	}

	buildDiagnosticCollection.clear();
	lintDiagnosticCollection.clear();
	vetDiagnosticCollection.clear();
	check(document.uri, goConfig)
		.then((results) => {
			results.forEach((result) => {
				handleDiagnosticErrors(document, result.errors, result.diagnosticCollection);
			});
		})
		.catch((err) => {
			vscode.window.showInformationMessage('Error: ' + err);
		});
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
				runBuilds(document, getGoConfig(document.uri));
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

// exported for testing
export async function listOutdatedTools(configuredGoVersion: GoVersion, allTools: Tool[]): Promise<Tool[]> {
	if (!configuredGoVersion || !configuredGoVersion.sv) {
		return [];
	}

	const { major, minor } = configuredGoVersion.sv;

	const oldTools = await Promise.all(
		allTools.map(async (tool) => {
			const toolPath = getBinPath(tool.name);
			if (!path.isAbsolute(toolPath)) {
				return;
			}
			const m = await inspectGoToolVersion(toolPath);
			if (!m) {
				console.log(`failed to get go tool version: ${toolPath}`);
				return;
			}
			const { goVersion } = m;
			if (!goVersion) {
				// TODO: we cannot tell whether the tool was compiled with a newer version of go
				// or compiled in an unconventional way.
				return;
			}
			const toolGoVersion = new GoVersion('', `go version ${goVersion} os/arch`);
			if (!toolGoVersion || !toolGoVersion.sv) {
				return tool;
			}
			if (
				major > toolGoVersion.sv.major ||
				(major === toolGoVersion.sv.major && minor > toolGoVersion.sv.minor)
			) {
				return tool;
			}
			// special case: if the tool was compiled with beta or rc, and the current
			// go version is a stable version, let's ask to recompile.
			if (
				major === toolGoVersion.sv.major &&
				minor === toolGoVersion.sv.minor &&
				(goVersion.includes('beta') || goVersion.includes('rc')) &&
				// We assume tools compiled with different rc/beta need to be recompiled.
				// We test the inequality by checking whether the exact beta or rc version
				// appears in the `go version` output. e.g.,
				//   configuredGoVersion.version      	goVersion(tool)		update
				//   'go version go1.18 ...'    		'go1.18beta1'		Yes
				//   'go version go1.18beta1 ...'		'go1.18beta1'		No
				//   'go version go1.18beta2 ...'		'go1.18beta1'		Yes
				//   'go version go1.18rc1 ...'			'go1.18beta1'		Yes
				//   'go version go1.18rc1 ...'			'go1.18'			No
				//   'go version devel go1.18-deadbeaf ...'	'go1.18beta1'	No (* rare)
				!configuredGoVersion.version.includes(goVersion)
			) {
				return tool;
			}
			return;
		})
	);
	return oldTools.filter((tool): tool is Tool => !!tool);
}

async function suggestUpdates(ctx: vscode.ExtensionContext) {
	const configuredGoVersion = await getGoVersion();
	if (!configuredGoVersion || configuredGoVersion.lt('1.12')) {
		// User is using an ancient or a dev version of go. Don't suggest updates -
		// user should know what they are doing.
		return;
	}

	const allTools = getConfiguredTools(configuredGoVersion, getGoConfig(), getGoplsConfig());
	const toolsToUpdate = await listOutdatedTools(configuredGoVersion, allTools);
	if (toolsToUpdate.length === 0) {
		return;
	}

	// If the user has opted in to automatic tool updates, we can update
	// without prompting.
	const toolsManagementConfig = getGoConfig()['toolsManagement'];
	if (toolsManagementConfig && toolsManagementConfig['autoUpdate'] === true) {
		installTools(toolsToUpdate, configuredGoVersion, true);
	} else {
		const updateToolsCmdText = 'Update tools';
		const selected = await vscode.window.showWarningMessage(
			`Tools (${toolsToUpdate.map((tool) => tool.name).join(', ')}) need recompiling to work with ${
				configuredGoVersion.version
			}`,
			updateToolsCmdText
		);
		if (selected === updateToolsCmdText) {
			installTools(toolsToUpdate, configuredGoVersion);
		}
	}
}

function lintDiagnosticCollectionName(lintToolName: string) {
	if (!lintToolName || lintToolName === 'golint') {
		return 'go-lint';
	}
	return `go-${lintToolName}`;
}

// set GOROOT env var. If necessary, shows a warning.
export async function setGOROOTEnvVar(configGOROOT: string) {
	if (!configGOROOT) {
		return;
	}
	const goroot = configGOROOT ? resolvePath(configGOROOT) : undefined;

	const currentGOROOT = process.env['GOROOT'];
	if (goroot === currentGOROOT) {
		return;
	}
	if (!(await dirExists(goroot ?? ''))) {
		vscode.window.showWarningMessage(`go.goroot setting is ignored. ${goroot} is not a valid GOROOT directory.`);
		return;
	}
	const neverAgain = { title: "Don't Show Again" };
	const ignoreGOROOTSettingWarningKey = 'ignoreGOROOTSettingWarning';
	const ignoreGOROOTSettingWarning = getFromGlobalState(ignoreGOROOTSettingWarningKey);
	if (!ignoreGOROOTSettingWarning) {
		vscode.window
			.showInformationMessage(
				`"go.goroot" setting (${goroot}) will be applied and set the GOROOT environment variable.`,
				neverAgain
			)
			.then((result) => {
				if (result === neverAgain) {
					updateGlobalState(ignoreGOROOTSettingWarningKey, true);
				}
			});
	}

	logVerbose(`setting GOROOT = ${goroot} (old value: ${currentGOROOT}) because "go.goroot": "${configGOROOT}"`);
	if (goroot) {
		process.env['GOROOT'] = goroot;
	} else {
		delete process.env.GOROOT;
	}
}
