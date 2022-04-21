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
import { GoDocumentSymbolProvider } from '../language/legacy/goOutline';
import { outputChannel } from '../goStatus';
import { dispose, disposeIfEmpty, findItem, GoTest, isInTest, Workspace } from './utils';
import { GoTestResolver, ProvideSymbols } from './resolve';
import { GoTestRunner } from './run';
import { GoTestProfiler } from './profile';

// Set true only if the Testing API is available (VSCode version >= 1.59).
export const isVscodeTestingAPIAvailable =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	'object' === typeof (vscode as any).tests && 'function' === typeof (vscode as any).tests.createTestController;

export class GoTestExplorer {
	static setup(context: ExtensionContext): GoTestExplorer {
		if (!isVscodeTestingAPIAvailable) throw new Error('VSCode Testing API is unavailable');

		const ctrl = vscode.tests.createTestController('go', 'Go');
		const symProvider = new GoDocumentSymbolProvider(true);
		const inst = new this(workspace, ctrl, context.workspaceState, (doc, token) =>
			symProvider.provideDocumentSymbols(doc, token)
		);

		// Process already open editors
		vscode.window.visibleTextEditors.forEach((ed) => {
			inst.documentUpdate(ed.document);
		});

		context.subscriptions.push(ctrl);
		context.subscriptions.push(vscode.window.registerTreeDataProvider('go.test.profile', inst.profiler.view));

		context.subscriptions.push(
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

		context.subscriptions.push(
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

		context.subscriptions.push(
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

		context.subscriptions.push(
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

		context.subscriptions.push(
			workspace.onDidChangeConfiguration(async (x) => {
				try {
					await inst.didChangeConfiguration(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeConfiguration': ${error}`);
				}
			})
		);

		context.subscriptions.push(
			workspace.onDidOpenTextDocument(async (x) => {
				try {
					await inst.didOpenTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidOpenTextDocument': ${error}`);
				}
			})
		);

		context.subscriptions.push(
			workspace.onDidChangeTextDocument(async (x) => {
				try {
					await inst.didChangeTextDocument(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'onDidChangeTextDocument': ${error}`);
				}
			})
		);

		context.subscriptions.push(
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
		context.subscriptions.push(watcher);
		context.subscriptions.push(
			watcher.onDidCreate(async (x) => {
				try {
					await inst.didCreateFile(x);
				} catch (error) {
					if (isInTest()) throw error;
					else outputChannel.appendLine(`Failed while handling 'FileSystemWatcher.onDidCreate': ${error}`);
				}
			})
		);
		context.subscriptions.push(
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

	constructor(
		private readonly workspace: Workspace,
		private readonly ctrl: TestController,
		workspaceState: Memento,
		provideDocumentSymbols: ProvideSymbols
	) {
		this.resolver = new GoTestResolver(workspace, ctrl, provideDocumentSymbols);
		this.profiler = new GoTestProfiler(this.resolver, workspaceState);
		this.runner = new GoTestRunner(workspace, ctrl, this.resolver, this.profiler);
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
		await this.documentUpdate(await this.workspace.openTextDocument(file));
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
