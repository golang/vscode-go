/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandFactory } from '.';
import { getGoConfig } from '../config';
import { GoExtensionContext } from '../context';
import { outputChannel, updateLanguageServerIconGoStatusBar } from '../goStatus';
import {
	buildLanguageClient,
	buildLanguageServerConfig,
	RestartReason,
	scheduleGoplsSuggestions,
	stopLanguageClient,
	toServerInfo,
	updateRestartHistory
} from '../language/goLanguageServer';
import { LegacyLanguageService } from '../language/registerDefaultProviders';
import { Mutex } from '../utils/mutex';
import { TelemetryService } from '../goTelemetry';

const languageServerStartMutex = new Mutex();

export const startLanguageServer: CommandFactory = (ctx, goCtx) => {
	return async (reason: RestartReason = RestartReason.MANUAL) => {
		const goConfig = getGoConfig();
		const cfg = await buildLanguageServerConfig(goConfig);
		if (typeof reason === 'string') {
			updateRestartHistory(goCtx, reason, cfg.enabled);
		}

		const unlock = await languageServerStartMutex.lock();
		goCtx.latestConfig = cfg;
		try {
			outputChannel.info(`Try to start language server - ${reason} (enabled: ${cfg.enabled})`);

			// If the client has already been started, make sure to clear existing
			// diagnostics and stop it.
			if (goCtx.languageClient) {
				goCtx.serverOutputChannel?.append(
					`Request to stop language server - ${reason} (enabled: ${cfg.enabled})`
				);
				await stopLanguageClient(goCtx);
			}
			updateStatus(goCtx, goConfig, false);

			// Before starting the language server, make sure to deregister any
			// currently registered language providers.
			if (goCtx.legacyLanguageService) {
				goCtx.legacyLanguageService.dispose();
				goCtx.legacyLanguageService = undefined;
			}

			if (!shouldActivateLanguageFeatures()) {
				outputChannel.warn('Cannot activate language features - unsupported environment');
				return;
			}

			// We have some extra prompts for gopls users and for people who have opted
			// out of gopls.
			if (reason === RestartReason.ACTIVATION) {
				scheduleGoplsSuggestions(goCtx);
			}

			if (!cfg.enabled) {
				outputChannel.warn('Language server is disabled');
				const legacyService = new LegacyLanguageService();
				goCtx.legacyLanguageService = legacyService;
				ctx.subscriptions.push(legacyService);
				updateStatus(goCtx, goConfig, false);
				return;
			}

			goCtx.languageClient = await buildLanguageClient(goCtx, cfg);
			await goCtx.languageClient.start();
			goCtx.serverInfo = toServerInfo(goCtx.languageClient.initializeResult);
			goCtx.telemetryService = new TelemetryService(
				goCtx.languageClient,
				ctx.globalState,
				goCtx.serverInfo?.Commands
			);
			outputChannel.info(
				`Running language server ${goCtx.serverInfo?.Name}(${goCtx.serverInfo?.Version}/${goCtx.serverInfo?.GoVersion})`
			);
		} catch (e) {
			const msg = `Error starting language server: ${e}`;
			outputChannel.error(msg);
			goCtx.serverOutputChannel?.append(msg);
		} finally {
			updateStatus(goCtx, goConfig, true);
			unlock();
		}
	};
};

function updateStatus(goCtx: GoExtensionContext, goConfig: vscode.WorkspaceConfiguration, didStart: boolean) {
	goCtx.languageServerIsRunning = didStart;
	vscode.commands.executeCommand('setContext', 'go.goplsIsRunning', didStart);
	updateLanguageServerIconGoStatusBar(goCtx.languageClient, goConfig['useLanguageServer'] === true);
}

function shouldActivateLanguageFeatures() {
	for (const folder of vscode.workspace.workspaceFolders || []) {
		switch (folder.uri.scheme) {
			case 'vsls':
				outputChannel.error(
					'Language service on the guest side is disabled. ' +
						'The server-side language service will provide the language features.'
				);
				return;
			case 'ssh':
				outputChannel.error('The language server is not supported for SSH. Disabling it.');
				return;
		}
	}
	const schemes = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.scheme);
	if (schemes && schemes.length > 0 && !schemes.includes('file') && !schemes.includes('untitled')) {
		outputChannel.error(
			`None of the folders in this workspace ${schemes.join(
				','
			)} are the types the language server recognizes. Disabling the language features.`
		);
		return;
	}
	return true;
}

export const startGoplsMaintainerInterface: CommandFactory = (ctx, goCtx) => {
	return () => {
		if (!goCtx.languageServerIsRunning) {
			vscode.window.showErrorMessage(
				'"Go: Start language server\'s maintainer interface" command is available only when the language server is running'
			);
			return;
		}
		vscode.commands.executeCommand('gopls.start_debugging', {}).then(undefined, (reason) => {
			vscode.window.showErrorMessage(
				`"Go: Start language server's maintainer interface" command failed: ${reason}`
			);
		});
	};
};
