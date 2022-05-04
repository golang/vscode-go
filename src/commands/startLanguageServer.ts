/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import deepEqual from 'deep-equal';
import * as vscode from 'vscode';
import { getGoConfig } from '../config';
import { GoExtensionContext } from '../context';
import { outputChannel, updateLanguageServerIconGoStatusBar } from '../goStatus';
import { getTool } from '../goTools';
import {
	buildLanguageClient,
	buildLanguageClientOption,
	buildLanguageServerConfig,
	languageServerUsingDefault,
	RestartReason,
	scheduleGoplsSuggestions,
	stopLanguageClient,
	suggestUpdateGopls,
	toServerInfo,
	updateRestartHistory
} from '../language/goLanguageServer';
import { LegacyLanguageService } from '../language/registerDefaultProviders';
import { Mutex } from '../utils/mutex';

const languageServerStartMutex = new Mutex();

export function startLanguageServer(ctx: vscode.ExtensionContext, goCtx: GoExtensionContext) {
	return async (reason?: RestartReason) => {
		const goConfig = getGoConfig();
		const cfg = buildLanguageServerConfig(goConfig);

		if (typeof reason === 'string') {
			updateRestartHistory(goCtx, reason, cfg.enabled);
		}

		const unlock = await languageServerStartMutex.lock();
		try {
			// If the client has already been started, make sure to clear existing
			// diagnostics and stop it.
			let cleanStop = true;
			if (goCtx.languageClient) {
				cleanStop = await stopLanguageClient(goCtx);
				if (goCtx.languageServerDisposable) {
					goCtx.languageServerDisposable.dispose();
					goCtx.languageServerDisposable = undefined;
				}
			}

			// Before starting the language server, make sure to deregister any
			// currently registered language providers.
			if (goCtx.legacyLanguageService) {
				goCtx.legacyLanguageService.dispose();
				goCtx.legacyLanguageService = undefined;
			}

			if (!shouldActivateLanguageFeatures()) {
				return;
			}

			// We have some extra prompts for gopls users and for people who have opted
			// out of gopls.
			if (reason === RestartReason.ACTIVATION) {
				scheduleGoplsSuggestions(goCtx);
			}

			// If the language server is gopls, we enable a few additional features.
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

			if (!cfg.enabled) {
				const legacyService = new LegacyLanguageService(ctx);
				goCtx.legacyLanguageService = legacyService;
				ctx.subscriptions.push(legacyService);
				updateStatus(goCtx, goConfig, false);
				return;
			}

			// Check if we should recreate the language client.
			// This may be necessary if the user has changed settings
			// in their config, or previous session wasn't stopped cleanly.
			if (!cleanStop || !deepEqual(goCtx.latestConfig, cfg)) {
				// Track the latest config used to start the language server,
				// and rebuild the language client.
				goCtx.languageClient = await buildLanguageClient(goCtx, buildLanguageClientOption(goCtx, cfg));
				goCtx.crashCount = 0;
			}

			const disposable = goCtx.languageClient?.start();
			if (disposable) {
				goCtx.languageServerDisposable = disposable;
				ctx.subscriptions.push(goCtx.languageServerDisposable);
			}
			await goCtx.languageClient?.onReady();
			goCtx.serverInfo = toServerInfo(goCtx.languageClient?.initializeResult);
			updateStatus(goCtx, goConfig, true);
			console.log(`Server: ${JSON.stringify(goCtx.serverInfo, null, 2)}`);
		} finally {
			goCtx.latestConfig = cfg;
			unlock();
		}
	};
}

function updateStatus(goCtx: GoExtensionContext, goConfig: vscode.WorkspaceConfiguration, didStart: boolean) {
	goCtx.languageServerIsRunning = didStart;
	vscode.commands.executeCommand('setContext', 'go.goplsIsRunning', didStart);
	updateLanguageServerIconGoStatusBar(didStart, goConfig['useLanguageServer'] === true);
}

function shouldActivateLanguageFeatures() {
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
	if (schemes && schemes.length > 0 && !schemes.includes('file') && !schemes.includes('untitled')) {
		outputChannel.appendLine(
			`None of the folders in this workspace ${schemes.join(
				','
			)} are the types the language server recognizes. Disabling the language features.`
		);
		return;
	}
	return true;
}
