import {
	test,
	workspace,
	ExtensionContext,
	TestController,
	TestItem,
	TextDocument,
	Uri,
	DocumentSymbol,
	SymbolKind,
	FileType,
	WorkspaceFolder,
	TestRunRequest,
	OutputChannel,
	TestResultState,
	TestRun
} from 'vscode';
import path = require('path');
import { getModFolderPath, isModSupported } from './goModules';
import { getCurrentGoPath } from './util';
import { GoDocumentSymbolProvider } from './goOutline';
import { getGoConfig } from './config';
import { getTestFlags, goTest } from './testUtils';

// We could use TestItem.data, but that may be removed
const symbols = new WeakMap<TestItem, DocumentSymbol>();

export function setupTestExplorer(context: ExtensionContext) {
	const ctrl = test.createTestController('go');
	context.subscriptions.push(ctrl);
	ctrl.root.label = 'Go';
	ctrl.root.canResolveChildren = true;
	ctrl.resolveChildrenHandler = (...args) => resolveChildren(ctrl, ...args);
	ctrl.runHandler = (request, token) => {
		// TODO handle cancelation
		runTest(ctrl, request);
	};

	context.subscriptions.push(
		workspace.onDidOpenTextDocument((e) => documentUpdate(ctrl, e).catch((err) => console.log(err)))
	);

	context.subscriptions.push(
		workspace.onDidChangeTextDocument((e) => documentUpdate(ctrl, e.document).catch((err) => console.log(err)))
	);

	const watcher = workspace.createFileSystemWatcher('**/*_test.go', false, true, false);
	context.subscriptions.push(watcher);
	watcher.onDidCreate(async (e) => await documentUpdate(ctrl, await workspace.openTextDocument(e)));
	watcher.onDidDelete(async (e) => {
		const id = testID(e, 'file');
		function find(parent: TestItem): TestItem {
			for (const item of parent.children.values()) {
				if (item.id == id) {
					return item;
				}

				const uri = Uri.parse(item.id);
				if (!e.path.startsWith(uri.path)) {
					continue;
				}

				const found = find(item);
				if (found) {
					return found;
				}
			}
		}

		const found = find(ctrl.root);
		if (found) {
			found.dispose();
			removeIfEmpty(found.parent);
		}
	});

	context.subscriptions.push(
		workspace.onDidChangeWorkspaceFolders(async (e) => {
			const items = Array.from(ctrl.root.children.values());
			for (const item of items) {
				const uri = Uri.parse(item.id);
				if (uri.query == 'package') {
					continue;
				}

				const ws = workspace.getWorkspaceFolder(uri);
				if (!ws) {
					item.dispose();
				}
			}

			if (e.added) {
				await resolveChildren(ctrl, ctrl.root);
			}
		})
	);
}

function testID(uri: Uri, kind: string, name?: string): string {
	uri = uri.with({ query: kind });
	if (name) uri = uri.with({ fragment: name });
	return uri.toString();
}

function getItem(parent: TestItem, uri: Uri, kind: string, name?: string): TestItem | undefined {
	return parent.children.get(testID(uri, kind, name));
}

function createItem(
	ctrl: TestController,
	parent: TestItem,
	label: string,
	uri: Uri,
	kind: string,
	name?: string
): TestItem {
	const id = testID(uri, kind, name);
	const existing = parent.children.get(id);
	if (existing) {
		return existing;
	}

	return ctrl.createTestItem(id, label, parent, uri);
}

function removeIfEmpty(item: TestItem) {
	// Don't dispose of the root
	if (!item.parent) {
		return;
	}

	// Don't dispose of empty modules
	const uri = Uri.parse(item.id);
	if (uri.query == 'module') {
		return;
	}

	if (item.children.size) {
		return;
	}

	item.dispose();
	removeIfEmpty(item.parent);
}

async function getModule(ctrl: TestController, uri: Uri): Promise<TestItem> {
	const existing = getItem(ctrl.root, uri, 'module');
	if (existing) {
		return existing;
	}

	// Use the module name as the label
	const goMod = Uri.joinPath(uri, 'go.mod');
	const contents = await workspace.fs.readFile(goMod);
	const modLine = contents.toString().split('\n', 2)[0];
	const match = modLine.match(/^module (?<name>.*?)(?:\s|\/\/|$)/);
	const item = createItem(ctrl, ctrl.root, match.groups.name, uri, 'module');
	item.canResolveChildren = true;
	item.runnable = true;
	return item;
}

async function getWorkspace(ctrl: TestController, ws: WorkspaceFolder): Promise<TestItem> {
	const existing = getItem(ctrl.root, ws.uri, 'workspace');
	if (existing) {
		return existing;
	}

	// Use the workspace folder name as the label
	const item = createItem(ctrl, ctrl.root, ws.name, ws.uri, 'workspace');
	item.canResolveChildren = true;
	item.runnable = true;
	return item;
}

async function getPackage(ctrl: TestController, uri: Uri): Promise<TestItem> {
	let item: TestItem;

	const modDir = await getModFolderPath(uri, true);
	const wsfolder = workspace.getWorkspaceFolder(uri);
	if (modDir) {
		// If the package is in a module, add it as a child of the module
		const modUri = uri.with({ path: modDir });
		const module = await getModule(ctrl, modUri);
		const existing = getItem(module, uri, 'package');
		if (existing) {
			return existing;
		}

		if (uri.path == modUri.path) {
			return module;
		}

		const label = uri.path.startsWith(modUri.path) ? uri.path.substring(modUri.path.length + 1) : uri.path;
		item = createItem(ctrl, module, label, uri, 'package');
	} else if (wsfolder) {
		// If the package is in a workspace folder, add it as a child of the workspace
		const workspace = await getWorkspace(ctrl, wsfolder);
		const existing = getItem(workspace, uri, 'package');
		if (existing) {
			return existing;
		}

		const label = uri.path.startsWith(wsfolder.uri.path)
			? uri.path.substring(wsfolder.uri.path.length + 1)
			: uri.path;
		item = createItem(ctrl, workspace, label, uri, 'package');
	} else {
		// Otherwise, add it directly to the root
		const existing = getItem(ctrl.root, uri, 'package');
		if (existing) {
			return existing;
		}

		const srcPath = path.join(getCurrentGoPath(uri), 'src');
		const label = uri.path.startsWith(srcPath) ? uri.path.substring(srcPath.length + 1) : uri.path;
		item = createItem(ctrl, ctrl.root, label, uri, 'package');
	}

	item.canResolveChildren = true;
	item.runnable = true;
	return item;
}

async function getFile(ctrl: TestController, uri: Uri): Promise<TestItem> {
	const dir = path.dirname(uri.path);
	const pkg = await getPackage(ctrl, uri.with({ path: dir }));
	const existing = getItem(pkg, uri, 'file');
	if (existing) {
		return existing;
	}

	const label = path.basename(uri.path);
	const item = createItem(ctrl, pkg, label, uri, 'file');
	item.canResolveChildren = true;
	item.runnable = true;
	return item;
}

async function processSymbol(
	ctrl: TestController,
	uri: Uri,
	file: TestItem,
	seen: Set<string>,
	symbol: DocumentSymbol
) {
	// Skip TestMain(*testing.M)
	if (symbol.name === 'TestMain' || /\*testing.M\)/.test(symbol.detail)) {
		return;
	}

	// Recursively process symbols that are nested
	if (symbol.kind !== SymbolKind.Function) {
		for (const sym of symbol.children) await processSymbol(ctrl, uri, file, seen, sym);
		return;
	}

	const match = symbol.name.match(/^(?<type>Test|Example|Benchmark)/);
	if (!match) {
		return;
	}

	seen.add(symbol.name);

	const kind = match.groups.type.toLowerCase();
	const existing = getItem(file, uri, kind, symbol.name);
	if (existing) {
		return existing;
	}

	const item = createItem(ctrl, file, symbol.name, uri, kind, symbol.name);
	item.range = symbol.range;
	item.runnable = true;
	// item.debuggable = true;
	symbols.set(item, symbol);
}

async function loadFileTests(ctrl: TestController, doc: TextDocument) {
	const seen = new Set<string>();
	const item = await getFile(ctrl, doc.uri);
	const symbols = await new GoDocumentSymbolProvider().provideDocumentSymbols(doc, null);
	for (const symbol of symbols) await processSymbol(ctrl, doc.uri, item, seen, symbol);

	for (const child of item.children.values()) {
		const uri = Uri.parse(child.id);
		if (!seen.has(uri.fragment)) {
			child.dispose();
		}
	}

	removeIfEmpty(item);
}

enum WalkStop {
	None = 0,
	Abort,
	Current,
	Files,
	Directories
}

// Recursively walk a directory, breadth first
async function walk(
	uri: Uri,
	cb: (dir: Uri, file: string, type: FileType) => Promise<WalkStop | undefined>
): Promise<void> {
	let dirs = [uri];

	// While there are directories to be scanned
	while (dirs.length) {
		const d = dirs;
		dirs = [];

		outer: for (const uri of d) {
			const dirs2 = [];
			let skipFiles = false,
				skipDirs = false;

			// Scan the directory
			inner: for (const [file, type] of await workspace.fs.readDirectory(uri)) {
				if ((skipFiles && type == FileType.File) || (skipDirs && type == FileType.Directory)) {
					continue;
				}

				// Ignore all dotfiles
				if (file.startsWith('.')) {
					continue;
				}

				if (type == FileType.Directory) {
					dirs2.push(Uri.joinPath(uri, file));
				}

				const s = await cb(uri, file, type);
				switch (s) {
					case WalkStop.Abort:
						// Immediately abort the entire walk
						return;

					case WalkStop.Current:
						// Immediately abort the current directory
						continue outer;

					case WalkStop.Files:
						// Skip all subsequent files in the current directory
						skipFiles = true;
						if (skipFiles && skipDirs) {
							break inner;
						}
						break;

					case WalkStop.Directories:
						// Skip all subsequent directories in the current directory
						skipDirs = true;
						if (skipFiles && skipDirs) {
							break inner;
						}
						break;
				}
			}

			// Add subdirectories to the recursion list
			dirs.push(...dirs2);
		}
	}
}

async function walkWorkspaces(uri: Uri) {
	const found = new Map<string, boolean>();
	await walk(uri, async (dir, file, type) => {
		if (type != FileType.File) {
			return;
		}

		if (file == 'go.mod') {
			found.set(dir.toString(), true);
			return WalkStop.Current;
		}

		if (file.endsWith('.go')) {
			found.set(dir.toString(), false);
		}
	});
	return found;
}

async function walkPackages(uri: Uri, cb: (uri: Uri) => Promise<any>) {
	await walk(uri, async (dir, file, type) => {
		if (file.endsWith('_test.go')) {
			await cb(dir);
			return WalkStop.Files;
		}
	});
}

async function documentUpdate(ctrl: TestController, doc: TextDocument) {
	if (!doc.uri.path.endsWith('_test.go')) {
		return;
	}

	if (doc.uri.scheme === 'git') {
		// TODO(firelizzard18): When a workspace is reopened, VSCode passes us git: URIs. Why?
		return;
	}

	await loadFileTests(ctrl, doc);
}

async function resolveChildren(ctrl: TestController, item: TestItem) {
	if (!item.parent) {
		// Dispose of package entries at the root if they are now part of a workspace folder
		const items = Array.from(ctrl.root.children.values());
		for (const item of items) {
			const uri = Uri.parse(item.id);
			if (uri.query !== 'package') {
				continue;
			}

			if (workspace.getWorkspaceFolder(uri)) {
				item.dispose();
			}
		}

		// Create entries for all modules and workspaces
		for (const folder of workspace.workspaceFolders || []) {
			const found = await walkWorkspaces(folder.uri);
			let needWorkspace = false;
			for (const [uri, isMod] of found.entries()) {
				if (!isMod) {
					needWorkspace = true;
					continue;
				}

				await getModule(ctrl, Uri.parse(uri));
			}

			// If the workspace folder contains any Go files not in a module, create a workspace entry
			if (needWorkspace) {
				await getWorkspace(ctrl, folder);
			}
		}
		return;
	}

	const uri = Uri.parse(item.id);
	if (uri.query == 'module' || uri.query == 'workspace') {
		// Create entries for all packages in the module or workspace
		await walkPackages(uri, async (uri) => {
			await getPackage(ctrl, uri);
		});
	}

	if (uri.query == 'module' || uri.query == 'package') {
		// Create entries for all test files in the package
		for (const [file, type] of await workspace.fs.readDirectory(uri)) {
			if (type !== FileType.File || !file.endsWith('_test.go')) {
				continue;
			}

			await getFile(ctrl, Uri.joinPath(uri, file));
		}
	}

	if (uri.query == 'file') {
		// Create entries for all test functions in a file
		const doc = await workspace.openTextDocument(uri);
		await loadFileTests(ctrl, doc);
	}
}

async function collectTests(
	ctrl: TestController,
	item: TestItem,
	excluded: TestItem[],
	functions: Map<string, TestItem[]>,
	docs: Set<Uri>
) {
	for (let i = item; i.parent; i = i.parent) {
		if (excluded.indexOf(i) >= 0) {
			return;
		}
	}

	const uri = Uri.parse(item.id);
	if (!uri.fragment) {
		if (!item.children.size) {
			await resolveChildren(ctrl, item);
		}

		for (const child of item.children.values()) {
			await collectTests(ctrl, child, excluded, functions, docs);
		}
		return;
	}

	const file = uri.with({ query: '', fragment: '' });
	docs.add(file);

	const dir = file.with({ path: path.dirname(uri.path) }).toString();
	if (functions.has(dir)) {
		functions.get(dir).push(item);
	} else {
		functions.set(dir, [item]);
	}
	return;
}

class TestRunOutput implements OutputChannel {
	constructor(private run: TestRun<any>, private tests: TestItem[]) {}

	get name() {
		return 'Go Test API';
	}

	append(value: string) {
		this.run.appendOutput(value);
	}

	appendLine(value: string) {
		this.run.appendOutput(value + '\n');
	}

	clear() {}
	show(...args: any[]) {}
	hide() {}
	dispose() {}
}

async function runTest<T>(ctrl: TestController, request: TestRunRequest<T>) {
	const functions = new Map<string, TestItem[]>();
	const docs = new Set<Uri>();
	for (const item of request.tests) {
		await collectTests(ctrl, item, request.exclude, functions, docs);
	}

	// Ensure `go test` has the latest changes
	await Promise.all(
		Array.from(docs).map((uri) => {
			workspace.openTextDocument(uri).then((doc) => doc.save());
		})
	);

	const run = ctrl.createTestRun(request);
	const goConfig = getGoConfig();
	for (const [dir, tests] of functions.entries()) {
		const functions = tests.map((test) => Uri.parse(test.id).fragment);

		// TODO this should be more granular
		tests.forEach((test) => run.setState(test, TestResultState.Running));

		const uri = Uri.parse(dir);
		const result = await goTest({
			goConfig,
			dir: uri.fsPath,
			functions,
			flags: getTestFlags(goConfig),
			isMod: await isModSupported(uri, true),
			outputChannel: new TestRunOutput(run, tests),
			applyCodeCoverage: goConfig.get<boolean>('coverOnSingleTest')
		});

		tests.forEach((test) => run.setState(test, result ? TestResultState.Passed : TestResultState.Failed));
	}

	run.end();
}
