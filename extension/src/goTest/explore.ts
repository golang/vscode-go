/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import {
	ConfigurationChangeEvent,
	ExtensionContext,
	Memento,
	Range,
	TestController,
	TestItem,
	TestItemCollection,
	TestRunRequest,
	TextDocument,
	TextDocumentChangeEvent,
	Uri,
	workspace,
	WorkspaceFoldersChangeEvent
} from 'vscode';
import vscode = require('vscode');
import { GoDocumentSymbolProvider } from '../goDocumentSymbols';
import { outputChannel } from '../goStatus';
import { dispose, disposeIfEmpty, findItem, GoTest, isInTest, Workspace } from './utils';
import { GoTestResolver, ProvideSymbols } from './resolve';
import { GoTestRunner } from './run';
import { GoTestProfiler } from './profile';
import { GoExtensionContext } from '../context';
import { getGoConfig } from '../config';
import { experiments } from '../experimental';

export class GoTestExplorer {
	static setup(context: ExtensionContext, goCtx: GoExtensionContext) {
		// Set the initial state
		const state: { instance?: GoTestExplorer } = {};
		this.updateEnableState(context, goCtx, state);
		context.subscriptions.push({ dispose: () => state.instance?.dispose() });

		// Update the state when the experimental version is enabled or disabled
		context.subscriptions.push(experiments.onDidChange(() => this.updateEnableState(context, goCtx, state)));

		// Update the state when the explorer is enabled or disabled via config
		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('go.testExplorer.enable')) {
					this.updateEnableState(context, goCtx, state);
				}
			})
		);
	}

	private static updateEnableState(
		context: ExtensionContext,
		goCtx: GoExtensionContext,
		state: { instance?: GoTestExplorer }
	) {
		// Notify the user if it's the first time we've disabled the test
		// explorer
		if (experiments.testExplorer === true) {
			notifyUserOfExperiment(context.globalState).catch((x) =>
				outputChannel.error('An error occurred while notifying the user', x)
			);
		}

		const enabled = getGoConfig().get<boolean>('testExplorer.enable') && !experiments.testExplorer;
		if (enabled && !state.instance) {
			state.instance = this.new(context, goCtx);
			context.subscriptions.push(state.instance);
		} else if (!enabled && state.instance) {
			state.instance.dispose();
			state.instance = undefined;
		}
	}

	static new(context: ExtensionContext, goCtx: GoExtensionContext): GoTestExplorer {
		// This function is exposed for the purpose of testing
		const ctrl = vscode.tests.createTestController('go', 'Go');
		const symProvider = GoDocumentSymbolProvider(goCtx, true);
		const inst = new this(goCtx, workspace, ctrl, context.workspaceState, (doc) =>
			symProvider.provideDocumentSymbols(doc)
		);

		// Process already open editors
		vscode.window.visibleTextEditors.forEach((ed) => {
			inst.documentUpdate(ed.document);
		});

		inst.subscriptions.push(vscode.window.registerTreeDataProvider('go.test.profile', inst.profiler.view));

		inst.subscriptions.push(
			vscode.commands.registerCommand('go.test.refresh', async (item) => {
				if (!item) {
					await vscode.window.showErrorMessage('No test selected');
					return;
				}

				try {
					await inst.resolver.resolve(item);
					inst.resolver.updateGoTestContext();
				} catch (error) {
					const m = 'Failed to resolve tests';
					outputChannel.appendLine(`${m}: ${error}`);
					outputChannel.show();
					await vscode.window.showErrorMessage(m);
				}
			})
		);

		inst.subscriptions.push(
			vscode.commands.registerCommand('go.test.showProfiles', async (item) => {
				if (!item) {
					await vscode.window.showErrorMessage('No test selected');
					return;
				}

				try {
					await inst.profiler.show(item);
				} catch (error) {
					const m = 'Failed to open profiles';
					outputChannel.appendLine(`${m}: ${error}`);
					outputChannel.show();
					await vscode.window.showErrorMessage(m);
				}
			})
		);

		inst.subscriptions.push(
			vscode.commands.registerCommand('go.test.captureProfile', async (item) => {
				if (!item) {
					await vscode.window.showErrorMessage('No test selected');
					return;
				}

				const options = await inst.profiler.configure();
				if (!options) return;

				try {
					await inst.runner.run(new TestRunRequest([item]), undefined, options);
				} catch (error) {
					const m = 'Failed to execute tests';
					outputChannel.appendLine(`${m}: ${error}`);
					outputChannel.show();
					await vscode.window.showErrorMessage(m);
					return;
				}

				await inst.profiler.show(item);
			})
		);

		inst.subscriptions.push(
			vscode.commands.registerCommand('go.test.deleteProfile', async (file) => {
				if (!file) {
					await vscode.window.showErrorMessage('No profile selected');
					return;
				}

				try {
					await inst.profiler.delete(file);
				} catch (error) {
					const m = 'Failed to delete profile';
					outputChannel.appendLine(`${m}: ${error}`);
					outputChannel.show();
					await vscode.window.showErrorMessage(m);
					return;
				}
			})
		);

		inst.subscriptions.push(
			vscode.commands.registerCommand('go.test.showProfileFile', async (file: Uri) => {
				return inst.profiler.showFile(file.fsPath);
			})
		);

		inst.subscriptions.push(
			workspace.onDidChangeConfiguration(async (x) => {
				try {
					await inst.didChangeConfiguration(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.error(`Failed while handling 'onDidChangeConfiguration': ${error}`);
				}
			})
		);

		inst.subscriptions.push(
			workspace.onDidOpenTextDocument(async (x) => {
				try {
					await inst.didOpenTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.error(`Failed while handling 'onDidOpenTextDocument': ${error}`);
				}
			})
		);

		inst.subscriptions.push(
			workspace.onDidChangeTextDocument(async (x) => {
				try {
					await inst.didChangeTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.error(`Failed while handling 'onDidChangeTextDocument': ${error}`);
				}
			})
		);

		inst.subscriptions.push(
			workspace.onDidChangeWorkspaceFolders(async (x) => {
				try {
					await inst.didChangeWorkspaceFolders(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeWorkspaceFolders': ${error}`);
				}
			})
		);

		const watcher = workspace.createFileSystemWatcher('**/*_test.go', false, true, false);
		inst.subscriptions.push(watcher);
		inst.subscriptions.push(
			watcher.onDidCreate(async (x) => {
				try {
					await inst.didCreateFile(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'FileSystemWatcher.onDidCreate': ${error}`);
				}
			})
		);
		inst.subscriptions.push(
			watcher.onDidDelete(async (x) => {
				try {
					await inst.didDeleteFile(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'FileSystemWatcher.onDidDelete': ${error}`);
				}
			})
		);

		return inst;
	}

	public readonly resolver: GoTestResolver;
	public readonly runner: GoTestRunner;
	public readonly profiler: GoTestProfiler;
	public readonly subscriptions: vscode.Disposable[] = [];

	constructor(
		private readonly goCtx: GoExtensionContext,
		private readonly workspace: Workspace,
		private readonly ctrl: TestController,
		workspaceState: Memento,
		provideDocumentSymbols: ProvideSymbols
	) {
		this.resolver = new GoTestResolver(workspace, ctrl, provideDocumentSymbols);
		this.profiler = new GoTestProfiler(this.resolver, workspaceState);
		this.runner = new GoTestRunner(goCtx, workspace, ctrl, this.resolver, this.profiler);
		this.subscriptions.push(ctrl);
	}

	dispose() {
		this.subscriptions.forEach((x) => x.dispose());
		this.subscriptions.splice(0, this.subscriptions.length);
	}

	/* ***** Listeners ***** */

	protected async didOpenTextDocument(doc: TextDocument) {
		await this.documentUpdate(doc);
	}

	protected async didChangeTextDocument(e: TextDocumentChangeEvent) {
		await this.documentUpdate(
			e.document,
			e.contentChanges.map((x) => x.range)
		);
	}

	protected async didChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent) {
		if (e.added.length > 0) {
			await this.resolver.resolve();
			this.resolver.updateGoTestContext();
		}

		if (e.removed.length === 0) {
			return;
		}

		this.ctrl.items.forEach((item) => {
			const { kind } = GoTest.parseId(item.id);
			if (kind === 'package') {
				return;
			}

			const ws = item.uri && this.workspace.getWorkspaceFolder(item.uri);
			if (!ws) {
				dispose(this.resolver, item);
			}
		});
	}

	protected async didCreateFile(file: Uri) {
		// Do not use openTextDocument to get the TextDocument for file,
		// since this sends a didOpen text document notification to gopls,
		// leading to spurious diagnostics from gopls:
		// https://github.com/golang/vscode-go/issues/2570
		// Instead, get the test item for this file only.
		await this.resolver.getFile(file);
	}

	protected async didDeleteFile(file: Uri) {
		const id = GoTest.id(file, 'file');
		function find(children: TestItemCollection): TestItem | undefined {
			return findItem(children, (item) => {
				if (item.id === id) {
					return item;
				}

				if (!item.uri || !file.path.startsWith(item.uri.path)) {
					return;
				}

				return find(item.children);
			});
		}

		const found = find(this.ctrl.items);
		if (found) {
			dispose(this.resolver, found);
			disposeIfEmpty(this.resolver, found.parent);
		}
	}

	protected async didChangeConfiguration(e: ConfigurationChangeEvent) {
		let update = false;
		this.ctrl.items.forEach((item) => {
			if (e.affectsConfiguration('go.testExplorerPackages', item.uri)) {
				dispose(this.resolver, item);
				update = true;
			}
		});

		if (update) {
			this.resolver.resolve();
			this.resolver.updateGoTestContext();
		}
	}

	/* ***** Private ***** */

	// Handle opened documents, document changes, and file creation.
	private async documentUpdate(doc: TextDocument, ranges?: Range[]) {
		if (!doc.uri.path.endsWith('_test.go')) {
			return;
		}

		// If we don't do this, then we attempt to resolve tests in virtual
		// documents such as those created by the Git, GitLens, and GitHub PR
		// extensions
		if (doc.uri.scheme !== 'file') {
			// TODO This breaks virtual/remote workspace support
			return;
		}

		await this.resolver.processDocument(doc, ranges);
		this.resolver.updateGoTestContext();
	}
}

/**
 * Notify the user that we're enabling the experimental explorer.
 */
async function notifyUserOfExperiment(state: Memento) {
	// If the user has acknowledged the notification, don't show it again.
	if (state.get('experiment.testExplorer.didAckNotification') === true) {
		return;
	}

	const r = await vscode.window.showInformationMessage(
		'Switching to the experimental test explorer. This experiments can be disabled by setting go.experiments.testExplorer to false.',
		'Open settings',
		'Ok'
	);

	switch (r) {
		case 'Open settings':
			await vscode.commands.executeCommand('workbench.action.openSettings2', {
				query: 'go.experiments'
			});
			break;

		case 'Ok':
			state.update('experiment.testExplorer.didAckNotification', true);
			break;
	}
}
