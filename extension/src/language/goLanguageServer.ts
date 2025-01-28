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
import { InitializeParams, LSPAny, LSPObject } from 'vscode-languageserver-protocol';
import {
	CancellationToken,
	CloseAction,
	ConfigurationParams,
	ConfigurationRequest,
	ErrorAction,
	ExecuteCommandParams,
	ExecuteCommandRequest,
	ExecuteCommandSignature,
	HandleDiagnosticsSignature,
	InitializeError,
	InitializeResult,
	LanguageClientOptions,
	Message,
	ProgressToken,
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
import fetch from 'node-fetch';
import { CompletionItemKind, FoldingContext } from 'vscode';
import { ProvideFoldingRangeSignature } from 'vscode-languageclient/lib/common/foldingRange';
import { daysBetween, getStateConfig, maybePromptForGoplsSurvey, timeDay, timeMinute } from '../goSurvey';
import { maybePromptForDeveloperSurvey } from '../goDeveloperSurvey';
import { CommandFactory } from '../commands';
import { updateLanguageServerIconGoStatusBar } from '../goStatus';
import { URI } from 'vscode-uri';
import { VulncheckReport, writeVulns } from '../goVulncheck';
import { ActiveProgressTerminals, IProgressTerminal, ProgressTerminal } from '../progressTerminal';
import { createHash } from 'crypto';
import { GoExtensionContext } from '../context';
import { GoDocumentSelector } from '../goMode';

export interface LanguageServerConfig {
	serverName: string;
	path: string;
	version?: { version: string; goVersion?: string };
	modtime?: Date;
	enabled: boolean;
	flags: string[];
	env: any;
	features: {
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

// computes a bigint fingerprint of the machine id.
function hashMachineID(salt?: string): number {
	const hash = createHash('md5').update(`${vscode.env.machineId}${salt}`).digest('hex');
	return parseInt(hash.substring(0, 8), 16);
}

// returns true if the proposed upgrade version is mature, or we are selected for staged rollout.
export async function okForStagedRollout(
	tool: Tool,
	ver: semver.SemVer,
	hashFn: (key?: string) => number
): Promise<boolean> {
	// patch release is relatively safe to upgrade. Moreover, the patch
	// can carry a fix for security which is better to apply sooner.
	if (ver.patch !== 0 || ver.prerelease?.length > 0) return true;

	const published = await getTimestampForVersion(tool, ver);
	if (!published) return true;

	const days = daysBetween(new Date(), published.toDate());
	if (days <= 1) {
		return hashFn(ver.version) % 100 < 10; // upgrade with 10% chance for the first day.
	}
	if (days <= 3) {
		return hashFn(ver.version) % 100 < 30; // upgrade with 30% chance for the first 3 days.
	}
	return true;
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
	const usingGo = (): boolean => {
		return vscode.workspace.textDocuments.some((doc) => doc.languageId === 'go');
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
			if (extensionInfo.isPreview || (await okForStagedRollout(tool, versionToUpdate, hashMachineID))) {
				const goVersion = await getGoVersion();
				const toolVersion = { ...tool, version: versionToUpdate }; // ToolWithVersion
				await installTools([toolVersion], goVersion, { silent: true });
			} else {
				console.log(`gopls ${versionToUpdate} is too new, try to update later`);
			}
		} else {
			promptForUpdatingTool(tool.name, versionToUpdate);
		}
	};
	const update = async () => {
		setTimeout(update, timeDay);
		const cfg = goCtx.latestConfig;
		// trigger periodic update check only if the user is already using gopls.
		// Otherwise, let's check again tomorrow.
		if (!cfg || !cfg.enabled || cfg.serverName !== 'gopls') {
			return;
		}
		await installGopls(cfg);
	};
	const survey = async () => {
		setTimeout(survey, timeDay);
		// Only prompt for the survey if the user is working on Go code.
		if (!usingGo) {
			return;
		}
		maybePromptForGoplsSurvey(goCtx);
		maybePromptForDeveloperSurvey(goCtx);
	};
	const telemetry = () => {
		if (!usingGo) {
			return;
		}
		maybePromptForTelemetry(goCtx);
	};
	setTimeout(update, 10 * timeMinute);
	setTimeout(survey, 30 * timeMinute);
	setTimeout(telemetry, 6 * timeMinute);
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

// exported for testing.
export async function stopLanguageClient(goCtx: GoExtensionContext) {
	const c = goCtx.languageClient;
	goCtx.crashCount = 0;
	goCtx.telemetryService = undefined;
	goCtx.languageClient = undefined;
	if (!c) return false;

	if (c.diagnostics) {
		c.diagnostics.clear();
	}
	// LanguageClient.stop may hang if the language server
	// crashes during shutdown before responding to the
	// shutdown request. Enforce client-side timeout.
	try {
		c.stop(2000);
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

export class GoLanguageClient extends LanguageClient implements vscode.Disposable {
	constructor(
		id: string,
		name: string,
		serverOptions: ServerOptions,
		clientOptions: LanguageClientOptions,
		private onDidChangeVulncheckResultEmitter: vscode.EventEmitter<VulncheckEvent>
	) {
		super(id, name, serverOptions, clientOptions);
	}

	dispose(timeout?: number) {
		this.onDidChangeVulncheckResultEmitter.dispose();
		return super.dispose(timeout);
	}

	public get onDidChangeVulncheckResult(): vscode.Event<VulncheckEvent> {
		return this.onDidChangeVulncheckResultEmitter.event;
	}

	protected fillInitializeParams(params: InitializeParams): void {
		super.fillInitializeParams(params);

		// VSCode-Go honors most client capabilities from the vscode-languageserver-node
		// library. Experimental capabilities not used by vscode-languageserver-node
		// can be used for custom communication between vscode-go and gopls.
		// See https://github.com/microsoft/vscode-languageserver-node/issues/1607
		const experimental: LSPObject = {
			progressMessageStyles: ['log']
		};
		params.capabilities.experimental = experimental;
	}
}

type VulncheckEvent = {
	URI?: URI;
	message?: string;
};

// buildLanguageClient returns a language client built using the given language server config.
// The returned language client need to be started before use.
export async function buildLanguageClient(
	goCtx: GoExtensionContext,
	cfg: BuildLanguageClientOption
): Promise<GoLanguageClient> {
	await getLocalGoplsVersion(cfg); // populate and cache cfg.version
	const goplsWorkspaceConfig = await adjustGoplsWorkspaceConfiguration(cfg, getGoplsConfig(), 'gopls', undefined);

	// when initialization is failed after the connection is established,
	// we want to handle the connection close error case specially. Capture the error
	// in initializationFailedHandler and handle it in the connectionCloseHandler.
	let initializationError: ResponseError<InitializeError> | undefined = undefined;

	// TODO(hxjiang): deprecate special handling for async call gopls.run_govulncheck.
	let govulncheckTerminal: IProgressTerminal | undefined;
	const pendingVulncheckProgressToken = new Map<ProgressToken, any>();
	const onDidChangeVulncheckResultEmitter = new vscode.EventEmitter<VulncheckEvent>();

	// cfg is captured by closures for later use during error report.
	const c = new GoLanguageClient(
		'go', // id
		cfg.serverName, // name e.g. gopls
		{
			command: cfg.path,
			args: ['-mode=stdio', ...cfg.flags],
			options: { env: cfg.env }
		} as ServerOptions,
		{
			initializationOptions: goplsWorkspaceConfig,
			documentSelector: GoDocumentSelector,
			uriConverters: {
				// Apply file:/// scheme to all file paths.
				code2Protocol: (uri: vscode.Uri): string =>
					(uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
				protocol2Code: (uri: string) => vscode.Uri.parse(uri)
			},
			outputChannel: cfg.outputChannel,
			traceOutputChannel: cfg.traceOutputChannel,
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			initializationFailedHandler: (error: ResponseError<InitializeError>): boolean => {
				initializationError = error;
				return false;
			},
			errorHandler: {
				error: (error: Error, message: Message, count: number) => {
					// Allow 5 crashes before shutdown.
					if (count < 5) {
						return {
							message: '', // suppresses error popups
							action: ErrorAction.Continue
						};
					}
					return {
						message: '', // suppresses error popups
						action: ErrorAction.Shutdown
					};
				},
				closed: () => {
					if (initializationError !== undefined) {
						suggestGoplsIssueReport(
							goCtx,
							cfg,
							'The gopls server failed to initialize.',
							errorKind.initializationFailure,
							initializationError
						);
						initializationError = undefined;
						// In case of initialization failure, do not try to restart.
						return {
							message: '', // suppresses error popups - there will be other popups. :-(
							action: CloseAction.DoNotRestart
						};
					}

					// Allow 5 crashes before shutdown.
					const { crashCount = 0 } = goCtx;
					goCtx.crashCount = crashCount + 1;
					if (goCtx.crashCount < 5) {
						updateLanguageServerIconGoStatusBar(c, true);
						return {
							message: '', // suppresses error popups
							action: CloseAction.Restart
						};
					}
					suggestGoplsIssueReport(
						goCtx,
						cfg,
						'The connection to gopls has been closed. The gopls server may have crashed.',
						errorKind.crash
					);
					updateLanguageServerIconGoStatusBar(c, true);
					return {
						message: '', // suppresses error popups - there will be other popups.
						action: CloseAction.DoNotRestart
					};
				}
			},
			middleware: {
				handleWorkDoneProgress: async (token, params, next) => {
					switch (params.kind) {
						case 'begin':
							if (typeof params.message === 'string') {
								const paragraphs = params.message.split('\n\n', 2);
								const metadata = paragraphs[0].trim();
								if (!metadata.startsWith('style: ')) {
									break;
								}
								const style = metadata.substring('style: '.length);
								if (style === 'log') {
									const term = ProgressTerminal.Open(params.title, token);
									if (paragraphs.length > 1) {
										term.appendLine(paragraphs[1]);
									}
									term.show();
								}
							}
							break;
						case 'report':
							if (params.message) {
								ActiveProgressTerminals.get(token)?.appendLine(params.message);
							}
							if (pendingVulncheckProgressToken.has(token) && params.message) {
								govulncheckTerminal?.appendLine(params.message);
							}
							break;
						case 'end':
							if (params.message) {
								ActiveProgressTerminals.get(token)?.appendLine(params.message);
							}
							if (pendingVulncheckProgressToken.has(token)) {
								const out = pendingVulncheckProgressToken.get(token);
								pendingVulncheckProgressToken.delete(token);
								// success. In case of failure, it will be 'failed'
								onDidChangeVulncheckResultEmitter.fire({ URI: out.URI, message: params.message });
							}
					}
					next(token, params);
				},
				executeCommand: async (command: string, args: any[], next: ExecuteCommandSignature) => {
					try {
						if (command === 'gopls.tidy' || command === 'gopls.vulncheck') {
							await vscode.workspace.saveAll(false);
						}
						if (command === 'gopls.run_govulncheck' && args.length && args[0].URI) {
							if (govulncheckTerminal) {
								vscode.window.showErrorMessage(
									'cannot start vulncheck while another vulncheck is in progress'
								);
								return;
							}
							await vscode.workspace.saveAll(false);
							const uri = args[0].URI ? URI.parse(args[0].URI) : undefined;
							const dir = uri?.fsPath?.endsWith('.mod') ? path.dirname(uri.fsPath) : uri?.fsPath;
							govulncheckTerminal = ProgressTerminal.Open('govulncheck');
							govulncheckTerminal.appendLine(`⚡ govulncheck -C ${dir} ./...\n\n`);
							govulncheckTerminal.show();
						}
						const res = await next(command, args);

						const progressToken = <ProgressToken>res.Token;
						// The progressToken from executeCommand indicates that
						// gopls may trigger a related workDoneProgress
						// notification, either before or after the command
						// completes.
						// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#serverInitiatedProgress
						if (progressToken !== undefined) {
							switch (command) {
								case 'gopls.run_govulncheck':
									pendingVulncheckProgressToken.set(progressToken, args[0]);
									break;
								case 'gopls.vulncheck':
									// Write the vulncheck report to the terminal.
									if (ActiveProgressTerminals.has(progressToken)) {
										writeVulns(res.Result, ActiveProgressTerminals.get(progressToken), cfg.path);
									}
									break;
								default:
									// By default, dump the result to the terminal.
									ActiveProgressTerminals.get(progressToken)?.appendLine(res.Result);
							}
						}

						return res;
					} catch (e) {
						// TODO: how to print ${e} reliably???
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
					const paramHints = vscode.workspace.getConfiguration('editor.parameterHints', {
						languageId: 'go',
						uri: document.uri
					});
					// If the user has parameterHints (signature help) enabled,
					// trigger it for function or method completion items.
					if (paramHints.get<boolean>('enabled') === true) {
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
		} as LanguageClientOptions,
		onDidChangeVulncheckResultEmitter
	);
	onDidChangeVulncheckResultEmitter.event(async (e: VulncheckEvent) => {
		if (!govulncheckTerminal) {
			return;
		}
		if (!e || !e.URI) {
			govulncheckTerminal.appendLine(`unexpected vulncheck event: ${JSON.stringify(e)}`);
			return;
		}

		try {
			if (e.message === 'completed') {
				const res = await goplsFetchVulncheckResult(goCtx, e.URI.toString());
				if (res!.Vulns) {
					vscode.window.showWarningMessage(
						'upgrade gopls (v0.14.0 or newer) to see the details about detected vulnerabilities'
					);
				} else {
					await writeVulns(res, govulncheckTerminal, cfg.path);
				}
			} else {
				govulncheckTerminal.appendLine(`terminated without result: ${e.message}`);
			}
		} catch (e) {
			govulncheckTerminal.appendLine(`Fetching govulncheck output from gopls failed ${e}`);
		} finally {
			govulncheckTerminal.show();
			govulncheckTerminal = undefined;
		}
	});
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
		buildFlags.push(...goWorkspaceConfig.buildFlags);
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

	workspaceConfig = filterGoplsDefaultConfigValues(workspaceConfig, resource) || {};
	// note: workspaceConfig is a modifiable, valid object.
	const goConfig = getGoConfig(resource);
	workspaceConfig = passGoConfigToGoplsConfigValues(workspaceConfig, goConfig);
	workspaceConfig = await passInlayHintConfigToGopls(cfg, workspaceConfig, goConfig);
	workspaceConfig = await passVulncheckConfigToGopls(cfg, workspaceConfig, goConfig);
	workspaceConfig = await passLinkifyShowMessageToGopls(cfg, workspaceConfig);

	// Only modify the user's configurations for the Nightly.
	if (!extensionInfo.isPreview) {
		return workspaceConfig;
	}
	if (workspaceConfig && !workspaceConfig['allExperiments']) {
		workspaceConfig['allExperiments'] = true;
	}
	return workspaceConfig;
}

async function passInlayHintConfigToGopls(cfg: LanguageServerConfig, goplsConfig: any, goConfig: any) {
	const goplsVersion = await getLocalGoplsVersion(cfg);
	if (!goplsVersion) return goplsConfig ?? {};
	const version = semver.parse(goplsVersion.version);
	if ((version?.compare('0.8.4') ?? 1) > 0) {
		const { inlayHints } = goConfig;
		if (inlayHints) {
			goplsConfig['ui.inlayhint.hints'] = { ...inlayHints };
		}
	}
	return goplsConfig;
}

async function passVulncheckConfigToGopls(cfg: LanguageServerConfig, goplsConfig: any, goConfig: any) {
	const goplsVersion = await getLocalGoplsVersion(cfg);
	if (!goplsVersion) return goplsConfig ?? {};
	const version = semver.parse(goplsVersion.version);
	if ((version?.compare('0.10.1') ?? 1) > 0) {
		const vulncheck = goConfig.get('diagnostic.vulncheck');
		if (vulncheck) {
			goplsConfig['ui.vulncheck'] = vulncheck;
		}
	}
	return goplsConfig;
}

async function passLinkifyShowMessageToGopls(cfg: LanguageServerConfig, goplsConfig: any) {
	goplsConfig = goplsConfig ?? {};

	const goplsVersion = await getLocalGoplsVersion(cfg);
	if (!goplsVersion) return goplsConfig;

	const version = semver.parse(goplsVersion.version);
	// The linkifyShowMessage option was added in v0.14.0-pre.1.
	if ((version?.compare('0.13.99') ?? 1) > 0) {
		goplsConfig['linkifyShowMessage'] = true;
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

export async function buildLanguageServerConfig(
	goConfig: vscode.WorkspaceConfiguration
): Promise<LanguageServerConfig> {
	let formatter: GoDocumentFormattingEditProvider | undefined;
	if (usingCustomFormatTool(goConfig)) {
		formatter = new GoDocumentFormattingEditProvider();
	}
	const cfg: LanguageServerConfig = {
		serverName: '', // remain empty if gopls binary can't be found.
		path: '',
		enabled: goConfig['useLanguageServer'] === true,
		flags: goConfig['languageServerFlags'] || [],
		features: {
			// TODO: We should have configs that match these names.
			// Ultimately, we should have a centralized language server config rather than separate fields.
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
	cfg.version = await getLocalGoplsVersion(cfg);
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
		return;
	}
	if (cfg.version) {
		return cfg.version;
	}
	if (cfg.path === '') {
		return;
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
		return;
	}

	const lines = output.trim().split('\n');
	switch (lines.length) {
		case 0:
			// No results, should update.
			// Worth doing anything here?
			return;
		case 1:
			// Built in $GOPATH mode. Should update.
			// TODO: Should we check the Go version here?
			// Do we even allow users to enable gopls if their Go version is too low?
			return;
		case 2:
			// We might actually have a parseable version.
			break;
		default:
			return;
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
		return;
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
			const response = await fetch(url);
			data = await response.text();
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
	cfg: LanguageServerConfig, // config used when starting this gopls.
	msg: string,
	reason: errorKind,
	initializationError?: ResponseError<InitializeError>
) {
	const issueTime = new Date();

	// Don't prompt users who manually restart to file issues until gopls/v1.0.
	if (reason === errorKind.manualRestart) {
		return;
	}

	// cfg is the config used when starting this crashed gopls instance, while
	// goCtx.latestConfig is the config used by the latest gopls instance.
	// They may be different if gopls upgrade occurred in between.
	// Let's not report issue yet if they don't match.
	if (JSON.stringify(goCtx.latestConfig?.version) !== JSON.stringify(cfg.version)) {
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
			selected = await vscode.window.showErrorMessage(
				`The extension was unable to start the language server.
You may have an invalid value in your "go.languageServerFlags" setting.
It is currently set to [${languageServerFlags}].
Please correct the setting.`,
				'Open Settings',
				'I need more help.'
			);
			switch (selected) {
				case 'Open Settings':
					await vscode.commands.executeCommand('workbench.action.openSettings', 'go.languageServerFlags');
					return;
				case 'I need more help':
					// Fall through the automated issue report.
					break;
			}
		}
	}
	const showMessage = sanitizedLog ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
	selected = await showMessage(
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
				const settings = goCtx.latestConfig.flags.join(' ');
				const title = `gopls: automated issue report (${errKind})`;
				const goplsStats = await getGoplsStats(goCtx.latestConfig?.path);
				const goplsLog = sanitizedLog
					? `<pre>${sanitizedLog}</pre>`
					: `Please attach the stack trace from the crash.
A window with the error message should have popped up in the lower half of your screen.
Please copy the stack trace and error messages from that window and paste it in this issue.

<PASTE STACK TRACE HERE>

Failed to auto-collect gopls trace: ${failureReason}.
`;

				const body = `
gopls version: ${cfg.version?.version}/${cfg.version?.goVersion}
gopls flags: ${settings}
update flags: ${cfg.checkForUpdates}
extension version: ${extensionInfo.version}
environment: ${extensionInfo.appName} ${process.platform}
initialization error: ${initializationError}
issue timestamp: ${issueTime.toUTCString()}
restart history:
${formatRestartHistory(goCtx)}

ATTENTION: PLEASE PROVIDE THE DETAILS REQUESTED BELOW.

Describe what you observed.

<ANSWER HERE>

${goplsLog}

<details><summary>gopls stats -anon</summary>
${goplsStats}
</details>

OPTIONAL: If you would like to share more information, you can attach your complete gopls logs.

NOTE: THESE MAY CONTAIN SENSITIVE INFORMATION ABOUT YOUR CODEBASE.
DO NOT SHARE LOGS IF YOU ARE WORKING IN A PRIVATE REPOSITORY.

<OPTIONAL: ATTACH LOGS HERE>
`;
				const url = `https://github.com/golang/vscode-go/issues/new?title=${title}&labels=automatedReport&body=${body}`;
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
			if (doc.fileName.indexOf('gopls (server)') > -1) {
				logs = doc.getText();
				break;
			}
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
		let panicTrace = logs.substr(panicMsgBegin);
		const panicMsgEnd = panicTrace.search(/\[(Info|Warning|Error)\s+-\s+/);
		if (panicMsgEnd > -1) {
			panicTrace = panicTrace.substr(0, panicMsgEnd);
		}
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
	// Capture Fatal
	//    foo.go:1: the last message (caveat - we capture only the first log line)
	const m = logs.match(/(^\S+\.go:\d+:.*$)/gm);
	if (m && m.length > 0) {
		return { sanitizedLog: m[0].toString() };
	}
	const initFailMsgBegin = logs.lastIndexOf('gopls client:');
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
	if (logs.lastIndexOf('Usage:') > -1) {
		return { failureReason: GoplsFailureModes.INCORRECT_COMMAND_USAGE };
	}
	return { failureReason: GoplsFailureModes.UNRECOGNIZED_CRASH_PATTERN };
}

const GOPLS_FETCH_VULNCHECK_RESULT = 'gopls.fetch_vulncheck_result';
// Fetches vulncheck result and throws an error if the result is not found.
// uri is a string representation of URI or DocumentURI.
async function goplsFetchVulncheckResult(goCtx: GoExtensionContext, uri: string): Promise<VulncheckReport> {
	const { languageClient } = goCtx;
	const params: ExecuteCommandParams = {
		command: GOPLS_FETCH_VULNCHECK_RESULT,
		arguments: [{ URI: uri }]
	};
	const res: { [modFile: string]: VulncheckReport } = await languageClient?.sendRequest(
		ExecuteCommandRequest.type,
		params
	);

	// res may include multiple results, but we only need one for the given uri.
	// Gopls uses normalized URI (https://cs.opensource.google/go/x/tools/+/refs/tags/gopls/v0.14.2:gopls/internal/span/uri.go;l=78)
	// but VS Code URI (uri) may not be normalized. For comparison, we use URI.fsPath
	// that provides a normalization implementation.
	// https://github.com/microsoft/vscode-uri/blob/53e4ca6263f2e4ddc35f5360c62bc1b1d30f27dd/src/uri.ts#L204
	const uriFsPath = URI.parse(uri).fsPath;
	for (const modFile in res) {
		try {
			const modFileURI = URI.parse(modFile);
			if (modFileURI.fsPath === uriFsPath) {
				return res[modFile];
			}
		} catch (e) {
			console.log(`gopls returned an unparseable file uri in govulncheck result: ${modFile}`);
		}
	}
	throw new Error(`no matching go.mod ${uriFsPath} (${uri.toString()}) in the returned result: ${Object.keys(res)}`);
}

export function maybePromptForTelemetry(goCtx: GoExtensionContext) {
	const callback = async () => {
		const { lastUserAction = new Date() } = goCtx;
		const currentTime = new Date();

		// Make sure the user has been idle for at least 5 minutes.
		const idleTime = currentTime.getTime() - lastUserAction.getTime();
		if (idleTime < 5 * timeMinute) {
			setTimeout(callback, 5 * timeMinute - Math.max(idleTime, 0));
			return;
		}
		goCtx.telemetryService?.promptForTelemetry(extensionInfo.isPreview);
	};
	callback();
}

async function getGoplsStats(binpath?: string) {
	if (!binpath) {
		return 'gopls path unknown';
	}
	const env = toolExecutionEnvironment();
	const cwd = getWorkspaceFolderPath();
	const start = new Date();
	const execFile = util.promisify(cp.execFile);
	try {
		const timeout = 60 * 1000; // 60sec;
		const { stdout } = await execFile(binpath, ['stats', '-anon'], { env, cwd, timeout });
		return stdout;
	} catch (e) {
		const duration = new Date().getTime() - start.getTime();
		console.log(`gopls stats -anon failed: ${JSON.stringify(e)}`);
		return `gopls stats -anon failed after ${duration} ms. Please check if gopls is killed by OS.`;
	}
}
