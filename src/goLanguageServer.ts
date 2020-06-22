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
	CloseAction, CompletionItemKind, ErrorAction, HandleDiagnosticsSignature, InitializeError,
	LanguageClient, Message, ProvideCompletionItemsSignature, ProvideDocumentLinksSignature,
	RevealOutputChannelOn,
} from 'vscode-languageclient';
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
import { getToolFromToolPath } from './goPath';
import { GoReferenceProvider } from './goReferences';
import { GoRenameProvider } from './goRename';
import { GoSignatureHelpProvider } from './goSignature';
import { GoCompletionItemProvider } from './goSuggest';
import { GoWorkspaceSymbolProvider } from './goSymbol';
import { getTool, Tool } from './goTools';
import { GoTypeDefinitionProvider } from './goTypeDefinition';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { getBinPath, getCurrentGoPath, getGoConfig } from './util';

interface LanguageServerConfig {
	serverName: string;
	path: string;
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
let serverOutputChannel: vscode.OutputChannel;
let serverTraceChannel: vscode.OutputChannel;
let crashCount = 0;

// defaultLanguageProviders is the list of providers currently registered.
let defaultLanguageProviders: vscode.Disposable[] = [];

// restartCommand is the command used by the user to restart the language
// server.
let restartCommand: vscode.Disposable;

// When enabled, users may be prompted to fill out the gopls survey.
const goplsSurveyOn: boolean = false;

// startLanguageServerWithFallback starts the language server, if enabled,
// or falls back to the default language providers.
export async function startLanguageServerWithFallback(ctx: vscode.ExtensionContext, activation: boolean) {
	const cfg = buildLanguageServerConfig();

	// If the language server is gopls, we can check if the user needs to
	// update their gopls version. We do this only once per VS Code
	// activation to avoid inundating the user.
	if (activation && cfg.enabled && cfg.serverName === 'gopls') {
		const tool = getTool(cfg.serverName);
		if (tool) {
			const versionToUpdate = await shouldUpdateLanguageServer(tool, cfg.path, cfg.checkForUpdates);
			if (versionToUpdate) {
				promptForUpdatingTool(tool.name, versionToUpdate);
			} else if (goplsSurveyOn) {
				// Only prompt users to fill out the gopls survey if we are not
				// also prompting them to update (both would be too much).
				const timeout = 1000 * 60 * 60; // 1 hour
				setTimeout(async () => {
					const surveyCfg = await maybePromptForGoplsSurvey();
					flushSurveyConfig(surveyCfg);
				}, timeout);
			}
		}
	}

	const started = await startLanguageServer(ctx, cfg);

	// If the server has been disabled, or failed to start,
	// fall back to the default providers, while making sure not to
	// re-register any providers.
	if (!started && defaultLanguageProviders.length === 0) {
		registerDefaultProviders(ctx);
	}
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
		languageClient = await buildLanguageClient(config);
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
			// TODO(rstambler): Enable this behavior when gopls reaches v1.0.
			if (false) {
				await suggestGoplsIssueReport(`Looks like you're about to manually restart the language server.`);
			}
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

async function buildLanguageClient(config: LanguageServerConfig): Promise<LanguageClient> {
	// Reuse the same output channel for each instance of the server.
	if (config.enabled) {
		if (!serverOutputChannel) {
			serverOutputChannel = vscode.window.createOutputChannel(config.serverName + ' (server)');
		}
		if (!serverTraceChannel) {
			serverTraceChannel = vscode.window.createOutputChannel(config.serverName);
		}
	}
	const c = new LanguageClient(
		'go',  // id
		config.serverName,  // name
		{
			command: config.path,
			args: ['-mode=stdio', ...config.flags],
			options: { env: config.env },
		},
		{
			initializationOptions: {},
			documentSelector: ['go', 'go.mod', 'go.sum'],
			uriConverters: {
				// Apply file:/// scheme to all file paths.
				code2Protocol: (uri: vscode.Uri): string =>
					(uri.scheme ? uri : uri.with({ scheme: 'file' })).toString(),
				protocol2Code: (uri: string) => vscode.Uri.parse(uri)
			},
			outputChannel: serverOutputChannel,
			traceOutputChannel: serverTraceChannel,
			revealOutputChannelOn: RevealOutputChannelOn.Never,
			initializationFailedHandler: (error: WebRequest.ResponseError<InitializeError>): boolean => {
				vscode.window.showErrorMessage(
					`The language server is not able to serve any features. Initialization failed: ${error}. `
				);
				serverOutputChannel.show();
				suggestGoplsIssueReport(`The gopls server failed to initialize.`);
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
					serverOutputChannel.show();
					suggestGoplsIssueReport(`The connection to gopls has been closed. The gopls server may have crashed.`);
					return CloseAction.DoNotRestart;
				},
			},
			middleware: {
				handleDiagnostics: (
					uri: vscode.Uri,
					diagnostics: vscode.Diagnostic[],
					next: HandleDiagnosticsSignature
				) => {
					if (!config.features.diagnostics) {
						return null;
					}
					return next(uri, diagnostics);
				},
				provideDocumentLinks: (
					document: vscode.TextDocument,
					token: vscode.CancellationToken,
					next: ProvideDocumentLinksSignature
				) => {
					if (!config.features.documentLink) {
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
							hardcodedFilterText = '';
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
				}
			}
		}
	);
	return c;
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
		e.affectsConfiguration('go.alternateTools')
	) {
		restartLanguageServer();
	}
}

export function buildLanguageServerConfig(): LanguageServerConfig {
	const goConfig = getGoConfig();
	const cfg: LanguageServerConfig = {
		serverName: '',
		path: '',
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
	if (!goConfig['useLanguageServer']) {
		return;
	}
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
	languageServerToolPath: string,
	makeProxyCall: boolean
): Promise<semver.SemVer> {
	// Only support updating gopls for now.
	if (tool.name !== 'gopls') {
		return null;
	}

	// First, run the "gopls version" command and parse its results.
	const usersVersion = await getLocalGoplsVersion(languageServerToolPath);

	// We might have a developer version. Don't make the user update.
	if (usersVersion === '(devel)') {
		return null;
	}

	// Get the latest gopls version. If it is for nightly, using the prereleased version is ok.
	let latestVersion = makeProxyCall ? await getLatestGoplsVersion(tool) : tool.latestVersion;

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
		let latestTime = makeProxyCall ? await getTimestampForVersion(tool, latestVersion) : tool.latestVersionTimestamp;
		if (!latestTime) {
			latestTime = tool.latestVersionTimestamp;
		}
		return usersTime.isBefore(latestTime) ? latestVersion : null;
	}

	// If the user's version does not contain a timestamp,
	// default to a semver comparison of the two versions.
	const usersVersionSemver = semver.coerce(usersVersion, { includePrerelease: true, loose: true });
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

const acceptGoplsPrerelease = (extensionId === 'golang.go-nightly');

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
export const getLocalGoplsVersion = async (goplsPath: string) => {
	const execFile = util.promisify(cp.execFile);
	let output: any;
	try {
		const { stdout } = await execFile(goplsPath, ['version'], { env: toolExecutionEnvironment() });
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
	return split[1];
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
	const proxies = output.trim().split(',|');
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

	// promptThisMonthTimestamp is the date on which we determined if the user
	// should be prompted this month.
	promptThisMonthTimestamp?: Date;

	// lastDatePrompted is the most recent date that the user has been prompted.
	lastDatePrompted?: Date;

	// lastDateAccepted is the most recent date that the user responded "Yes"
	// to the survey prompt. The user need not have completed the survey.
	lastDateAccepted?: Date;
}

async function maybePromptForGoplsSurvey(): Promise<SurveyConfig> {
	const now = new Date();
	const cfg = getSurveyConfig();
	const prompt = shouldPromptForGoplsSurvey(now, cfg);
	if (!prompt) {
		return cfg;
	}
	const selected = await vscode.window.showInformationMessage(`Looks like you're using gopls, the Go language server.
Would you be willing to fill out a quick survey about your experience with gopls?`, 'Yes', 'Not now', 'Never');

	// Update the time last asked.
	cfg.lastDatePrompted = now;

	switch (selected) {
		case 'Yes':
			cfg.lastDateAccepted = now;
			cfg.prompt = true;

			// Open the link to the survey.
			vscode.env.openExternal(vscode.Uri.parse('https://www.whattimeisitrightnow.com/'));
			break;
		case 'Not now':
			cfg.prompt = true;

			vscode.window.showInformationMessage(`No problem! We'll ask you again another time.`);
			break;
		case 'Never':
			cfg.prompt = false;

			vscode.window.showInformationMessage(`No problem! We won't ask again.`);
			break;
	}
	return cfg;
}

export function shouldPromptForGoplsSurvey(now: Date, cfg: SurveyConfig): boolean {
	// If the prompt value is not set, assume we haven't prompted the user
	// and should do so.
	if (cfg.prompt === undefined) {
		cfg.prompt = true;
	}
	if (!cfg.prompt) {
		return false;
	}

	// Check if the user has taken the survey in the last year.
	// Don't prompt them if they have been.
	if (cfg.lastDateAccepted) {
		if (daysBetween(now, cfg.lastDateAccepted) < 365) {
			return false;
		}
	}

	// Check if the user has been prompted for the survey in the last 90 days.
	// Don't prompt them if they have been.
	if (cfg.lastDatePrompted) {
		if (daysBetween(now, cfg.lastDatePrompted) < 90) {
			return false;
		}
	}

	// Check if the extension has been activated this month.
	if (cfg.promptThisMonthTimestamp) {
		// The extension has been activated this month, so we should have already
		// decided if the user should be prompted.
		if (daysBetween(now, cfg.promptThisMonthTimestamp) < 30) {
			return cfg.promptThisMonth;
		}
	}
	// This is the first activation this month (or ever), so decide if we
	// should prompt the user. This is done by generating a random number
	// and % 20 to get a 5% chance.
	const r = Math.floor(Math.random() * 20);
	cfg.promptThisMonth = (r % 20 === 0);
	cfg.promptThisMonthTimestamp = now;

	return cfg.promptThisMonth;
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
			if (key.includes('Date')) {
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

function flushSurveyConfig(cfg: SurveyConfig) {
	updateGlobalState(goplsSurveyConfig, JSON.stringify(cfg));
}

// suggestGoplsIssueReport prompts users to file an issue with gopls.
async function suggestGoplsIssueReport(msg: string) {
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
	const selected = await vscode.window.showInformationMessage(`${msg} Would you like to report a gopls issue ? `, 'Yes', 'Next time', 'Never');
	switch (selected) {
		case 'Yes':
			// Run the `gopls bug` command directly for now. When
			// https://github.com/golang/go/issues/38942 is
			// resolved, we'll be able to do this through the
			// language client.

			// Wait for the command to finish before restarting the
			// server, but don't bother handling errors.
			const execFile = util.promisify(cp.execFile);
			await execFile(latestConfig.path, ['bug'], { env: toolExecutionEnvironment() });
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

// daysBetween returns the number of days between a and b,
// assuming that a occurs after b.
function daysBetween(a: Date, b: Date) {
	const ms = a.getTime() - b.getTime();
	return ms / (1000 * 60 * 60 * 24);
}
