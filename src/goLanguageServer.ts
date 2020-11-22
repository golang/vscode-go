/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import deepEqual = require('deep-equal');
import fs = require('fs');
import moment = require('moment');
import path = require('path');
import semver = require('semver');
import util = require('util');
import vscode = require('vscode');
import {
	CancellationToken,
	CloseAction,
	CompletionItemKind,
	ConfigurationParams,
	ConfigurationRequest,
	ErrorAction,
	HandleDiagnosticsSignature,
	InitializeError,
	Message,
	ProvideCodeLensesSignature,
	ProvideCompletionItemsSignature,
	ProvideDocumentLinksSignature,
	ResponseError,
	RevealOutputChannelOn
} from 'vscode-languageclient';
import {
	LanguageClient
} from 'vscode-languageclient/node';
import WebRequest = require('web-request');
import { extensionId } from './const';
import { GoCodeActionProvider } from './goCodeAction';
import { GoDefinitionProvider } from './goDeclaration';
import { toolExecutionEnvironment } from './goEnv';
import { GoHoverProvider } from './goExtraInfo';
import { GoDocumentFormattingEditProvider } from './goFormat';
import { GoImplementationProvider } from './goImplementations';
import { promptForMissingTool, promptForUpdatingTool } from './goInstallTools';
import { parseLiveFile } from './goLiveErrors';
import { restartLanguageServer } from './goMain';
import { GO_MODE } from './goMode';
import { GoDocumentSymbolProvider } from './goOutline';
import { GoReferenceProvider } from './goReferences';
import { GoRenameProvider } from './goRename';
import { GoSignatureHelpProvider } from './goSignature';
import { outputChannel, updateLanguageServerIconGoStatusBar } from './goStatus';
import { GoCompletionItemProvider } from './goSuggest';
import { GoWorkspaceSymbolProvider } from './goSymbol';
import { getTool, Tool } from './goTools';
import { GoTypeDefinitionProvider } from './goTypeDefinition';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { getBinPath, getCurrentGoPath, getGoConfig, getGoplsConfig, getWorkspaceFolderPath } from './util';
import { getToolFromToolPath } from './utils/pathUtils';

export interface LanguageServerConfig {
	serverName: string;
	path: string;
	version: string;
	modtime: Date;
	enabled: boolean;
	flags: string[];
	env: any;
	features: {
		diagnostics: boolean;
		documentLink: boolean;
	};
	checkForUpdates: boolean;
}

// Global variables used for management of the language client.
// They are global so that the server can be easily restarted with
// new configurations.
let languageClient: LanguageClient;
let languageServerDisposable: vscode.Disposable;
let latestConfig: LanguageServerConfig;
export let serverOutputChannel: vscode.OutputChannel;
export let languageServerIsRunning = false;
let serverTraceChannel: vscode.OutputChannel;
let crashCount = 0;

// defaultLanguageProviders is the list of providers currently registered.
let defaultLanguageProviders: vscode.Disposable[] = [];

// restartCommand is the command used by the user to restart the language
// server.
let restartCommand: vscode.Disposable;

// When enabled, users may be prompted to fill out the gopls survey.
// For now, we turn it on in the Nightly extension to test it.
const goplsSurveyOn: boolean = isNightly();

// lastUserAction is the time of the last user-triggered change.
// A user-triggered change is a didOpen, didChange, didSave, or didClose event.
let lastUserAction: Date = new Date();

// startLanguageServerWithFallback starts the language server, if enabled,
// or falls back to the default language providers.
export async function startLanguageServerWithFallback(ctx: vscode.ExtensionContext, activation: boolean) {
	const cfg = buildLanguageServerConfig(getGoConfig());

	// If the language server is gopls, we enable a few additional features.
	// These include prompting for updates and surveys.
	if (activation && cfg.serverName === 'gopls') {
		const tool = getTool(cfg.serverName);
		if (tool) {
			scheduleGoplsSuggestions(tool);
		}
	}

	const started = await startLanguageServer(ctx, cfg);

	// If the server has been disabled, or failed to start,
	// fall back to the default providers, while making sure not to
	// re-register any providers.
	if (!started && defaultLanguageProviders.length === 0) {
		registerDefaultProviders(ctx);
	}

	languageServerIsRunning = started;
	updateLanguageServerIconGoStatusBar(started, cfg.serverName);
}

// scheduleGoplsSuggestions sets timeouts for the various gopls-specific
// suggestions. We check user's gopls versions once per day to prompt users to
// update to the latest version. We also check if we should prompt users to
// fill out the survey.
function scheduleGoplsSuggestions(tool: Tool) {
	const update = async () => {
		setTimeout(update, timeDay);

		const cfg = buildLanguageServerConfig(getGoConfig());
		if (!cfg.enabled) {
			return;
		}
		const versionToUpdate = await shouldUpdateLanguageServer(tool, cfg);
		if (versionToUpdate) {
			promptForUpdatingTool(tool.name, versionToUpdate);
		}
	};
	const survey = async () => {
		setTimeout(survey, timeDay);

		const cfg = buildLanguageServerConfig(getGoConfig());
		if (!goplsSurveyOn || !cfg.enabled) {
			return;
		}
		maybePromptForGoplsSurvey();
	};

	setTimeout(update, 10 * timeMinute);
	setTimeout(survey, 30 * timeMinute);
}

async function startLanguageServer(ctx: vscode.ExtensionContext, config: LanguageServerConfig): Promise<boolean> {
	// If the client has already been started, make sure to clear existing
	// diagnostics and stop it.
	if (languageClient) {
		if (languageClient.diagnostics) {
			languageClient.diagnostics.clear();
		}
		await languageClient.stop();
		if (languageServerDisposable) {
			languageServerDisposable.dispose();
		}
	}

	// Check if we should recreate the language client. This may be necessary
	// if the user has changed settings in their config.
	if (!deepEqual(latestConfig, config)) {
		// Track the latest config used to start the language server,
		// and rebuild the language client.
		latestConfig = config;
		languageClient = await buildLanguageClient(buildLanguageClientOption(config));
		crashCount = 0;
	}

	// If the user has not enabled the language server, return early.
	if (!config.enabled) {
		return false;
	}

	// Set up the command to allow the user to manually restart the
	// language server.
	if (!restartCommand) {
		restartCommand = vscode.commands.registerCommand('go.languageserver.restart', async () => {
			await suggestGoplsIssueReport(
				`Looks like you're about to manually restart the language server.`,
				errorKind.manualRestart);
			restartLanguageServer();
		});
		ctx.subscriptions.push(restartCommand);
	}

	// Before starting the language server, make sure to deregister any
	// currently registered language providers.
	disposeDefaultProviders();

	languageServerDisposable = languageClient.start();
	ctx.subscriptions.push(languageServerDisposable);
	return true;
}

export interface BuildLanguageClientOption extends LanguageServerConfig {
	outputChannel?: vscode.OutputChannel;
	traceOutputChannel?: vscode.OutputChannel;
}

// buildLanguageClientOption returns the default, extra configuration
// used in building a new LanguageClient instance. Options specified
// in LanguageServerConfig
function buildLanguageClientOption(cfg: LanguageServerConfig): BuildLanguageClientOption {
	// Reuse the same output channel for each instance of the server.
	if (cfg.enabled) {
		if (!serverOutputChannel) {
			serverOutputChannel = vscode.window.createOutputChannel(cfg.serverName + ' (server)');
		}
		if (!serverTraceChannel) {
			serverTraceChannel = vscode.window.createOutputChannel(cfg.serverName);
		}
	}
	return Object.assign({
		outputChannel: serverOutputChannel,
		traceOutputChannel: serverTraceChannel
	}, cfg);
}

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(cfg: BuildLanguageClientOption): Promise<LanguageClient> {
	let goplsWorkspaceConfig = getGoplsConfig();
	goplsWorkspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, goplsWorkspaceConfig);
	const c = new LanguageClient(
		'go',  // id
		cfg.serverName,  // name e.g. gopls
		{
			command: cfg.path,
			args: ['-mode=stdio', ...cfg.flags],
			options: { env: cfg.env },
		},
		{
			initializationOptions: goplsWorkspaceConfig,
			documentSelector: [
				// Filter out unsupported document types, e.g. vsls, git.
				// https://docs.microsoft.com/en-us/visualstudio/liveshare/reference/extensions#visual-studio-code-1
				//
				// - files
				{ language: 'go', scheme: 'file' },
				{ language: 'go.mod', scheme: 'file' },
				{ language: 'go.sum', scheme: 'file' },
				// - unsaved files
				{ language: 'go', scheme: 'untitled' },
				{ language: 'go.mod', scheme: 'untitled' },
				{ language: 'go.sum', scheme: 'untitled' },
			],
			uriConverters: {
				// Apply file:/// scheme to all file paths.
				code2Protocol: (uri: vscode.Uri): string =>
					(uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
				protocol2Code: (uri: string) => vscode.Uri.parse(uri)
			},
			outputChannel: cfg.outputChannel,
			traceOutputChannel: cfg.traceOutputChannel,
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			initializationFailedHandler: (error: WebRequest.ResponseError<InitializeError>): boolean => {
				vscode.window.showErrorMessage(
					`The language server is not able to serve any features. Initialization failed: ${error}. `
				);
				suggestGoplsIssueReport(`The gopls server failed to initialize.`, errorKind.initializationFailure);
				return false;
			},
			errorHandler: {
				error: (error: Error, message: Message, count: number): ErrorAction => {
					vscode.window.showErrorMessage(
						`Error communicating with the language server: ${error}: ${message}.`
					);
					// Allow 5 crashes before shutdown.
					if (count < 5) {
						return ErrorAction.Continue;
					}
					return ErrorAction.Shutdown;
				},
				closed: (): CloseAction => {
					// Allow 5 crashes before shutdown.
					crashCount++;
					if (crashCount < 5) {
						return CloseAction.Restart;
					}
					suggestGoplsIssueReport(
						`The connection to gopls has been closed. The gopls server may have crashed.`,
						errorKind.crash);
					return CloseAction.DoNotRestart;
				},
			},
			middleware: {
				provideCodeLenses: async (
					doc: vscode.TextDocument,
					token: vscode.CancellationToken,
					next: ProvideCodeLensesSignature
				): Promise<vscode.CodeLens[]> => {
					const codeLens = await next(doc, token);
					if (!codeLens || codeLens.length === 0) {
						return codeLens;
					}
					const goplsEnabledLens = (getGoConfig().get('overwriteGoplsMiddleware') as any)?.codelens ?? {};
					return codeLens.reduce((lenses: vscode.CodeLens[], lens: vscode.CodeLens) => {
						switch (lens.command.title) {
							case 'run test': {
								if (goplsEnabledLens.test) {
									return [...lenses, lens];
								}
								return [...lenses, ...createTestCodeLens(lens)];
							}
							case 'run benchmark': {
								if (goplsEnabledLens.bench) {
									return [...lenses, lens];
								}
								return [...lenses, ...createBenchmarkCodeLens(lens)];
							}
							default: {
								return [...lenses, lens];
							}
						}
					}, []);
				},
				handleDiagnostics: (
					uri: vscode.Uri,
					diagnostics: vscode.Diagnostic[],
					next: HandleDiagnosticsSignature
				) => {
					if (!cfg.features.diagnostics) {
						return null;
					}
					return next(uri, diagnostics);
				},
				provideDocumentLinks: (
					document: vscode.TextDocument,
					token: vscode.CancellationToken,
					next: ProvideDocumentLinksSignature
				) => {
					if (!cfg.features.documentLink) {
						return null;
					}
					return next(document, token);
				},
				provideCompletionItem: async (
					document: vscode.TextDocument,
					position: vscode.Position,
					context: vscode.CompletionContext,
					token: vscode.CancellationToken,
					next: ProvideCompletionItemsSignature
				) => {
					const list = await next(document, position, context, token);
					if (!list) {
						return list;
					}
					const items = Array.isArray(list) ? list : list.items;

					// Give all the candidates the same filterText to trick VSCode
					// into not reordering our candidates. All the candidates will
					// appear to be equally good matches, so VSCode's fuzzy
					// matching/ranking just maintains the natural "sortText"
					// ordering. We can only do this in tandem with
					// "incompleteResults" since otherwise client side filtering is
					// important.
					if (!Array.isArray(list) && list.isIncomplete && list.items.length > 1) {
						let hardcodedFilterText = items[0].filterText;
						if (!hardcodedFilterText) {
							// tslint:disable:max-line-length
							// According to LSP spec,
							// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textDocument_completion
							// if filterText is falsy, the `label` should be used.
							// But we observed that's not the case.
							// Even if vscode picked the label value, that would
							// cause to reorder candiates, which is not ideal.
							// Force to use non-empty `label`.
							// https://github.com/golang/vscode-go/issues/441
							hardcodedFilterText = items[0].label;
						}
						for (const item of items) {
							item.filterText = hardcodedFilterText;
						}
					}
					// TODO(hyangah): when v1.42+ api is available, we can simplify
					// language-specific configuration lookup using the new
					// ConfigurationScope.
					//    const paramHintsEnabled = vscode.workspace.getConfiguration(
					//          'editor.parameterHints',
					//          { languageId: 'go', uri: document.uri });
					const editorParamHintsEnabled = vscode.workspace.getConfiguration(
						'editor.parameterHints',
						document.uri
					)['enabled'];
					const goParamHintsEnabled = vscode.workspace.getConfiguration('[go]', document.uri)[
						'editor.parameterHints.enabled'
					];
					let paramHintsEnabled: boolean = false;
					if (typeof goParamHintsEnabled === 'undefined') {
						paramHintsEnabled = editorParamHintsEnabled;
					} else {
						paramHintsEnabled = goParamHintsEnabled;
					}
					// If the user has parameterHints (signature help) enabled,
					// trigger it for function or method completion items.
					if (paramHintsEnabled) {
						for (const item of items) {
							if (item.kind === CompletionItemKind.Method || item.kind === CompletionItemKind.Function) {
								item.command = { title: 'triggerParameterHints', command: 'editor.action.triggerParameterHints' };
							}
						}
					}
					return list;
				},
				// Keep track of the last file change in order to not prompt
				// user if they are actively working.
				didOpen: (e, next) => {
					lastUserAction = new Date();
					next(e);
				},
				didChange: (e, next) => {
					lastUserAction = new Date();
					next(e);
				},
				didClose: (e, next) => {
					lastUserAction = new Date();
					next(e);
				},
				didSave: (e, next) => {
					lastUserAction = new Date();
					next(e);
				},
				workspace: {
					configuration: async (params: ConfigurationParams, token: CancellationToken, next: ConfigurationRequest.HandlerSignature): Promise<any[] | ResponseError<void>> => {
						const configs = await next(params, token);
						if (!Array.isArray(configs)) {
							return configs;
						}
						for (let workspaceConfig of configs) {
							workspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, workspaceConfig);
						}
						return configs;
					},
				},
			}
		}
	);
	return c;
}

// adjustGoplsWorkspaceConfiguration adds any extra options to the gopls
// config. Right now, the only extra option is enabling experiments for the
// Nightly extension.
async function adjustGoplsWorkspaceConfiguration(cfg: LanguageServerConfig, config: any): Promise<any> {
	if (!config) {
		return config;
	}
	// Only modify the user's configurations for the Nightly.
	if (extensionId !== 'golang.go-nightly') {
		return config;
	}
	// allExperiments is only available with gopls/v0.5.2 and above.
	const version = await getLocalGoplsVersion(cfg);
	if (!version) {
		return config;
	}
	const sv = semver.parse(version, true);
	if (!sv || semver.lt(sv, 'v0.5.2')) {
		return config;
	}
	const newConfig = Object.assign({}, config);
	if (!config['allExperiments']) {
		newConfig['allExperiments'] = true;
	}
	return newConfig;
}

// createTestCodeLens adds the go.test.cursor and go.debug.cursor code lens
function createTestCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
	// CodeLens argument signature in gopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
	// so this needs to be deconstructured here
	// Note that there will always only be one test function name in this context
	if (lens.command.arguments.length < 2 || lens.command.arguments[1].length < 1) {
		return [lens];
	}
	return [
		new vscode.CodeLens(lens.range, {
			...lens.command,
			command: 'go.test.cursor',
			arguments: [{ functionName: lens.command.arguments[1][0] }],
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug test',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command.arguments[1][0] }],
		}),
	];
}

function createBenchmarkCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
	// CodeLens argument signature in gopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
	// so this needs to be deconstructured here
	// Note that there will always only be one benchmark function name in this context
	if (lens.command.arguments.length < 3 || lens.command.arguments[2].length < 1) {
		return [lens];
	}
	return [
		new vscode.CodeLens(lens.range, {
			...lens.command,
			command: 'go.benchmark.cursor',
			arguments: [{ functionName: lens.command.arguments[2][0] }],
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug benchmark',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command.arguments[2][0] }],
		}),
	];
}

// registerUsualProviders registers the language feature providers if the language server is not enabled.
function registerDefaultProviders(ctx: vscode.ExtensionContext) {
	const completionProvider = new GoCompletionItemProvider(ctx.globalState);
	defaultLanguageProviders.push(completionProvider);
	defaultLanguageProviders.push(vscode.languages.registerCompletionItemProvider(GO_MODE, completionProvider, '.', '"'));
	defaultLanguageProviders.push(vscode.languages.registerHoverProvider(GO_MODE, new GoHoverProvider()));
	defaultLanguageProviders.push(vscode.languages.registerDefinitionProvider(GO_MODE, new GoDefinitionProvider()));
	defaultLanguageProviders.push(vscode.languages.registerReferenceProvider(GO_MODE, new GoReferenceProvider()));
	defaultLanguageProviders.push(
		vscode.languages.registerDocumentSymbolProvider(GO_MODE, new GoDocumentSymbolProvider())
	);
	defaultLanguageProviders.push(vscode.languages.registerWorkspaceSymbolProvider(new GoWorkspaceSymbolProvider()));
	defaultLanguageProviders.push(
		vscode.languages.registerSignatureHelpProvider(GO_MODE, new GoSignatureHelpProvider(), '(', ',')
	);
	defaultLanguageProviders.push(
		vscode.languages.registerImplementationProvider(GO_MODE, new GoImplementationProvider())
	);
	defaultLanguageProviders.push(
		vscode.languages.registerDocumentFormattingEditProvider(GO_MODE, new GoDocumentFormattingEditProvider())
	);
	defaultLanguageProviders.push(
		vscode.languages.registerTypeDefinitionProvider(GO_MODE, new GoTypeDefinitionProvider())
	);
	defaultLanguageProviders.push(vscode.languages.registerRenameProvider(GO_MODE, new GoRenameProvider()));
	defaultLanguageProviders.push(vscode.workspace.onDidChangeTextDocument(parseLiveFile, null, ctx.subscriptions));
	defaultLanguageProviders.push(vscode.languages.registerCodeActionsProvider(GO_MODE, new GoCodeActionProvider()));

	for (const provider of defaultLanguageProviders) {
		ctx.subscriptions.push(provider);
	}
}

function disposeDefaultProviders() {
	for (const disposable of defaultLanguageProviders) {
		disposable.dispose();
	}
	defaultLanguageProviders = [];
}

export function watchLanguageServerConfiguration(e: vscode.ConfigurationChangeEvent) {
	if (!e.affectsConfiguration('go')) {
		return;
	}

	if (
		e.affectsConfiguration('go.useLanguageServer') ||
		e.affectsConfiguration('go.languageServerFlags') ||
		e.affectsConfiguration('go.languageServerExperimentalFeatures') ||
		e.affectsConfiguration('go.alternateTools') ||
		e.affectsConfiguration('go.toolsEnvVars')
		// TODO: Should we check http.proxy too? That affects toolExecutionEnvironment too.
	) {
		restartLanguageServer();
	}
}

export function buildLanguageServerConfig(goConfig: vscode.WorkspaceConfiguration): LanguageServerConfig {

	const cfg: LanguageServerConfig = {
		serverName: '',
		path: '',
		version: '', // compute version lazily
		modtime: null,
		enabled: goConfig['useLanguageServer'] === true,
		flags: goConfig['languageServerFlags'] || [],
		features: {
			// TODO: We should have configs that match these names.
			// Ultimately, we should have a centralized language server config rather than separate fields.
			diagnostics: goConfig['languageServerExperimentalFeatures']['diagnostics'],
			documentLink: goConfig['languageServerExperimentalFeatures']['documentLink']
		},
		env: toolExecutionEnvironment(),
		checkForUpdates: goConfig['useGoProxyToCheckForToolUpdates']
	};
	// Don't look for the path if the server is not enabled.
	if (!cfg.enabled) {
		return cfg;
	}
	const languageServerPath = getLanguageServerToolPath();
	if (!languageServerPath) {
		// Assume the getLanguageServerToolPath will show the relevant
		// errors to the user. Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.path = languageServerPath;
	cfg.serverName = getToolFromToolPath(cfg.path);

	// Get the mtime of the language server binary so that we always pick up
	// the right version.
	const stats = fs.statSync(languageServerPath);
	if (!stats) {
		vscode.window.showErrorMessage(`Unable to stat path to language server binary: ${languageServerPath}.
Please try reinstalling it.`);
		// Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.modtime = stats.mtime;

	return cfg;
}

/**
 *
 * Return the absolute path to the correct binary. If the required tool is not available,
 * prompt the user to install it. Only gopls is officially supported.
 */
export function getLanguageServerToolPath(): string {
	const goConfig = getGoConfig();
	// Check that all workspace folders are configured with the same GOPATH.
	if (!allFoldersHaveSameGopath()) {
		vscode.window.showInformationMessage(
			'The Go language server is currently not supported in a multi-root set-up with different GOPATHs.'
		);
		return;
	}
	// Get the path to gopls (getBinPath checks for alternate tools).
	const goplsBinaryPath = getBinPath('gopls');
	if (path.isAbsolute(goplsBinaryPath)) {
		return goplsBinaryPath;
	}
	const alternateTools = goConfig['alternateTools'];
	if (alternateTools) {
		// The user's alternate language server was not found.
		const goplsAlternate = alternateTools['gopls'];
		if (goplsAlternate) {
			vscode.window.showErrorMessage(
				`Cannot find the alternate tool ${goplsAlternate} configured for gopls.
Please install it and reload this VS Code window.`
			);
			return;
		}
		// Check if the user has the deprecated "go-langserver" setting.
		// Suggest deleting it if the alternate tool is gopls.
		if (alternateTools['go-langserver']) {
			vscode.window.showErrorMessage(`Support for "go-langserver" has been deprecated.
The recommended language server is gopls. Delete the alternate tool setting for "go-langserver" to use gopls, or change "go-langserver" to "gopls" in your settings.json and reload the VS Code window.`);
			return;
		}
	}

	// Prompt the user to install gopls.
	promptForMissingTool('gopls');
}

function allFoldersHaveSameGopath(): boolean {
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 1) {
		return true;
	}
	const tempGopath = getCurrentGoPath(vscode.workspace.workspaceFolders[0].uri);
	return vscode.workspace.workspaceFolders.find((x) => tempGopath !== getCurrentGoPath(x.uri)) ? false : true;
}

export async function shouldUpdateLanguageServer(
	tool: Tool,
	cfg: LanguageServerConfig,
): Promise<semver.SemVer> {
	// Only support updating gopls for now.
	if (tool.name !== 'gopls') {
		return null;
	}

	// First, run the "gopls version" command and parse its results.
	// TODO(rstambler): Confirm that the gopls binary's modtime matches the
	// modtime in the config. Update it if needed.
	const usersVersion = await getLocalGoplsVersion(cfg);

	// We might have a developer version. Don't make the user update.
	if (usersVersion === '(devel)') {
		return null;
	}

	// Get the latest gopls version. If it is for nightly, using the prereleased version is ok.
	let latestVersion = cfg.checkForUpdates ? await getLatestGoplsVersion(tool) : tool.latestVersion;

	// If we failed to get the gopls version, pick the one we know to be latest at the time of this extension's last update
	if (!latestVersion) {
		latestVersion = tool.latestVersion;
	}

	// If "gopls" is so old that it doesn't have the "gopls version" command,
	// or its version doesn't match our expectations, usersVersion will be empty or invalid.
	// Suggest the latestVersion.
	if (!usersVersion || !semver.valid(usersVersion)) {
		return latestVersion;
	}

	// The user may have downloaded golang.org/x/tools/gopls@master,
	// which means that they have a pseudoversion.
	const usersTime = parseTimestampFromPseudoversion(usersVersion);
	// If the user has a pseudoversion, get the timestamp for the latest gopls version and compare.
	if (usersTime) {
		let latestTime = cfg.checkForUpdates ?
			await getTimestampForVersion(tool, latestVersion) : tool.latestVersionTimestamp;
		if (!latestTime) {
			latestTime = tool.latestVersionTimestamp;
		}
		return usersTime.isBefore(latestTime) ? latestVersion : null;
	}

	// If the user's version does not contain a timestamp,
	// default to a semver comparison of the two versions.
	const usersVersionSemver = semver.parse(usersVersion, {
		includePrerelease: true,
		loose: true,
	});
	return semver.lt(usersVersionSemver, latestVersion) ? latestVersion : null;
}

// Copied from src/cmd/go/internal/modfetch.go.
const pseudoVersionRE = /^v[0-9]+\.(0\.0-|\d+\.\d+-([^+]*\.)?0\.)\d{14}-[A-Za-z0-9]+(\+incompatible)?$/;

// parseTimestampFromPseudoversion returns the timestamp for the given
// pseudoversion. The timestamp is the center component, and it has the
// format "YYYYMMDDHHmmss".
function parseTimestampFromPseudoversion(version: string): moment.Moment {
	const split = version.split('-');
	if (split.length < 2) {
		return null;
	}
	if (!semver.valid(version)) {
		return null;
	}
	if (!pseudoVersionRE.test(version)) {
		return null;
	}
	const sv = semver.coerce(version);
	if (!sv) {
		return null;
	}
	// Copied from src/cmd/go/internal/modfetch.go.
	const build = sv.build.join('.');
	const buildIndex = version.lastIndexOf(build);
	if (buildIndex >= 0) {
		version = version.substring(0, buildIndex);
	}
	const lastDashIndex = version.lastIndexOf('-');
	version = version.substring(0, lastDashIndex);
	const firstDashIndex = version.lastIndexOf('-');
	const dotIndex = version.lastIndexOf('.');
	let timestamp: string;
	if (dotIndex > firstDashIndex) {
		// "vX.Y.Z-pre.0" or "vX.Y.(Z+1)-0"
		timestamp = version.substring(dotIndex + 1);
	} else {
		// "vX.0.0"
		timestamp = version.substring(firstDashIndex + 1);
	}
	return moment.utc(timestamp, 'YYYYMMDDHHmmss');
}

export const getTimestampForVersion = async (tool: Tool, version: semver.SemVer) => {
	const data = await goProxyRequest(tool, `v${version.format()}.info`);
	if (!data) {
		return null;
	}
	const time = moment(data['Time']);
	return time;
};

const acceptGoplsPrerelease = isNightly();

export const getLatestGoplsVersion = async (tool: Tool) => {
	// If the user has a version of gopls that we understand,
	// ask the proxy for the latest version, and if the user's version is older,
	// prompt them to update.
	const data = await goProxyRequest(tool, 'list');
	if (!data) {
		return null;
	}
	// Coerce the versions into SemVers so that they can be sorted correctly.
	const versions = [];
	for (const version of data.trim().split('\n')) {
		const parsed = semver.parse(version, {
			includePrerelease: true,
			loose: true
		});
		if (parsed) {
			versions.push(parsed);
		}
	}
	if (versions.length === 0) {
		return null;
	}
	versions.sort(semver.rcompare);

	if (acceptGoplsPrerelease) {
		return versions[0]; // The first one (newest one).
	}
	// The first version in the sorted list without a prerelease tag.
	return versions.find((version) => !version.prerelease || !version.prerelease.length);
};

// getLocalGoplsVersion returns the version of gopls that is currently
// installed on the user's machine. This is determined by running the
// `gopls version` command.
//
// If this command has already been executed, it returns the saved result.
export const getLocalGoplsVersion = async (cfg: LanguageServerConfig) => {
	if (cfg.version !== '') {
		return cfg.version;
	}
	const execFile = util.promisify(cp.execFile);
	let output: any;
	try {
		const env = toolExecutionEnvironment();
		const cwd = getWorkspaceFolderPath();
		const { stdout } = await execFile(cfg.path, ['version'], { env, cwd });
		output = stdout;
	} catch (e) {
		// The "gopls version" command is not supported, or something else went wrong.
		// TODO: Should we propagate this error?
		return null;
	}

	const lines = <string>output.trim().split('\n');
	switch (lines.length) {
		case 0:
			// No results, should update.
			// Worth doing anything here?
			return null;
		case 1:
			// Built in $GOPATH mode. Should update.
			// TODO: Should we check the Go version here?
			// Do we even allow users to enable gopls if their Go version is too low?
			return null;
		case 2:
			// We might actually have a parseable version.
			break;
		default:
			return null;
	}

	// The second line should be the sum line.
	// It should look something like this:
	//
	//    golang.org/x/tools/gopls@v0.1.3 h1:CB5ECiPysqZrwxcyRjN+exyZpY0gODTZvNiqQi3lpeo=
	//
	// TODO(stamblerre): We should use a regex to match this, but for now, we split on the @ symbol.
	// The reasoning for this is that gopls still has a golang.org/x/tools/cmd/gopls binary,
	// so users may have a developer version that looks like "golang.org/x/tools@(devel)".
	const moduleVersion = lines[1].trim().split(' ')[0];

	// Get the relevant portion, that is:
	//
	//    golang.org/x/tools/gopls@v0.1.3
	//
	const split = moduleVersion.trim().split('@');
	if (split.length < 2) {
		return null;
	}
	// The version comes after the @ symbol:
	//
	//    v0.1.3
	//
	cfg.version = split[1];
	return cfg.version;
};

async function goProxyRequest(tool: Tool, endpoint: string): Promise<any> {
	// Get the user's value of GOPROXY.
	// If it is not set, we cannot make the request.
	const output: string = process.env['GOPROXY'];
	if (!output || !output.trim()) {
		return null;
	}
	// Try each URL set in the user's GOPROXY environment variable.
	// If none is set, don't make the request.
	const proxies = output.trim().split(/,|\|/);
	for (const proxy of proxies) {
		if (proxy === 'direct') {
			continue;
		}
		const url = `${proxy}/${tool.importPath}/@v/${endpoint}`;
		let data: string;
		try {
			data = await WebRequest.json<string>(url, {
				throwResponseError: true
			});
		} catch (e) {
			console.log(`Error sending request to ${proxy}: ${e}`);
			return null;
		}
		return data;
	}
	return null;
}

// SurveyConfig is the set of global properties used to determine if
// we should prompt a user to take the gopls survey.
export interface SurveyConfig {
	// prompt is true if the user can be prompted to take the survey.
	// It is false if the user has responded "Never" to the prompt.
	prompt?: boolean;

	// promptThisMonth is true if we have used a random number generator
	// to determine if the user should be prompted this month.
	// It is undefined if we have not yet made the determination.
	promptThisMonth?: boolean;

	// dateToPromptThisMonth is the date on which we should prompt the user
	// this month.
	dateToPromptThisMonth?: Date;

	// dateComputedPromptThisMonth is the date on which the values of
	// promptThisMonth and dateToPromptThisMonth were set.
	dateComputedPromptThisMonth?: Date;

	// lastDatePrompted is the most recent date that the user has been prompted.
	lastDatePrompted?: Date;

	// lastDateAccepted is the most recent date that the user responded "Yes"
	// to the survey prompt. The user need not have completed the survey.
	lastDateAccepted?: Date;
}

function maybePromptForGoplsSurvey() {
	const now = new Date();
	let cfg = shouldPromptForGoplsSurvey(now, getSurveyConfig());
	if (!cfg) {
		return;
	}
	flushSurveyConfig(cfg);
	if (!cfg.dateToPromptThisMonth) {
		return;
	}
	const callback = async () => {
		const currentTime = new Date();

		// Make sure the user has been idle for at least a minute.
		if (minutesBetween(lastUserAction, currentTime) < 1) {
			setTimeout(callback, 5 * timeMinute);
			return;
		}
		cfg = await promptForSurvey(cfg, now);
		if (cfg) {
			flushSurveyConfig(cfg);
		}
	};
	const ms = msBetween(now, cfg.dateToPromptThisMonth);
	setTimeout(callback, ms);
}

export function shouldPromptForGoplsSurvey(now: Date, cfg: SurveyConfig): SurveyConfig {
	// If the prompt value is not set, assume we haven't prompted the user
	// and should do so.
	if (cfg.prompt === undefined) {
		cfg.prompt = true;
	}
	if (!cfg.prompt) {
		return;
	}

	// Check if the user has taken the survey in the last year.
	// Don't prompt them if they have been.
	if (cfg.lastDateAccepted) {
		if (daysBetween(now, cfg.lastDateAccepted) < 365) {
			return;
		}
	}

	// Check if the user has been prompted for the survey in the last 90 days.
	// Don't prompt them if they have been.
	if (cfg.lastDatePrompted) {
		if (daysBetween(now, cfg.lastDatePrompted) < 90) {
			return;
		}
	}

	// Check if the extension has been activated this month.
	if (cfg.dateComputedPromptThisMonth) {
		// The extension has been activated this month, so we should have already
		// decided if the user should be prompted.
		if (daysBetween(now, cfg.dateComputedPromptThisMonth) < 30) {
			return cfg;
		}
	}
	// This is the first activation this month (or ever), so decide if we
	// should prompt the user. This is done by generating a random number in
	// the range [0, 1) and checking if it is < probability, which varies
	// depending on whether the default or the nightly is in use.
	// We then randomly pick a day in the rest of the month on which to prompt
	// the user.
	let probability = 0.01; // lower probability for the regular extension
	if (isNightly()) {
		probability = 0.0275;
	}
	cfg.promptThisMonth = Math.random() < probability;
	if (cfg.promptThisMonth) {
		// end is the last day of the month, day is the random day of the
		// month on which to prompt.
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		const day = randomIntInRange(now.getUTCDate(), end.getUTCDate());
		cfg.dateToPromptThisMonth = new Date(now.getFullYear(), now.getMonth(), day);
	} else {
		cfg.dateToPromptThisMonth = undefined;
	}
	cfg.dateComputedPromptThisMonth = now;
	return cfg;
}

// isNightly returns true if the extension ID is the extension ID for the
// Nightly extension.
export function isNightly(): boolean {
	return extensionId === 'golang.go-nightly';
}

async function promptForSurvey(cfg: SurveyConfig, now: Date): Promise<SurveyConfig> {
	const selected = await vscode.window.showInformationMessage(`Looks like you're using gopls, the Go language server.
Would you be willing to fill out a quick survey about your experience with gopls?`, 'Yes', 'Not now', 'Never');

	// Update the time last asked.
	cfg.lastDatePrompted = now;

	switch (selected) {
		case 'Yes':
			cfg.lastDateAccepted = now;
			cfg.prompt = true;

			await vscode.env.openExternal(vscode.Uri.parse(`https://google.qualtrics.com/jfe/form/SV_ekAdHVcVcvKUojX`));
			break;
		case 'Not now':
			cfg.prompt = true;

			vscode.window.showInformationMessage(`No problem! We'll ask you again another time.`);
			break;
		case 'Never':
			cfg.prompt = false;

			vscode.window.showInformationMessage(`No problem! We won't ask again.`);
			break;
		default:
			// If the user closes the prompt without making a selection, treat it
			// like a "Not now" response.
			cfg.prompt = true;

			break;
	}
	return cfg;
}

export const goplsSurveyConfig = 'goplsSurveyConfig';

function getSurveyConfig(): SurveyConfig {
	const saved = getFromGlobalState(goplsSurveyConfig);
	if (saved === undefined) {
		return {};
	}
	try {
		const cfg = JSON.parse(saved, (key: string, value: any) => {
			// Make sure values that should be dates are correctly converted.
			if (key.toLowerCase().includes('date') || key.toLowerCase().includes('timestamp')) {
				return new Date(value);
			}
			return value;
		});
		return cfg;
	} catch (err) {
		console.log(`Error parsing JSON from ${saved}: ${err}`);
		return {};
	}
}

export async function showSurveyConfig() {
	outputChannel.appendLine('Gopls Survey Configuration');
	outputChannel.appendLine(JSON.stringify(getSurveyConfig(), null, 2));
	outputChannel.show();

	const selected = await vscode.window.showInformationMessage(`Maybe prompt for survey?`, 'Yes', 'No');
	switch (selected) {
		case 'Yes':
			maybePromptForGoplsSurvey();
			break;
		default:
			break;
	}
}

export function resetSurveyConfig() {
	flushSurveyConfig(null);
}

function flushSurveyConfig(cfg: SurveyConfig) {
	if (cfg) {
		updateGlobalState(goplsSurveyConfig, JSON.stringify(cfg));
	} else {
		updateGlobalState(goplsSurveyConfig, null);  // reset
	}
}

// errorKind refers to the different possible kinds of gopls errors.
enum errorKind {
	initializationFailure,
	crash,
	manualRestart,
}

// suggestGoplsIssueReport prompts users to file an issue with gopls.
async function suggestGoplsIssueReport(msg: string, reason: errorKind) {
	// Don't prompt users who manually restart to file issues until gopls/v1.0.
	if (reason === errorKind.manualRestart) {
		return;
	}

	// The user may have an outdated version of gopls, in which case we should
	// just prompt them to update, not file an issue.
	const tool = getTool('gopls');
	if (tool) {
		const versionToUpdate = await shouldUpdateLanguageServer(tool, latestConfig);
		if (versionToUpdate) {
			promptForUpdatingTool(tool.name, versionToUpdate, true);
			return;
		}
	}

	// Show the user the output channel content to alert them to the issue.
	serverOutputChannel.show();

	if (latestConfig.serverName !== 'gopls') {
		return;
	}
	const promptForIssueOnGoplsRestartKey = `promptForIssueOnGoplsRestart`;
	let saved: any;
	try {
		saved = JSON.parse(getFromGlobalState(promptForIssueOnGoplsRestartKey, false));
	} catch (err) {
		console.log(`Failed to parse as JSON ${getFromGlobalState(promptForIssueOnGoplsRestartKey, true)}: ${err}`);
		return;
	}
	// If the user has already seen this prompt, they may have opted-out for
	// the future. Only prompt again if it's been more than a year since.
	if (saved) {
		const dateSaved = new Date(saved['date']);
		const prompt = <boolean>saved['prompt'];
		if (!prompt && daysBetween(new Date(), dateSaved) <= 365) {
			return;
		}
	}
	const selected = await vscode.window.showInformationMessage(`${msg} Would you like to report a gopls issue on GitHub?
You will be asked to provide additional information and logs, so PLEASE READ THE CONTENT IN YOUR BROWSER.`, 'Yes', 'Next time', 'Never');
	switch (selected) {
		case 'Yes':
			// Prefill an issue title and report.
			let errKind: string;
			switch (reason) {
				case errorKind.crash:
					errKind = 'crash';
					break;
				case errorKind.initializationFailure:
					errKind = 'initialization';
					break;
			}
			// Get the user's version in case the update prompt above failed.
			const usersGoplsVersion = await getLocalGoplsVersion(latestConfig);
			const settings = latestConfig.flags.join(' ');
			const title = `gopls: automated issue report (${errKind})`;
			const sanitizedLog = collectGoplsLog();
			const goplsLog = (sanitizedLog) ?
				`<pre>${sanitizedLog}</pre>` :
				`
Please attach the stack trace from the crash.
A window with the error message should have popped up in the lower half of your screen.
Please copy the stack trace and error messages from that window and paste it in this issue.

<PASTE STACK TRACE HERE>
`;

			const body = `
gopls version: ${usersGoplsVersion}
gopls flags: ${settings}

ATTENTION: PLEASE PROVIDE THE DETAILS REQUESTED BELOW.

Describe what you observed.

<ANSWER HERE>

${goplsLog}

OPTIONAL: If you would like to share more information, you can attach your complete gopls logs.

NOTE: THESE MAY CONTAIN SENSITIVE INFORMATION ABOUT YOUR CODEBASE.
DO NOT SHARE LOGS IF YOU ARE WORKING IN A PRIVATE REPOSITORY.

<OPTIONAL: ATTACH LOGS HERE>
`;
			const url = `https://github.com/golang/vscode-go/issues/new?title=${title}&labels=upstream-tools&body=${body}`;
			await vscode.env.openExternal(vscode.Uri.parse(url));
			break;
		case 'Next time':
			break;
		case 'Never':
			updateGlobalState(promptForIssueOnGoplsRestartKey, JSON.stringify({
				prompt: false,
				date: new Date(),
			}));
			break;
	}
}

// randomIntInRange returns a random integer between min and max, inclusive.
function randomIntInRange(min: number, max: number): number {
	const low = Math.ceil(min);
	const high = Math.floor(max);
	return Math.floor(Math.random() * (high - low + 1)) + low;
}

export const timeMinute = 1000 * 60;
const timeHour = timeMinute * 60;
const timeDay = timeHour * 24;

// daysBetween returns the number of days between a and b.
function daysBetween(a: Date, b: Date): number {
	return msBetween(a, b) / timeDay;
}

// minutesBetween returns the number of minutes between a and b.
function minutesBetween(a: Date, b: Date): number {
	return msBetween(a, b) / timeMinute;
}

function msBetween(a: Date, b: Date): number {
	return Math.abs(a.getTime() - b.getTime());
}

export function showServerOutputChannel() {
	if (!languageServerIsRunning) {
		vscode.window.showInformationMessage(`gopls is not running`);
		return;
	}
	// likely show() is asynchronous, despite the documentation
	serverOutputChannel.show();
	let found: vscode.TextDocument;
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.fileName.indexOf('extension-output-') !== -1) {
			// despite show() above, this might not get the output we want, so check
			const contents = doc.getText();
			if (contents.indexOf('[Info  - ') === -1) {
				continue;
			}
			if (found !== undefined) {
				vscode.window.showInformationMessage('multiple docs named extension-output-...');
			}
			found = doc;
			// .log, as some decoration is better than none
			vscode.workspace.openTextDocument({ language: 'log', content: contents });
		}
	}
	if (found === undefined) {
		vscode.window.showErrorMessage('make sure "gopls (server)" output is showing');
	}
}

function collectGoplsLog(): string {
	serverOutputChannel.show();
	// Find the logs in the output channel. There is no way to read
	// an output channel directly, but we can find the open text
	// document, since we just surfaced the output channel to the user.
	// See https://github.com/microsoft/vscode/issues/65108.
	let logs: string;
	for (const doc of vscode.workspace.textDocuments) {
		if (doc.languageId !== 'Log') {
			continue;
		}
		if (doc.isDirty || doc.isClosed) {
			continue;
		}
		// The document's name should look like 'extension-output-#X'.
		if (doc.fileName.indexOf('extension-output-') === -1) {
			continue;
		}
		logs = doc.getText();
		break;
	}
	return sanitizeGoplsTrace(logs);
}

// capture only panic stack trace and the initialization error message.
// exported for testing.
export function sanitizeGoplsTrace(logs?: string): string {
	if (!logs) {
		return '';
	}
	const panicMsgBegin = logs.lastIndexOf('panic: ');
	if (panicMsgBegin > -1) {  // panic message was found.
		const panicMsgEnd = logs.indexOf('Connection to server got closed.', panicMsgBegin);
		if (panicMsgEnd > -1) {
			const panicTrace = logs.substr(panicMsgBegin, panicMsgEnd - panicMsgBegin);
			const filePattern = /(\S+\.go):\d+/;
			const sanitized = panicTrace.split('\n').map(
				(line: string) => {
					// Even though this is a crash from gopls, the file path
					// can contain user names and user's filesystem directory structure.
					// We can still locate the corresponding file if the file base is
					// available because the full package path is part of the function
					// name. So, leave only the file base.
					const m = line.match(filePattern);
					if (!m) { return line; }
					const filePath = m[1];
					const fileBase = path.basename(filePath);
					return line.replace(filePath, '  ' + fileBase);
				}
			).join('\n');

			return sanitized;
		}
	}
	const initFailMsgBegin = logs.lastIndexOf('Starting client failed');
	if (initFailMsgBegin > -1) {  // client start failed. Capture up to the 'Code:' line.
		const initFailMsgEnd = logs.indexOf('Code: ', initFailMsgBegin);
		if (initFailMsgEnd > -1) {
			const lineEnd = logs.indexOf('\n', initFailMsgEnd);
			return lineEnd > -1 ? logs.substr(initFailMsgBegin, lineEnd - initFailMsgBegin) : logs.substr(initFailMsgBegin);
		}
	}
	return '';
}

export async function promptForLanguageServerDefaultChange(cfg: vscode.WorkspaceConfiguration) {
	const promptedForLSDefaultChangeKey = `promptedForLSDefaultChange`;
	if (getFromGlobalState(promptedForLSDefaultChangeKey, false)) {
		return;
	}

	const useLanguageServer = cfg.inspect<boolean>('useLanguageServer');
	if (useLanguageServer.globalValue !== undefined || useLanguageServer.workspaceValue !== undefined) {
		return;  // user already explicitly set the field.
	}

	const selected = await vscode.window.showInformationMessage(
		`"go.useLanguageServer" is enabled by default. If you need to disable it, please configure in the settings.`,
		'Open Settings', 'OK');
	switch (selected) {
		case 'Open Settings':
			vscode.commands.executeCommand('workbench.action.openSettings', 'go.useLanguageServer');
		default:
	}
	updateGlobalState(promptedForLSDefaultChangeKey, true);
}
