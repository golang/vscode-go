/* eslint-disable @typescript-eslint/no-explicit-any */
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
	ExecuteCommandSignature,
	HandleDiagnosticsSignature,
	InitializeError,
	Message,
	ProvideCodeLensesSignature,
	ProvideCompletionItemsSignature,
	ProvideDocumentFormattingEditsSignature,
	ResponseError,
	RevealOutputChannelOn
} from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/node';
import { getGoConfig, getGoplsConfig, IsInCloudIDE } from './config';
import { extensionId } from './const';
import { GoCodeActionProvider } from './goCodeAction';
import { GoDefinitionProvider } from './goDeclaration';
import { toolExecutionEnvironment } from './goEnv';
import { GoHoverProvider } from './goExtraInfo';
import { GoDocumentFormattingEditProvider, usingCustomFormatTool } from './goFormat';
import { GoImplementationProvider } from './goImplementations';
import { installTools, latestToolVersion, promptForMissingTool, promptForUpdatingTool } from './goInstallTools';
import { parseLiveFile } from './goLiveErrors';
import {
	buildDiagnosticCollection,
	lintDiagnosticCollection,
	restartLanguageServer,
	vetDiagnosticCollection
} from './goMain';
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
import { getFromGlobalState, updateGlobalState, updateWorkspaceState } from './stateUtils';
import {
	getBinPath,
	getCheckForToolsUpdatesConfig,
	getCurrentGoPath,
	getGoVersion,
	getWorkspaceFolderPath,
	removeDuplicateDiagnostics
} from './util';
import { Mutex } from './utils/mutex';
import { getToolFromToolPath } from './utils/pathUtils';
import WebRequest = require('web-request');
import { FoldingContext } from 'vscode';
import { ProvideFoldingRangeSignature } from 'vscode-languageclient/lib/common/foldingRange';
import { daysBetween, getStateConfig, maybePromptForSurvey, timeDay, timeMinute } from './goSurvey';

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
		formatter?: GoDocumentFormattingEditProvider;
	};
	checkForUpdates: string;
}

// Global variables used for management of the language client.
// They are global so that the server can be easily restarted with
// new configurations.
export let languageClient: LanguageClient;
let languageServerDisposable: vscode.Disposable;
export let latestConfig: LanguageServerConfig;
export let serverOutputChannel: vscode.OutputChannel;
export let languageServerIsRunning = false;

const languageServerStartMutex = new Mutex();

let serverTraceChannel: vscode.OutputChannel;
let crashCount = 0;

// Some metrics for automated issue reports:
let manualRestartCount = 0;
let totalStartCount = 0;

// defaultLanguageProviders is the list of providers currently registered.
let defaultLanguageProviders: vscode.Disposable[] = [];

// restartCommand is the command used by the user to restart the language
// server.
let restartCommand: vscode.Disposable;

// lastUserAction is the time of the last user-triggered change.
// A user-triggered change is a didOpen, didChange, didSave, or didClose event.
export let lastUserAction: Date = new Date();

// startLanguageServerWithFallback starts the language server, if enabled,
// or falls back to the default language providers.
export async function startLanguageServerWithFallback(ctx: vscode.ExtensionContext, activation: boolean) {
	for (const folder of vscode.workspace.workspaceFolders || []) {
		switch (folder.uri.scheme) {
			case 'vsls':
				outputChannel.appendLine(
					'Language service on the guest side is disabled. ' +
						'The server-side language service will provide the language features.'
				);
				return;
			case 'ssh':
				outputChannel.appendLine('The language server is not supported for SSH. Disabling it.');
				return;
		}
	}
	const schemes = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.scheme);
	if (schemes?.length > 0 && !schemes.includes('file') && !schemes.includes('untitled')) {
		outputChannel.appendLine(
			`None of the folders in this workspace ${schemes.join(
				','
			)} are the types the language server recognizes. Disabling the language features.`
		);
		return;
	}

	const goConfig = getGoConfig();
	const cfg = buildLanguageServerConfig(goConfig);

	// We have some extra prompts for gopls users and for people who have opted
	// out of gopls.
	if (activation) {
		scheduleGoplsSuggestions();
	}

	// If the language server is gopls, we enable a few additional features.
	// These include prompting for updates and surveys.
	if (cfg.serverName === 'gopls') {
		const tool = getTool(cfg.serverName);
		if (tool) {
			// If the language server is turned on because it is enabled by default,
			// make sure that the user is using a new enough version.
			if (cfg.enabled && languageServerUsingDefault(goConfig)) {
				suggestUpdateGopls(tool, cfg);
			}
		}
	}
	const unlock = await languageServerStartMutex.lock();
	try {
		const started = await startLanguageServer(ctx, cfg);

		// If the server has been disabled, or failed to start,
		// fall back to the default providers, while making sure not to
		// re-register any providers.
		if (!started && defaultLanguageProviders.length === 0) {
			registerDefaultProviders(ctx);
		}
		languageServerIsRunning = started;
		updateLanguageServerIconGoStatusBar(started, goConfig['useLanguageServer'] === true);
	} finally {
		unlock();
	}
}

// scheduleGoplsSuggestions sets timeouts for the various gopls-specific
// suggestions. We check user's gopls versions once per day to prompt users to
// update to the latest version. We also check if we should prompt users to
// fill out the survey.
function scheduleGoplsSuggestions() {
	if (IsInCloudIDE) {
		return;
	}
	// Some helper functions.
	const usingGopls = (cfg: LanguageServerConfig): boolean => {
		return cfg.enabled && cfg.serverName === 'gopls';
	};
	const installGopls = async (cfg: LanguageServerConfig) => {
		const tool = getTool('gopls');
		const versionToUpdate = await shouldUpdateLanguageServer(tool, cfg);
		if (!versionToUpdate) {
			return;
		}
		// If the user has opted in to automatic tool updates, we can update
		// without prompting.
		const toolsManagementConfig = getGoConfig()['toolsManagement'];
		if (toolsManagementConfig && toolsManagementConfig['autoUpdate'] === true) {
			const goVersion = await getGoVersion();
			const toolVersion = { ...tool, version: versionToUpdate }; // ToolWithVersion
			await installTools([toolVersion], goVersion, true);
		} else {
			promptForUpdatingTool(tool.name, versionToUpdate);
		}
	};
	const update = async () => {
		setTimeout(update, timeDay);

		let cfg = buildLanguageServerConfig(getGoConfig());
		if (!usingGopls(cfg)) {
			// This shouldn't happen, but if the user has a non-gopls language
			// server enabled, we shouldn't prompt them to change.
			if (cfg.serverName !== '' && cfg.serverName !== 'gopls') {
				return;
			}
			// Prompt the user to enable gopls and record what actions they took.
			await promptAboutGoplsOptOut(false);
			// Check if the language server has now been enabled, and if so,
			// it will be installed below.
			cfg = buildLanguageServerConfig(getGoConfig());
			if (!cfg.enabled) {
				return;
			}
		}
		await installGopls(cfg);
	};
	const survey = async () => {
		setTimeout(survey, timeDay);

		// Only prompt for the survey if the user is working on Go code.
		let foundGo = false;
		for (const doc of vscode.workspace.textDocuments) {
			if (doc.languageId === 'go') {
				foundGo = true;
			}
		}
		if (!foundGo) {
			return;
		}
		maybePromptForSurvey();
	};
	setTimeout(update, 10 * timeMinute);
	setTimeout(survey, 30 * timeMinute);
}

export async function promptAboutGoplsOptOut(surveyOnly: boolean) {
	// Check if the configuration is set in the workspace.
	const useLanguageServer = getGoConfig().inspect('useLanguageServer');
	const workspace = useLanguageServer.workspaceFolderValue === false || useLanguageServer.workspaceValue === false;

	let cfg = getGoplsOptOutConfig(workspace);
	const promptFn = async (): Promise<GoplsOptOutConfig> => {
		if (cfg.prompt === false) {
			return cfg;
		}
		// Prompt the user ~once a month.
		if (cfg.lastDatePrompted && daysBetween(new Date(), cfg.lastDatePrompted) < 30) {
			return cfg;
		}
		cfg.lastDatePrompted = new Date();
		if (surveyOnly) {
			await promptForGoplsOptOutSurvey(
				cfg,
				`Looks like you've disabled the Go language server, which is the recommended default for this extension.
Would you be willing to tell us why you've disabled it?`
			);
			return cfg;
		}
		const selected = await vscode.window.showInformationMessage(
			`We noticed that you have disabled the language server.
It has [stabilized](https://blog.golang.org/gopls-vscode-go) and is now enabled by default in this extension.
Would you like to enable it now?`,
			{ title: 'Enable' },
			{ title: 'Not now' },
			{ title: 'Never' }
		);
		if (!selected) {
			return cfg;
		}
		switch (selected.title) {
			case 'Enable':
				{
					// Change the user's Go configuration to enable the language server.
					// Remove the setting entirely, since it's on by default now.
					const goConfig = getGoConfig();
					await goConfig.update('useLanguageServer', undefined, vscode.ConfigurationTarget.Global);
					if (goConfig.inspect('useLanguageServer').workspaceValue === false) {
						await goConfig.update('useLanguageServer', undefined, vscode.ConfigurationTarget.Workspace);
					}
					if (goConfig.inspect('useLanguageServer').workspaceFolderValue === false) {
						await goConfig.update(
							'useLanguageServer',
							undefined,
							vscode.ConfigurationTarget.WorkspaceFolder
						);
					}
					cfg.prompt = false;
				}
				break;
			case 'Not now':
				cfg.prompt = true;
				break;
			case 'Never':
				cfg.prompt = false;
				await promptForGoplsOptOutSurvey(
					cfg,
					'No problem. Would you be willing to tell us why you have opted out of the language server?'
				);
				break;
		}
		return cfg;
	};
	cfg = await promptFn();
	flushGoplsOptOutConfig(cfg, workspace);
}

async function promptForGoplsOptOutSurvey(cfg: GoplsOptOutConfig, msg: string): Promise<GoplsOptOutConfig> {
	const s = await vscode.window.showInformationMessage(msg, { title: 'Yes' }, { title: 'No' });
	if (!s) {
		return cfg;
	}
	let goplsVersion = await getLocalGoplsVersion(latestConfig);
	if (!goplsVersion) {
		goplsVersion = 'na';
	}
	const goV = await getGoVersion();
	let goVersion = 'na';
	if (goV) {
		goVersion = goV.format(true);
	}
	switch (s.title) {
		case 'Yes':
			cfg.prompt = false;
			await vscode.env.openExternal(
				vscode.Uri.parse(
					`https://google.qualtrics.com/jfe/form/SV_doId0RNgV3pHovc?gopls=${goplsVersion}&go=${goVersion}&os=${process.platform}`
				)
			);
			break;
		case 'No':
			break;
	}
	return cfg;
}

export interface GoplsOptOutConfig {
	prompt?: boolean;
	lastDatePrompted?: Date;
}

const goplsOptOutConfigKey = 'goplsOptOutConfig';

export const getGoplsOptOutConfig = (workspace: boolean): GoplsOptOutConfig => {
	return getStateConfig(goplsOptOutConfigKey, workspace) as GoplsOptOutConfig;
};

function flushGoplsOptOutConfig(cfg: GoplsOptOutConfig, workspace: boolean) {
	if (workspace) {
		updateWorkspaceState(goplsOptOutConfigKey, JSON.stringify(cfg));
	}
	updateGlobalState(goplsOptOutConfigKey, JSON.stringify(cfg));
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
				"Looks like you're about to manually restart the language server.",
				errorKind.manualRestart
			);

			manualRestartCount++;
			restartLanguageServer();
		});
		ctx.subscriptions.push(restartCommand);
	}

	// Before starting the language server, make sure to deregister any
	// currently registered language providers.
	disposeDefaultProviders();

	languageServerDisposable = languageClient.start();
	totalStartCount++;
	ctx.subscriptions.push(languageServerDisposable);
	await languageClient.onReady();
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
	return Object.assign(
		{
			outputChannel: serverOutputChannel,
			traceOutputChannel: serverTraceChannel
		},
		cfg
	);
}

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(cfg: BuildLanguageClientOption): Promise<LanguageClient> {
	const goplsWorkspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, getGoplsConfig(), 'gopls', undefined);

	const documentSelector = [
		// gopls handles only file URIs.
		{ language: 'go', scheme: 'file' },
		{ language: 'go.mod', scheme: 'file' },
		{ language: 'go.sum', scheme: 'file' },
		{ language: 'go.work', scheme: 'file' }
	];

	// Let gopls know about .tmpl - this is experimental, so enable it only in the experimental mode now.
	if (isInPreviewMode()) {
		documentSelector.push({ language: 'tmpl', scheme: 'file' });
	}
	const c = new LanguageClient(
		'go', // id
		cfg.serverName, // name e.g. gopls
		{
			command: cfg.path,
			args: ['-mode=stdio', ...cfg.flags],
			options: { env: cfg.env }
		},
		{
			initializationOptions: goplsWorkspaceConfig,
			documentSelector,
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
				suggestGoplsIssueReport(
					'The gopls server failed to initialize',
					errorKind.initializationFailure,
					error
				);
				return false;
			},
			errorHandler: {
				error: (error: Error, message: Message, count: number): ErrorAction => {
					// Allow 5 crashes before shutdown.
					if (count < 5) {
						return ErrorAction.Continue;
					}
					vscode.window.showErrorMessage(
						`Error communicating with the language server: ${error}: ${message}.`
					);
					return ErrorAction.Shutdown;
				},
				closed: (): CloseAction => {
					// Allow 5 crashes before shutdown.
					crashCount++;
					if (crashCount < 5) {
						return CloseAction.Restart;
					}
					suggestGoplsIssueReport(
						'The connection to gopls has been closed. The gopls server may have crashed.',
						errorKind.crash
					);
					return CloseAction.DoNotRestart;
				}
			},
			middleware: {
				executeCommand: async (command: string, args: any[], next: ExecuteCommandSignature) => {
					try {
						return await next(command, args);
					} catch (e) {
						const answer = await vscode.window.showErrorMessage(
							`Command '${command}' failed: ${e}.`,
							'Show Trace'
						);
						if (answer === 'Show Trace') {
							serverOutputChannel.show();
						}
						return null;
					}
				},
				provideFoldingRanges: async (
					doc: vscode.TextDocument,
					context: FoldingContext,
					token: CancellationToken,
					next: ProvideFoldingRangeSignature
				) => {
					const ranges = await next(doc, context, token);
					if ((!ranges || ranges.length === 0) && doc.lineCount > 0) {
						return undefined;
					}
					return ranges;
				},
				provideCodeLenses: async (
					doc: vscode.TextDocument,
					token: vscode.CancellationToken,
					next: ProvideCodeLensesSignature
				): Promise<vscode.CodeLens[]> => {
					const codeLens = await next(doc, token);
					if (!codeLens || codeLens.length === 0) {
						return codeLens;
					}
					return codeLens.reduce((lenses: vscode.CodeLens[], lens: vscode.CodeLens) => {
						switch (lens.command.title) {
							case 'run test': {
								return [...lenses, ...createTestCodeLens(lens)];
							}
							case 'run benchmark': {
								return [...lenses, ...createBenchmarkCodeLens(lens)];
							}
							default: {
								return [...lenses, lens];
							}
						}
					}, []);
				},
				provideDocumentFormattingEdits: async (
					document: vscode.TextDocument,
					options: vscode.FormattingOptions,
					token: vscode.CancellationToken,
					next: ProvideDocumentFormattingEditsSignature
				) => {
					if (cfg.features.formatter) {
						return cfg.features.formatter.provideDocumentFormattingEdits(document, options, token);
					}
					return next(document, options, token);
				},
				handleDiagnostics: (
					uri: vscode.Uri,
					diagnostics: vscode.Diagnostic[],
					next: HandleDiagnosticsSignature
				) => {
					if (!cfg.features.diagnostics) {
						return null;
					}
					// Deduplicate diagnostics with those found by the other tools.
					removeDuplicateDiagnostics(vetDiagnosticCollection, uri, diagnostics);
					removeDuplicateDiagnostics(buildDiagnosticCollection, uri, diagnostics);
					removeDuplicateDiagnostics(lintDiagnosticCollection, uri, diagnostics);

					return next(uri, diagnostics);
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
							let { label } = items[0];
							if (typeof label !== 'string') label = label.label;
							hardcodedFilterText = label;
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
					let paramHintsEnabled = false;
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
								item.command = {
									title: 'triggerParameterHints',
									command: 'editor.action.triggerParameterHints'
								};
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
					configuration: async (
						params: ConfigurationParams,
						token: CancellationToken,
						next: ConfigurationRequest.HandlerSignature
					): Promise<any[] | ResponseError<void>> => {
						const configs = await next(params, token);
						if (!configs || !Array.isArray(configs)) {
							return configs;
						}
						const ret = [] as any[];
						for (let i = 0; i < configs.length; i++) {
							let workspaceConfig = configs[i];
							if (!!workspaceConfig && typeof workspaceConfig === 'object') {
								const scopeUri = params.items[i].scopeUri;
								const resource = scopeUri ? vscode.Uri.parse(scopeUri) : undefined;
								const section = params.items[i].section;
								workspaceConfig = await adjustGoplsWorkspaceConfiguration(
									cfg,
									workspaceConfig,
									section,
									resource
								);
							}
							ret.push(workspaceConfig);
						}
						return ret;
					}
				}
			}
		}
	);
	return c;
}

// filterGoplsDefaultConfigValues removes the entries filled based on the default values
// and selects only those the user explicitly specifies in their settings.
// This returns a new object created based on the filtered properties of workspaceConfig.
// Exported for testing.
export function filterGoplsDefaultConfigValues(workspaceConfig: any, resource: vscode.Uri): any {
	if (!workspaceConfig) {
		workspaceConfig = {};
	}
	const cfg = getGoplsConfig(resource);
	const filtered = {} as { [key: string]: any };
	for (const [key, value] of Object.entries(workspaceConfig)) {
		if (typeof value === 'function') {
			continue;
		}
		const c = cfg.inspect(key);
		// select only the field whose current value comes from non-default setting.
		if (
			!c ||
			!deepEqual(c.defaultValue, value) ||
			// c.defaultValue !== value would be most likely sufficient, except
			// when gopls' default becomes different from extension's default.
			// So, we also forward the key if ever explicitely stated in one of the
			// settings layers.
			c.globalLanguageValue !== undefined ||
			c.globalValue !== undefined ||
			c.workspaceFolderLanguageValue !== undefined ||
			c.workspaceFolderValue !== undefined ||
			c.workspaceLanguageValue !== undefined ||
			c.workspaceValue !== undefined
		) {
			filtered[key] = value;
		}
	}
	return filtered;
}

// passGoConfigToGoplsConfigValues passes some of the relevant 'go.' settings to gopls settings.
// This assumes `goplsWorkspaceConfig` is an output of filterGoplsDefaultConfigValues,
// so it is modifiable and doesn't contain properties that are not explicitly set.
//   - go.buildTags and go.buildFlags are passed as gopls.build.buildFlags
//     if goplsWorkspaceConfig doesn't explicitly set it yet.
// Exported for testing.
export function passGoConfigToGoplsConfigValues(goplsWorkspaceConfig: any, goWorkspaceConfig: any): any {
	if (!goplsWorkspaceConfig) {
		goplsWorkspaceConfig = {};
	}

	const buildFlags = [] as string[];
	if (goWorkspaceConfig?.buildFlags) {
		buildFlags.push(...goWorkspaceConfig?.buildFlags);
	}
	if (goWorkspaceConfig?.buildTags && buildFlags.indexOf('-tags') === -1) {
		buildFlags.push('-tags', goWorkspaceConfig?.buildTags);
	}
	// If gopls.build.buildFlags is set, don't touch it.
	if (buildFlags.length > 0 && goplsWorkspaceConfig['build.buildFlags'] === undefined) {
		goplsWorkspaceConfig['build.buildFlags'] = buildFlags;
	}
	return goplsWorkspaceConfig;
}

// adjustGoplsWorkspaceConfiguration filters unnecessary options and adds any necessary, additional
// options to the gopls config. See filterGoplsDefaultConfigValues, passGoConfigToGoplsConfigValues.
// If this is for the nightly extension, we also request to activate features under experiments.
async function adjustGoplsWorkspaceConfiguration(
	cfg: LanguageServerConfig,
	workspaceConfig: any,
	section: string,
	resource: vscode.Uri
): Promise<any> {
	// We process only gopls config
	if (section !== 'gopls') {
		return workspaceConfig;
	}

	workspaceConfig = filterGoplsDefaultConfigValues(workspaceConfig, resource);
	// note: workspaceConfig is a modifiable, valid object.
	workspaceConfig = passGoConfigToGoplsConfigValues(workspaceConfig, getGoConfig(resource));

	// Only modify the user's configurations for the Nightly.
	if (!isInPreviewMode()) {
		return workspaceConfig;
	}
	// allExperiments is only available with gopls/v0.5.2 and above.
	const version = await getLocalGoplsVersion(cfg);
	if (!version) {
		return workspaceConfig;
	}
	const sv = semver.parse(version, true);
	if (!sv || semver.lt(sv, 'v0.5.2')) {
		return workspaceConfig;
	}
	if (!workspaceConfig['allExperiments']) {
		workspaceConfig['allExperiments'] = true;
	}
	return workspaceConfig;
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
			arguments: [{ functionName: lens.command.arguments[1][0] }]
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug test',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command.arguments[1][0] }]
		})
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
			arguments: [{ functionName: lens.command.arguments[2][0] }]
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug benchmark',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command.arguments[2][0] }]
		})
	];
}

// registerUsualProviders registers the language feature providers if the language server is not enabled.
function registerDefaultProviders(ctx: vscode.ExtensionContext) {
	const completionProvider = new GoCompletionItemProvider(ctx.globalState);
	defaultLanguageProviders.push(completionProvider);
	defaultLanguageProviders.push(
		vscode.languages.registerCompletionItemProvider(GO_MODE, completionProvider, '.', '"')
	);
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

export async function watchLanguageServerConfiguration(e: vscode.ConfigurationChangeEvent) {
	if (!e.affectsConfiguration('go')) {
		return;
	}

	if (
		e.affectsConfiguration('go.useLanguageServer') ||
		e.affectsConfiguration('go.languageServerFlags') ||
		e.affectsConfiguration('go.languageServerExperimentalFeatures') ||
		e.affectsConfiguration('go.alternateTools') ||
		e.affectsConfiguration('go.toolsEnvVars') ||
		e.affectsConfiguration('go.formatTool')
		// TODO: Should we check http.proxy too? That affects toolExecutionEnvironment too.
	) {
		restartLanguageServer();
	}

	if (e.affectsConfiguration('go.useLanguageServer') && getGoConfig()['useLanguageServer'] === false) {
		promptAboutGoplsOptOut(true);
	}
}

export function buildLanguageServerConfig(goConfig: vscode.WorkspaceConfiguration): LanguageServerConfig {
	let formatter: GoDocumentFormattingEditProvider;
	if (usingCustomFormatTool(goConfig)) {
		formatter = new GoDocumentFormattingEditProvider();
	}
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
			formatter: formatter
		},
		env: toolExecutionEnvironment(),
		checkForUpdates: getCheckForToolsUpdatesConfig(goConfig)
	};
	const languageServerPath = getLanguageServerToolPath();
	if (!languageServerPath) {
		// Assume the getLanguageServerToolPath will show the relevant
		// errors to the user. Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.path = languageServerPath;
	cfg.serverName = getToolFromToolPath(cfg.path);

	if (!cfg.enabled) {
		return cfg;
	}

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
	mustCheck?: boolean
): Promise<semver.SemVer> {
	// Only support updating gopls for now.
	if (tool.name !== 'gopls' || (!mustCheck && (cfg.checkForUpdates === 'off' || IsInCloudIDE))) {
		return null;
	}
	if (!cfg.enabled) {
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
	let latestVersion =
		cfg.checkForUpdates === 'local' ? tool.latestVersion : await latestToolVersion(tool, isInPreviewMode());

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
		let latestTime = cfg.checkForUpdates
			? await getTimestampForVersion(tool, latestVersion)
			: tool.latestVersionTimestamp;
		if (!latestTime) {
			latestTime = tool.latestVersionTimestamp;
		}
		return usersTime.isBefore(latestTime) ? latestVersion : null;
	}

	// If the user's version does not contain a timestamp,
	// default to a semver comparison of the two versions.
	const usersVersionSemver = semver.parse(usersVersion, {
		includePrerelease: true,
		loose: true
	});
	return semver.lt(usersVersionSemver, latestVersion) ? latestVersion : null;
}

/**
 * suggestUpdateGopls will make sure the user is using the latest version of `gopls`,
 * when go.useLanguageServer is changed to true by default.
 *
 * @param tool	Object of type `Tool` for gopls tool.
 * @param cfg	Object of type `Language Server Config` for the users language server
 * 				configuration.
 * @returns		true if the tool was updated
 */
async function suggestUpdateGopls(tool: Tool, cfg: LanguageServerConfig): Promise<boolean> {
	const forceUpdatedGoplsKey = 'forceUpdateForGoplsOnDefault';
	// forceUpdated is true when the process of updating has been succesfully completed.
	const forceUpdated = getFromGlobalState(forceUpdatedGoplsKey, false);
	// TODO: If we want to force update again, switch this to be a comparison for a newer version.
	if (forceUpdated) {
		return false;
	}
	// Update the state to the latest version to show the last version that was checked.
	await updateGlobalState(forceUpdatedGoplsKey, tool.latestVersion);

	const latestVersion = await shouldUpdateLanguageServer(tool, cfg);

	if (!latestVersion) {
		// The user is using a new enough version
		return;
	}

	const updateMsg =
		"'gopls' is now enabled by default and you are using an old version. Please [update 'gopls'](https://github.com/golang/tools/blob/master/gopls/README.md#installation) for the best experience.";
	promptForUpdatingTool(tool.name, latestVersion, false, updateMsg);
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

// getLocalGoplsVersion returns the version of gopls that is currently
// installed on the user's machine. This is determined by running the
// `gopls version` command.
//
// If this command has already been executed, it returns the saved result.
export const getLocalGoplsVersion = async (cfg: LanguageServerConfig) => {
	if (!cfg) {
		return null;
	}
	if (cfg.version !== '') {
		return cfg.version;
	}
	if (cfg.path === '') {
		return null;
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

// errorKind refers to the different possible kinds of gopls errors.
enum errorKind {
	initializationFailure,
	crash,
	manualRestart
}

// suggestGoplsIssueReport prompts users to file an issue with gopls.
async function suggestGoplsIssueReport(
	msg: string,
	reason: errorKind,
	initializationError?: WebRequest.ResponseError<InitializeError>
) {
	// Don't prompt users who manually restart to file issues until gopls/v1.0.
	if (reason === errorKind.manualRestart) {
		return;
	}

	// The user may have an outdated version of gopls, in which case we should
	// just prompt them to update, not file an issue.
	const tool = getTool('gopls');
	if (tool) {
		const versionToUpdate = await shouldUpdateLanguageServer(tool, latestConfig, true);
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
	const promptForIssueOnGoplsRestartKey = 'promptForIssueOnGoplsRestart';
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

	const { sanitizedLog, failureReason } = await collectGoplsLog();

	// If the user has invalid values for "go.languageServerFlags", we may get
	// this error. Prompt them to double check their flags.
	let selected: string;
	if (failureReason === GoplsFailureModes.INCORRECT_COMMAND_USAGE) {
		const languageServerFlags = getGoConfig()['languageServerFlags'] as string[];
		if (languageServerFlags && languageServerFlags.length > 0) {
			selected = await vscode.window.showInformationMessage(
				`The extension was unable to start the language server.
You may have an invalid value in your "go.languageServerFlags" setting.
It is currently set to [${languageServerFlags}]. Please correct the setting by navigating to Preferences -> Settings.`,
				'Open settings',
				'I need more help.'
			);
			switch (selected) {
				case 'Open settings':
					await vscode.commands.executeCommand('workbench.action.openSettings', 'go.languageServerFlags');
					return;
				case 'I need more help':
					// Fall through the automated issue report.
					break;
			}
		}
	}
	selected = await vscode.window.showInformationMessage(
		`${msg} Would you like to report a gopls issue on GitHub?
You will be asked to provide additional information and logs, so PLEASE READ THE CONTENT IN YOUR BROWSER.`,
		'Yes',
		'Next time',
		'Never'
	);
	switch (selected) {
		case 'Yes':
			{
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
				const extInfo = getExtensionInfo();
				const goVersion = await getGoVersion();
				const settings = latestConfig.flags.join(' ');
				const title = `gopls: automated issue report (${errKind})`;
				const goplsLog = sanitizedLog
					? `<pre>${sanitizedLog}</pre>`
					: `Please attach the stack trace from the crash.
A window with the error message should have popped up in the lower half of your screen.
Please copy the stack trace and error messages from that window and paste it in this issue.

<PASTE STACK TRACE HERE>

Failed to auto-collect gopls trace: ${failureReason}.
`;

				const body = `
gopls version: ${usersGoplsVersion}
gopls flags: ${settings}
update flags: ${latestConfig.checkForUpdates}
extension version: ${extInfo.version}
go version: ${goVersion?.format(true)}
environment: ${extInfo.appName} ${process.platform}
initialization error: ${initializationError}
manual restart count: ${manualRestartCount}
total start count: ${totalStartCount}

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
			}
			break;
		case 'Next time':
			break;
		case 'Never':
			updateGlobalState(
				promptForIssueOnGoplsRestartKey,
				JSON.stringify({
					prompt: false,
					date: new Date()
				})
			);
			break;
	}
}

export function showServerOutputChannel() {
	if (!languageServerIsRunning) {
		vscode.window.showInformationMessage('gopls is not running');
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

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectGoplsLog(): Promise<{ sanitizedLog?: string; failureReason?: string }> {
	serverOutputChannel.show();
	// Find the logs in the output channel. There is no way to read
	// an output channel directly, but we can find the open text
	// document, since we just surfaced the output channel to the user.
	// See https://github.com/microsoft/vscode/issues/65108.
	let logs: string;
	for (let i = 0; i < 10; i++) {
		// try a couple of times until successfully finding the channel.
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
		if (logs) {
			break;
		}
		// sleep a bit before the next try. The choice of the sleep time is arbitrary.
		await sleep((i + 1) * 100);
	}

	return sanitizeGoplsTrace(logs);
}

enum GoplsFailureModes {
	NO_GOPLS_LOG = 'no gopls log',
	EMPTY_PANIC_TRACE = 'empty panic trace',
	INCOMPLETE_PANIC_TRACE = 'incomplete panic trace',
	INCORRECT_COMMAND_USAGE = 'incorrect gopls command usage',
	UNRECOGNIZED_CRASH_PATTERN = 'unrecognized crash pattern'
}

// capture only panic stack trace and the initialization error message.
// exported for testing.
export function sanitizeGoplsTrace(logs?: string): { sanitizedLog?: string; failureReason?: string } {
	if (!logs) {
		return { failureReason: GoplsFailureModes.NO_GOPLS_LOG };
	}
	const panicMsgBegin = logs.lastIndexOf('panic: ');
	if (panicMsgBegin > -1) {
		// panic message was found.
		const panicMsgEnd = logs.indexOf('Connection to server got closed.', panicMsgBegin);
		if (panicMsgEnd > -1) {
			const panicTrace = logs.substr(panicMsgBegin, panicMsgEnd - panicMsgBegin);
			const filePattern = /(\S+\.go):\d+/;
			const sanitized = panicTrace
				.split('\n')
				.map((line: string) => {
					// Even though this is a crash from gopls, the file path
					// can contain user names and user's filesystem directory structure.
					// We can still locate the corresponding file if the file base is
					// available because the full package path is part of the function
					// name. So, leave only the file base.
					const m = line.match(filePattern);
					if (!m) {
						return line;
					}
					const filePath = m[1];
					const fileBase = path.basename(filePath);
					return line.replace(filePath, '  ' + fileBase);
				})
				.join('\n');

			if (sanitized) {
				return { sanitizedLog: sanitized };
			}
			return { failureReason: GoplsFailureModes.EMPTY_PANIC_TRACE };
		}
		return { failureReason: GoplsFailureModes.INCOMPLETE_PANIC_TRACE };
	}
	const initFailMsgBegin = logs.lastIndexOf('Starting client failed');
	if (initFailMsgBegin > -1) {
		// client start failed. Capture up to the 'Code:' line.
		const initFailMsgEnd = logs.indexOf('Code: ', initFailMsgBegin);
		if (initFailMsgEnd > -1) {
			const lineEnd = logs.indexOf('\n', initFailMsgEnd);
			return {
				sanitizedLog:
					lineEnd > -1
						? logs.substr(initFailMsgBegin, lineEnd - initFailMsgBegin)
						: logs.substr(initFailMsgBegin)
			};
		}
	}
	if (logs.lastIndexOf('Usage: gopls') > -1) {
		return { failureReason: GoplsFailureModes.INCORRECT_COMMAND_USAGE };
	}
	return { failureReason: GoplsFailureModes.UNRECOGNIZED_CRASH_PATTERN };
}

function languageServerUsingDefault(cfg: vscode.WorkspaceConfiguration): boolean {
	const useLanguageServer = cfg.inspect<boolean>('useLanguageServer');
	return useLanguageServer.globalValue === undefined && useLanguageServer.workspaceValue === undefined;
}

interface ExtensionInfo {
	version?: string; // Extension version
	appName: string; // The application name of the editor, like 'VS Code'
	isPreview?: boolean; // if the extension runs in preview mode (e.g. Nightly)
}

function getExtensionInfo(): ExtensionInfo {
	const packageJSON = vscode.extensions.getExtension(extensionId)?.packageJSON;
	const version = packageJSON?.version;
	const appName = vscode.env.appName;
	const isPreview = !!packageJSON?.preview;
	return { version, appName, isPreview };
}

// isInPreviewMode returns true if the extension's preview mode is set to true.
// In the Nightly extension and the dev extension built from master, the preview
// is set to true.
export function isInPreviewMode(): boolean {
	return getExtensionInfo().isPreview;
}
