/*---------------------------------------------------------
 * Copyright 2024 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { EventEmitter, ExtensionContext, ExtensionMode, extensions, workspace } from 'vscode';
import { extensionInfo } from './config';

type Settings = {
	testExplorer: boolean;
};

class Experiments {
	#didChange = new EventEmitter<Experiments>();

	// Default to disabled
	#testExplorer = false;

	activate(ctx: ExtensionContext) {
		// Cleanup the event emitter when the extension is unloaded
		ctx.subscriptions.push(this.#didChange);

		// Don't enable any experiments in a production release
		if (ctx.extensionMode === ExtensionMode.Production && !extensionInfo.isPreview) {
			return;
		}

		// Check on boot
		this.#maybeEnableExperiments();

		// Check when an extension is installed or uninstalled
		ctx.subscriptions.push(extensions.onDidChange(() => this.#maybeEnableExperiments()));

		// Check when the configuration changes
		ctx.subscriptions.push(
			workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('go.experiments')) {
					this.#maybeEnableExperiments();
				}
			})
		);
	}

	/**
	 * Checks whether experiments should be enabled or disabled. If the
	 * enable/disable state of an experiment changes, an {@link onDidChange}
	 * event is issued.
	 */
	#maybeEnableExperiments() {
		const settings = workspace.getConfiguration('go').get<Settings>('experiments');

		// Check if the test explorer experiment should be activated
		const goExp = extensions.getExtension('ethan-reesor.exp-vscode-go');
		const testExplorer = settings?.testExplorer !== false && !!goExp;
		if (testExplorer !== this.#testExplorer) {
			this.#testExplorer = testExplorer;
			this.#didChange.fire(this);
		}
	}

	/**
	 * onDidChange issues an event whenever the enable/disable status of an
	 * experiment changes. This can happen due to configuration changes or
	 * companion extensions being loaded or unloaded.
	 */
	readonly onDidChange = this.#didChange.event;

	/**
	 * If true, this extension's test explorer is disabled in favor of Go
	 * Companion's test explorer.
	 */
	get testExplorer() {
		return this.#testExplorer;
	}
}

export const experiments = new Experiments();
