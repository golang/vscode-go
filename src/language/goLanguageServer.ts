/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
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
	InitializeResult,
	LanguageClientOptions,
	Message,
	ProvideCodeLensesSignature,
	ProvideCompletionItemsSignature,
	ProvideDocumentFormattingEditsSignature,
	ResponseError,
	RevealOutputChannelOn
} from 'vscode-languageclient';
import { LanguageClient, ServerOptions } from 'vscode-languageclient/node';
import { getGoConfig, getGoplsConfig, extensionInfo } from '../config';
import { toolExecutionEnvironment } from '../goEnv';
import { GoDocumentFormattingEditProvider, usingCustomFormatTool } from './legacy/goFormat';
import { installTools, latestToolVersion, promptForMissingTool, promptForUpdatingTool } from '../goInstallTools';
import { GoExtensionContext } from '../context';
import { getTool, Tool } from '../goTools';
import { getFromGlobalState, updateGlobalState, updateWorkspaceState } from '../stateUtils';
import {
	getBinPath,
	getCheckForToolsUpdatesConfig,
	getCurrentGoPath,
	getGoVersion,
	getWorkspaceFolderPath,
	removeDuplicateDiagnostics
} from '../util';
import { getToolFromToolPath } from '../utils/pathUtils';
import WebRequest = require('web-request');
import { FoldingContext } from 'vscode';
import { ProvideFoldingRangeSignature } from 'vscode-languageclient/lib/common/foldingRange';
import { daysBetween, getStateConfig, maybePromptForGoplsSurvey, timeDay, timeMinute } from '../goSurvey';
import { maybePromptForDeveloperSurvey } from '../goDeveloperSurvey';
import { CommandFactory } from '../commands';

export interface LanguageServerConfig {
	serverName: string;
	path: string;
	version?: { version: string; goVersion?: string };
	modtime?: Date;
	enabled: boolean;
	flags: string[];
	env: any;
	features: {
		diagnostics: boolean;
		formatter?: GoDocumentFormattingEditProvider;
	};
	checkForUpdates: string;
}

export interface ServerInfo {
	Name: string;
	Version?: string;
	GoVersion?: string;
	Commands?: string[];
}

export function updateRestartHistory(goCtx: GoExtensionContext, reason: RestartReason, enabled: boolean) {
	// Keep the history limited to 10 elements.
	goCtx.restartHistory = goCtx.restartHistory ?? [];
	while (goCtx.restartHistory.length > 10) {
		goCtx.restartHistory = goCtx.restartHistory.slice(1);
	}
	goCtx.restartHistory.push(new Restart(reason, new Date(), enabled));
}

function formatRestartHistory(goCtx: GoExtensionContext): string {
	const result: string[] = [];
	for (const restart of goCtx.restartHistory ?? []) {
		result.push(`${restart.timestamp.toUTCString()}: ${restart.reason} (enabled: ${restart.enabled})`);
	}
	return result.join('\n');
}

export enum RestartReason {
	ACTIVATION = 'activation',
	MANUAL = 'manual',
	CONFIG_CHANGE = 'config change',
	INSTALLATION = 'installation'
}

export class Restart {
	reason: RestartReason;
	timestamp: Date;
	enabled: boolean;

	constructor(reason: RestartReason, timestamp: Date, enabled: boolean) {
		this.reason = reason;
		this.timestamp = timestamp;
		this.enabled = enabled;
	}
}

// scheduleGoplsSuggestions sets timeouts for the various gopls-specific
// suggestions. We check user's gopls versions once per day to prompt users to
// update to the latest version. We also check if we should prompt users to
// fill out the survey.
export function scheduleGoplsSuggestions(goCtx: GoExtensionContext) {
	if (extensionInfo.isInCloudIDE) {
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
		maybePromptForGoplsSurvey(goCtx);
		maybePromptForDeveloperSurvey(goCtx);
	};
	setTimeout(update, 10 * timeMinute);
	setTimeout(survey, 30 * timeMinute);
}

// Ask users to fill out opt-out survey.
export async function promptAboutGoplsOptOut(goCtx: GoExtensionContext) {
	// Check if the configuration is set in the workspace.
	const useLanguageServer = getGoConfig().inspect('useLanguageServer');
	const workspace = useLanguageServer?.workspaceFolderValue === false || useLanguageServer?.workspaceValue === false;

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
		await promptForGoplsOptOutSurvey(
			goCtx,
			cfg,
			"It looks like you've disabled the Go language server. Would you be willing to tell us why you've disabled it, so that we can improve it?"
		);
		return cfg;
	};
	cfg = await promptFn();
	flushGoplsOptOutConfig(cfg, workspace);
}

async function promptForGoplsOptOutSurvey(
	goCtx: GoExtensionContext,
	cfg: GoplsOptOutConfig,
	msg: string
): Promise<GoplsOptOutConfig> {
	const s = await vscode.window.showInformationMessage(msg, { title: 'Yes' }, { title: 'No' });
	if (!s) {
		return cfg;
	}
	const localGoplsVersion = await getLocalGoplsVersion(goCtx.latestConfig);
	const goplsVersion = localGoplsVersion?.version || 'na';
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

export const flushGoplsOptOutConfig = (cfg: GoplsOptOutConfig, workspace: boolean) => {
	if (workspace) {
		updateWorkspaceState(goplsOptOutConfigKey, JSON.stringify(cfg));
	}
	updateGlobalState(goplsOptOutConfigKey, JSON.stringify(cfg));
};

const race = function (promise: Promise<unknown>, timeoutInMilliseconds: number) {
	let token: NodeJS.Timeout;
	const timeout = new Promise((resolve, reject) => {
		token = setTimeout(() => reject('timeout'), timeoutInMilliseconds);
	});
	return Promise.race([promise, timeout]).then(() => clearTimeout(token));
};

// exported for testing.
export async function stopLanguageClient(goCtx: GoExtensionContext) {
	const c = goCtx.languageClient;
	goCtx.crashCount = 0;
	goCtx.languageClient = undefined;
	if (!c) return false;

	if (c.diagnostics) {
		c.diagnostics.clear();
	}
	// LanguageClient.stop may hang if the language server
	// crashes during shutdown before responding to the
	// shutdown request. Enforce client-side timeout.
	// TODO(hyangah): replace with the new LSP client API that supports timeout
	// and remove this.
	try {
		await race(c.stop(), 2000);
	} catch (e) {
		c.outputChannel?.appendLine(`Failed to stop client: ${e}`);
	}
}

export function toServerInfo(res?: InitializeResult): ServerInfo | undefined {
	if (!res) return undefined;

	const info: ServerInfo = {
		Commands: res.capabilities?.executeCommandProvider?.commands || [],
		Name: res.serverInfo?.name || 'unknown'
	};

	try {
		interface serverVersionJSON {
			GoVersion?: string;
			Version?: string;
			// before gopls 0.8.0
			version?: string;
		}
		const v = <serverVersionJSON>(res.serverInfo?.version ? JSON.parse(res.serverInfo.version) : {});
		info.Version = v.Version || v.version;
		info.GoVersion = v.GoVersion;
	} catch (e) {
		// gopls is not providing any info, that's ok.
	}
	return info;
}

export interface BuildLanguageClientOption extends LanguageServerConfig {
	outputChannel?: vscode.OutputChannel;
	traceOutputChannel?: vscode.OutputChannel;
}

// buildLanguageClientOption returns the default, extra configuration
// used in building a new LanguageClient instance. Options specified
// in LanguageServerConfig
export function buildLanguageClientOption(
	goCtx: GoExtensionContext,
	cfg: LanguageServerConfig
): BuildLanguageClientOption {
	// Reuse the same output channel for each instance of the server.
	if (cfg.enabled) {
		if (!goCtx.serverOutputChannel) {
			goCtx.serverOutputChannel = vscode.window.createOutputChannel(cfg.serverName + ' (server)');
		}
		if (!goCtx.serverTraceChannel) {
			goCtx.serverTraceChannel = vscode.window.createOutputChannel(cfg.serverName);
		}
	}
	return Object.assign(
		{
			outputChannel: goCtx.serverOutputChannel,
			traceOutputChannel: goCtx.serverTraceChannel
		},
		cfg
	);
}

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(
	goCtx: GoExtensionContext,
	cfg: BuildLanguageClientOption
): Promise<LanguageClient> {
	const goplsWorkspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, getGoplsConfig(), 'gopls', undefined);

	const documentSelector = [
		// gopls handles only file URIs.
		{ language: 'go', scheme: 'file' },
		{ language: 'go.mod', scheme: 'file' },
		{ language: 'go.sum', scheme: 'file' },
		{ language: 'go.work', scheme: 'file' },
		{ language: 'gotmpl', scheme: 'file' }
	];

	const c = new LanguageClient(
		'go', // id
		cfg.serverName, // name e.g. gopls
		{
			command: cfg.path,
			args: ['-mode=stdio', ...cfg.flags],
			options: { env: cfg.env }
		} as ServerOptions,
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
					goCtx,
					'The gopls server failed to initialize',
					errorKind.initializationFailure,
					error
				);
				return false;
			},
			errorHandler: {
				error: (error: Error, message: Message, count: number) => {
					// Allow 5 crashes before shutdown.
					if (count < 5) {
						return { action: ErrorAction.Continue };
					}
					vscode.window.showErrorMessage(
						`Error communicating with the language server: ${error}: ${message}.`
					);
					return { action: ErrorAction.Shutdown };
				},
				closed: () => {
					// Allow 5 crashes before shutdown.
					const { crashCount = 0 } = goCtx;
					goCtx.crashCount = crashCount + 1;
					if (goCtx.crashCount < 5) {
						return { action: CloseAction.Restart };
					}
					suggestGoplsIssueReport(
						goCtx,
						'The connection to gopls has been closed. The gopls server may have crashed.',
						errorKind.crash
					);
					return { action: CloseAction.DoNotRestart };
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
							goCtx.serverOutputChannel?.show();
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
						return codeLens ?? [];
					}
					return codeLens.reduce((lenses: vscode.CodeLens[], lens: vscode.CodeLens) => {
						switch (lens.command?.title) {
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
					const { buildDiagnosticCollection, lintDiagnosticCollection, vetDiagnosticCollection } = goCtx;
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
					const paramHintsEnabled = vscode.workspace.getConfiguration('editor.parameterHints', {
						languageId: 'go',
						uri: document.uri
					});
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
				didOpen: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didChange: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didClose: async (e, next) => {
					goCtx.lastUserAction = new Date();
					next(e);
				},
				didSave: async (e, next) => {
					goCtx.lastUserAction = new Date();
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
		} as LanguageClientOptions
	);
	return c;
}

// filterGoplsDefaultConfigValues removes the entries filled based on the default values
// and selects only those the user explicitly specifies in their settings.
// This returns a new object created based on the filtered properties of workspaceConfig.
// Exported for testing.
export function filterGoplsDefaultConfigValues(workspaceConfig: any, resource?: vscode.Uri): any {
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
			!util.isDeepStrictEqual(c.defaultValue, value) ||
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
	section?: string,
	resource?: vscode.Uri
): Promise<any> {
	// We process only gopls config
	if (section !== 'gopls') {
		return workspaceConfig;
	}

	workspaceConfig = filterGoplsDefaultConfigValues(workspaceConfig, resource);
	// note: workspaceConfig is a modifiable, valid object.
	workspaceConfig = passGoConfigToGoplsConfigValues(workspaceConfig, getGoConfig(resource));
	workspaceConfig = await passInlayHintConfigToGopls(cfg, workspaceConfig, getGoConfig(resource));

	// Only modify the user's configurations for the Nightly.
	if (!extensionInfo.isPreview) {
		return workspaceConfig;
	}
	if (!workspaceConfig['allExperiments']) {
		workspaceConfig['allExperiments'] = true;
	}
	return workspaceConfig;
}

async function passInlayHintConfigToGopls(cfg: LanguageServerConfig, goplsConfig: any, goConfig: any) {
	const goplsVersion = await getLocalGoplsVersion(cfg);
	if (!goplsVersion) return;
	const version = semver.parse(goplsVersion.version);
	if ((version?.compare('0.8.4') ?? 1) > 0) {
		const { inlayHints } = goConfig;
		if (inlayHints) {
			goplsConfig['ui.inlayhint.hints'] = { ...inlayHints };
		}
	}
	return goplsConfig;
}

// createTestCodeLens adds the go.test.cursor and go.debug.cursor code lens
function createTestCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
	// CodeLens argument signature in gopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
	// so this needs to be deconstructured here
	// Note that there will always only be one test function name in this context
	if ((lens.command?.arguments?.length ?? 0) < 2 || (lens.command?.arguments?.[1].length ?? 0) < 1) {
		return [lens];
	}
	return [
		new vscode.CodeLens(lens.range, {
			title: '',
			...lens.command,
			command: 'go.test.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[1][0] }]
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug test',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[1][0] }]
		})
	];
}

function createBenchmarkCodeLens(lens: vscode.CodeLens): vscode.CodeLens[] {
	// CodeLens argument signature in gopls is [fileName: string, testFunctions: string[], benchFunctions: string[]],
	// so this needs to be deconstructured here
	// Note that there will always only be one benchmark function name in this context
	if ((lens.command?.arguments?.length ?? 0) < 3 || (lens.command?.arguments?.[2].length ?? 0) < 1) {
		return [lens];
	}
	return [
		new vscode.CodeLens(lens.range, {
			title: '',
			...lens.command,
			command: 'go.benchmark.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[2][0] }]
		}),
		new vscode.CodeLens(lens.range, {
			title: 'debug benchmark',
			command: 'go.debug.cursor',
			arguments: [{ functionName: lens.command?.arguments?.[2][0] }]
		})
	];
}

export async function watchLanguageServerConfiguration(goCtx: GoExtensionContext, e: vscode.ConfigurationChangeEvent) {
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
		vscode.commands.executeCommand('go.languageserver.restart', RestartReason.CONFIG_CHANGE);
	}

	if (e.affectsConfiguration('go.useLanguageServer') && getGoConfig()['useLanguageServer'] === false) {
		promptAboutGoplsOptOut(goCtx);
	}
}

export function buildLanguageServerConfig(goConfig: vscode.WorkspaceConfiguration): LanguageServerConfig {
	let formatter: GoDocumentFormattingEditProvider | undefined;
	if (usingCustomFormatTool(goConfig)) {
		formatter = new GoDocumentFormattingEditProvider();
	}
	const cfg: LanguageServerConfig = {
		serverName: '',
		path: '',
		version: undefined, // compute version lazily
		modtime: undefined,
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
	// user has opted out of using the language server.
	if (!cfg.enabled) {
		return cfg;
	}

	// locate the configured language server tool.
	const languageServerPath = getLanguageServerToolPath();
	if (!languageServerPath) {
		// Assume the getLanguageServerToolPath will show the relevant
		// errors to the user. Disable the language server.
		cfg.enabled = false;
		return cfg;
	}
	cfg.path = languageServerPath;
	cfg.serverName = getToolFromToolPath(cfg.path) ?? '';

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
export function getLanguageServerToolPath(): string | undefined {
	const goConfig = getGoConfig();
	// Check that all workspace folders are configured with the same GOPATH.
	if (!allFoldersHaveSameGopath()) {
		vscode.window.showInformationMessage(
			`The Go language server is currently not supported in a multi-root set-up with different GOPATHs (${gopathsPerFolder()}).`
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

function gopathsPerFolder(): string[] {
	const result: string[] = [];
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		result.push(getCurrentGoPath(folder.uri));
	}
	return result;
}

export async function shouldUpdateLanguageServer(
	tool: Tool,
	cfg?: LanguageServerConfig,
	mustCheck?: boolean
): Promise<semver.SemVer | null | undefined> {
	if (!cfg) {
		return null;
	}
	// Only support updating gopls for now.
	if (tool.name !== 'gopls' || (!mustCheck && (cfg.checkForUpdates === 'off' || extensionInfo.isInCloudIDE))) {
		return null;
	}
	if (!cfg.enabled) {
		return null;
	}

	// If the Go version is too old, don't update.
	const goVersion = await getGoVersion();
	if (!goVersion || (tool.minimumGoVersion && goVersion.lt(tool.minimumGoVersion.format()))) {
		return null;
	}

	// First, run the "gopls version" command and parse its results.
	// TODO(rstambler): Confirm that the gopls binary's modtime matches the
	// modtime in the config. Update it if needed.
	const usersVersion = await getLocalGoplsVersion(cfg);

	// We might have a developer version. Don't make the user update.
	if (usersVersion && usersVersion.version === '(devel)') {
		return null;
	}

	// Get the latest gopls version. If it is for nightly, using the prereleased version is ok.
	let latestVersion =
		cfg.checkForUpdates === 'local' ? tool.latestVersion : await latestToolVersion(tool, extensionInfo.isPreview);

	// If we failed to get the gopls version, pick the one we know to be latest at the time of this extension's last update
	if (!latestVersion) {
		latestVersion = tool.latestVersion;
	}

	// If "gopls" is so old that it doesn't have the "gopls version" command,
	// or its version doesn't match our expectations, usersVersion will be empty or invalid.
	// Suggest the latestVersion.
	if (!usersVersion || !semver.valid(usersVersion.version)) {
		return latestVersion;
	}

	// The user may have downloaded golang.org/x/tools/gopls@master,
	// which means that they have a pseudoversion.
	const usersTime = parseTimestampFromPseudoversion(usersVersion.version);
	// If the user has a pseudoversion, get the timestamp for the latest gopls version and compare.
	if (usersTime) {
		let latestTime = cfg.checkForUpdates
			? await getTimestampForVersion(tool, latestVersion!)
			: tool.latestVersionTimestamp;
		if (!latestTime) {
			latestTime = tool.latestVersionTimestamp;
		}
		return usersTime.isBefore(latestTime) ? latestVersion : null;
	}

	// If the user's version does not contain a timestamp,
	// default to a semver comparison of the two versions.
	const usersVersionSemver = semver.parse(usersVersion.version, {
		includePrerelease: true,
		loose: true
	});
	return semver.lt(usersVersionSemver!, latestVersion!) ? latestVersion : null;
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
export async function suggestUpdateGopls(tool: Tool, cfg: LanguageServerConfig): Promise<boolean | undefined> {
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
function parseTimestampFromPseudoversion(version: string): moment.Moment | null {
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

interface GoplsVersionOutput {
	GoVersion: string;
	Main: {
		Path: string;
		Version: string;
	};
}

// getLocalGoplsVersion returns the version of gopls that is currently
// installed on the user's machine. This is determined by running the
// `gopls version` command.
//
// If this command has already been executed, it returns the saved result.
export const getLocalGoplsVersion = async (cfg?: LanguageServerConfig) => {
	if (!cfg) {
		return null;
	}
	if (cfg.version) {
		return cfg.version;
	}
	if (cfg.path === '') {
		return null;
	}
	const env = toolExecutionEnvironment();
	const cwd = getWorkspaceFolderPath();

	const execFile = util.promisify(cp.execFile);
	try {
		const { stdout } = await execFile(cfg.path, ['version', '-json'], { env, cwd });

		const v = <GoplsVersionOutput>JSON.parse(stdout);
		if (v?.Main.Version) {
			cfg.version = { version: v.Main.Version, goVersion: v.GoVersion };
			return cfg.version;
		}
	} catch (e) {
		// do nothing
	}

	// fall back to the old way (pre v0.8.0)
	let output = '';
	try {
		const { stdout } = await execFile(cfg.path, ['version'], { env, cwd });
		output = stdout;
	} catch (e) {
		// The "gopls version" command is not supported, or something else went wrong.
		// TODO: Should we propagate this error?
		return null;
	}

	const lines = output.trim().split('\n');
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
	cfg.version = { version: split[1] };
	return cfg.version;
};

async function goProxyRequest(tool: Tool, endpoint: string): Promise<any> {
	// Get the user's value of GOPROXY.
	// If it is not set, we cannot make the request.
	const output = process.env['GOPROXY'];
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
export enum errorKind {
	initializationFailure,
	crash,
	manualRestart
}

// suggestGoplsIssueReport prompts users to file an issue with gopls.
export async function suggestGoplsIssueReport(
	goCtx: GoExtensionContext,
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
		const versionToUpdate = await shouldUpdateLanguageServer(tool, goCtx.latestConfig, true);
		if (versionToUpdate) {
			promptForUpdatingTool(tool.name, versionToUpdate, true);
			return;
		}
	}

	// Show the user the output channel content to alert them to the issue.
	goCtx.serverOutputChannel?.show();

	if (goCtx.latestConfig?.serverName !== 'gopls') {
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

	const { sanitizedLog, failureReason } = await collectGoplsLog(goCtx);

	// If the user has invalid values for "go.languageServerFlags", we may get
	// this error. Prompt them to double check their flags.
	let selected: string | undefined;
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
				const usersGoplsVersion = await getLocalGoplsVersion(goCtx.latestConfig);
				const goVersion = await getGoVersion();
				const settings = goCtx.latestConfig.flags.join(' ');
				const title = `gopls: automated issue report (${errKind})`;
				const goplsLog = sanitizedLog
					? `<pre>${sanitizedLog}</pre>`
					: `Please attach the stack trace from the crash.
A window with the error message should have popped up in the lower half of your screen.
Please copy the stack trace and error messages from that window and paste it in this issue.

<PASTE STACK TRACE HERE>

Failed to auto-collect gopls trace: ${failureReason}.
`;
				const now = new Date();

				const body = `
gopls version: ${usersGoplsVersion?.version} (${usersGoplsVersion?.goVersion})
gopls flags: ${settings}
update flags: ${goCtx.latestConfig.checkForUpdates}
extension version: ${extensionInfo.version}
go version: ${goVersion?.format(true)}
environment: ${extensionInfo.appName} ${process.platform}
initialization error: ${initializationError}
issue timestamp: ${now.toUTCString()}
restart history:
${formatRestartHistory(goCtx)}

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

export const showServerOutputChannel: CommandFactory = (ctx, goCtx) => () => {
	if (!goCtx.languageServerIsRunning) {
		vscode.window.showInformationMessage('gopls is not running');
		return;
	}
	// likely show() is asynchronous, despite the documentation
	goCtx.serverOutputChannel?.show();
	let found: vscode.TextDocument | undefined;
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
};

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectGoplsLog(goCtx: GoExtensionContext): Promise<{ sanitizedLog?: string; failureReason?: string }> {
	goCtx.serverOutputChannel?.show();
	// Find the logs in the output channel. There is no way to read
	// an output channel directly, but we can find the open text
	// document, since we just surfaced the output channel to the user.
	// See https://github.com/microsoft/vscode/issues/65108.
	let logs: string | undefined;
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

export function languageServerUsingDefault(cfg: vscode.WorkspaceConfiguration): boolean {
	const useLanguageServer = cfg.inspect<boolean>('useLanguageServer');
	return useLanguageServer?.globalValue === undefined && useLanguageServer?.workspaceValue === undefined;
}
