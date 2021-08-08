import {
	CancellationToken,
	ConfigurationChangeEvent,
	DocumentSymbol,
	ExtensionContext,
	FileType,
	Location,
	OutputChannel,
	Position,
	Range,
	SymbolKind,
	TestController,
	TestItem,
	TestItemCollection,
	TestMessage,
	TestRun,
	TestRunProfileKind,
	TestRunRequest,
	TextDocument,
	TextDocumentChangeEvent,
	Uri,
	workspace,
	WorkspaceFolder,
	WorkspaceFoldersChangeEvent
} from 'vscode';
import vscode = require('vscode');
import path = require('path');
import { getModFolderPath, isModSupported } from './goModules';
import { getCurrentGoPath } from './util';
import { GoDocumentSymbolProvider } from './goOutline';
import { getGoConfig } from './config';
import { getTestFlags, goTest, GoTestOutput } from './testUtils';
import { outputChannel } from './goStatus';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace TestExplorer {
	// exported for tests

	export type FileSystem = Pick<vscode.FileSystem, 'readFile' | 'readDirectory'>;

	export interface Workspace extends Pick<typeof vscode.workspace, 'workspaceFolders' | 'getWorkspaceFolder'> {
		readonly fs: FileSystem; // custom FS type

		openTextDocument(uri: Uri): Thenable<TextDocument>; // only one overload
	}
}

async function doSafe<T>(context: string, p: Thenable<T> | (() => T | Thenable<T>), onError?: T): Promise<T> {
	try {
		if (typeof p === 'function') {
			return await p();
		} else {
			return await p;
		}
	} catch (error) {
		if (process.env.VSCODE_GO_IN_TEST === '1') {
			throw error;
		}

		// TODO internationalization?
		if (context === 'resolveHandler') {
			const m = 'Failed to resolve tests';
			outputChannel.appendLine(`${m}: ${error}`);
			await vscode.window.showErrorMessage(m);
		} else if (context === 'runHandler') {
			const m = 'Failed to execute tests';
			outputChannel.appendLine(`${m}: ${error}`);
			await vscode.window.showErrorMessage(m);
		} else if (/^did/.test(context)) {
			outputChannel.appendLine(`Failed while handling '${context}': ${error}`);
		} else {
			const m = 'An unknown error occured';
			outputChannel.appendLine(`${m}: ${error}`);
			await vscode.window.showErrorMessage(m);
		}
		return onError;
	}
}

export class TestExplorer {
	static setup(context: ExtensionContext): TestExplorer {
		const ctrl = vscode.tests.createTestController('go', 'Go');
		const getSym = new GoDocumentSymbolProvider().provideDocumentSymbols;
		const inst = new this(ctrl, workspace, getSym);

		context.subscriptions.push(
			workspace.onDidChangeConfiguration((x) =>
				doSafe('onDidChangeConfiguration', inst.didChangeConfiguration(x))
			)
		);

		context.subscriptions.push(
			workspace.onDidOpenTextDocument((x) => doSafe('onDidOpenTextDocument', inst.didOpenTextDocument(x)))
		);

		context.subscriptions.push(
			workspace.onDidChangeTextDocument((x) => doSafe('onDidChangeTextDocument', inst.didChangeTextDocument(x)))
		);

		context.subscriptions.push(
			workspace.onDidChangeWorkspaceFolders((x) =>
				doSafe('onDidChangeWorkspaceFolders', inst.didChangeWorkspaceFolders(x))
			)
		);

		const watcher = workspace.createFileSystemWatcher('**/*_test.go', false, true, false);
		context.subscriptions.push(watcher);
		context.subscriptions.push(watcher.onDidCreate((x) => doSafe('onDidCreate', inst.didCreateFile(x))));
		context.subscriptions.push(watcher.onDidDelete((x) => doSafe('onDidDelete', inst.didDeleteFile(x))));

		return inst;
	}

	constructor(
		public ctrl: TestController,
		public ws: TestExplorer.Workspace,
		public provideDocumentSymbols: (doc: TextDocument, token: CancellationToken) => Thenable<DocumentSymbol[]>
	) {
		ctrl.resolveHandler = (item) => this.resolve(item);
		ctrl.createRunProfile('go test', TestRunProfileKind.Run, (rq, tok) => this.run(rq, tok), true);
	}

	/* ***** Interface (external) ***** */

	resolve(item?: TestItem) {
		return doSafe('resolveHandler', resolve(this, item));
	}

	run(request: TestRunRequest, token: CancellationToken) {
		return doSafe('runHandler', runTests(this, request, token));
	}

	/* ***** Interface (internal) ***** */

	// Create an item.
	createItem(label: string, uri: Uri, kind: string, name?: string): TestItem {
		return this.ctrl.createTestItem(testID(uri, kind, name), label, uri.with({ query: '', fragment: '' }));
	}

	// Retrieve an item.
	getItem(parent: TestItem | undefined, uri: Uri, kind: string, name?: string): TestItem {
		const items = getChildren(parent || this.ctrl.items);
		return items.get(testID(uri, kind, name));
	}

	// Create or retrieve an item.
	getOrCreateItem(parent: TestItem | undefined, label: string, uri: Uri, kind: string, name?: string): TestItem {
		const existing = this.getItem(parent, uri, kind, name);
		if (existing) return existing;

		const item = this.createItem(label, uri, kind, name);
		getChildren(parent || this.ctrl.items).add(item);
		return item;
	}

	// Create or Retrieve a sub test or benchmark. The ID will be of the form:
	//     file:///path/to/mod/file.go?test#TestXxx/A/B/C
	getOrCreateSubTest(item: TestItem, name: string): TestItem {
		const { fragment: parentName, query: kind } = Uri.parse(item.id);
		const existing = this.getItem(item, item.uri, kind, `${parentName}/${name}`);
		if (existing) return existing;

		item.canResolveChildren = true;
		const sub = this.createItem(name, item.uri, kind, `${parentName}/${name}`);
		item.children.add(sub);
		sub.range = item.range;
		return sub;
	}

	/* ***** Listeners ***** */

	protected async didOpenTextDocument(doc: TextDocument) {
		await documentUpdate(this, doc);
	}

	protected async didChangeTextDocument(e: TextDocumentChangeEvent) {
		await documentUpdate(
			this,
			e.document,
			e.contentChanges.map((x) => x.range)
		);
	}

	protected async didChangeWorkspaceFolders(e: WorkspaceFoldersChangeEvent) {
		for (const item of collect(this.ctrl.items)) {
			const uri = Uri.parse(item.id);
			if (uri.query === 'package') {
				continue;
			}

			const ws = this.ws.getWorkspaceFolder(uri);
			if (!ws) {
				dispose(item);
			}
		}

		if (e.added) {
			await resolve(this);
		}
	}

	protected async didCreateFile(file: Uri) {
		await documentUpdate(this, await this.ws.openTextDocument(file));
	}

	protected async didDeleteFile(file: Uri) {
		const id = testID(file, 'file');
		function find(children: TestItemCollection): TestItem {
			for (const item of collect(children)) {
				if (item.id === id) {
					return item;
				}

				const uri = Uri.parse(item.id);
				if (!file.path.startsWith(uri.path)) {
					continue;
				}

				const found = find(item.children);
				if (found) {
					return found;
				}
			}
		}

		const found = find(this.ctrl.items);
		if (found) {
			dispose(found);
			disposeIfEmpty(found.parent);
		}
	}

	protected async didChangeConfiguration(e: ConfigurationChangeEvent) {
		let update = false;
		for (const item of collect(this.ctrl.items)) {
			if (e.affectsConfiguration('go.testExplorerPackages', item.uri)) {
				dispose(item);
				update = true;
			}
		}

		if (update) {
			resolve(this);
		}
	}
}

// Construct an ID for an item. Exported for tests.
// - Module:    file:///path/to/mod?module
// - Package:   file:///path/to/mod/pkg?package
// - File:      file:///path/to/mod/file.go?file
// - Test:      file:///path/to/mod/file.go?test#TestXxx
// - Benchmark: file:///path/to/mod/file.go?benchmark#BenchmarkXxx
// - Example:   file:///path/to/mod/file.go?example#ExampleXxx
export function testID(uri: Uri, kind: string, name?: string): string {
	uri = uri.with({ query: kind });
	if (name) uri = uri.with({ fragment: name });
	return uri.toString();
}

function collect(items: TestItemCollection): TestItem[] {
	const r: TestItem[] = [];
	items.forEach((i) => r.push(i));
	return r;
}

function getChildren(parent: TestItem | TestItemCollection): TestItemCollection {
	if ('children' in parent) {
		return parent.children;
	}
	return parent;
}

function dispose(item: TestItem) {
	item.parent.children.delete(item.id);
}

// Dispose of the item if it has no children, recursively. This facilitates
// cleaning up package/file trees that contain no tests.
function disposeIfEmpty(item: TestItem) {
	// Don't dispose of empty top-level items
	const uri = Uri.parse(item.id);
	if (uri.query === 'module' || uri.query === 'workspace' || (uri.query === 'package' && !item.parent)) {
		return;
	}

	if (item.children.size > 0) {
		return;
	}

	dispose(item);
	disposeIfEmpty(item.parent);
}

// Dispose of the children of a test. Sub-tests and sub-benchmarks are
// discovered emperically (from test output) not semantically (from code), so
// there are situations where they must be discarded.
function discardChildren(item: TestItem) {
	item.canResolveChildren = false;
	item.children.forEach(dispose);
}

// If a test/benchmark with children is relocated, update the children's
// location.
function relocateChildren(item: TestItem) {
	for (const child of collect(item.children)) {
		child.range = item.range;
		relocateChildren(child);
	}
}

// Retrieve or create an item for a Go module.
async function getModule(expl: TestExplorer, uri: Uri): Promise<TestItem> {
	const existing = expl.getItem(null, uri, 'module');
	if (existing) {
		return existing;
	}

	// Use the module name as the label
	const goMod = Uri.joinPath(uri, 'go.mod');
	const contents = await expl.ws.fs.readFile(goMod);
	const modLine = contents.toString().split('\n', 2)[0];
	const match = modLine.match(/^module (?<name>.*?)(?:\s|\/\/|$)/);
	const item = expl.getOrCreateItem(null, match.groups.name, uri, 'module');
	item.canResolveChildren = true;
	return item;
}

// Retrieve or create an item for a workspace folder that is not a module.
async function getWorkspace(expl: TestExplorer, ws: WorkspaceFolder): Promise<TestItem> {
	const existing = expl.getItem(null, ws.uri, 'workspace');
	if (existing) {
		return existing;
	}

	// Use the workspace folder name as the label
	const item = expl.getOrCreateItem(null, ws.name, ws.uri, 'workspace');
	item.canResolveChildren = true;
	return item;
}

// Retrieve or create an item for a Go package.
async function getPackage(expl: TestExplorer, uri: Uri): Promise<TestItem> {
	let item: TestItem;

	const nested = getGoConfig(uri).get('testExplorerPackages') === 'nested';
	const modDir = await getModFolderPath(uri, true);
	const wsfolder = workspace.getWorkspaceFolder(uri);
	if (modDir) {
		// If the package is in a module, add it as a child of the module
		let parent = await getModule(expl, uri.with({ path: modDir, query: '', fragment: '' }));
		if (uri.path === parent.uri.path) {
			return parent;
		}

		if (nested) {
			const bits = path.relative(parent.uri.path, uri.path).split(path.sep);
			while (bits.length > 1) {
				const dir = bits.shift();
				const dirUri = uri.with({ path: path.join(parent.uri.path, dir), query: '', fragment: '' });
				parent = expl.getOrCreateItem(parent, dir, dirUri, 'package');
			}
		}

		const label = uri.path.startsWith(parent.uri.path) ? uri.path.substring(parent.uri.path.length + 1) : uri.path;
		item = expl.getOrCreateItem(parent, label, uri, 'package');
	} else if (wsfolder) {
		// If the package is in a workspace folder, add it as a child of the workspace
		const workspace = await getWorkspace(expl, wsfolder);
		const existing = expl.getItem(workspace, uri, 'package');
		if (existing) {
			return existing;
		}

		const label = uri.path.startsWith(wsfolder.uri.path)
			? uri.path.substring(wsfolder.uri.path.length + 1)
			: uri.path;
		item = expl.getOrCreateItem(workspace, label, uri, 'package');
	} else {
		// Otherwise, add it directly to the root
		const existing = expl.getItem(null, uri, 'package');
		if (existing) {
			return existing;
		}

		const srcPath = path.join(getCurrentGoPath(uri), 'src');
		const label = uri.path.startsWith(srcPath) ? uri.path.substring(srcPath.length + 1) : uri.path;
		item = expl.getOrCreateItem(null, label, uri, 'package');
	}

	item.canResolveChildren = true;
	return item;
}

// Retrieve or create an item for a Go file.
async function getFile(expl: TestExplorer, uri: Uri): Promise<TestItem> {
	const dir = path.dirname(uri.path);
	const pkg = await getPackage(expl, uri.with({ path: dir, query: '', fragment: '' }));
	const existing = expl.getItem(pkg, uri, 'file');
	if (existing) {
		return existing;
	}

	const label = path.basename(uri.path);
	const item = expl.getOrCreateItem(pkg, label, uri, 'file');
	item.canResolveChildren = true;
	return item;
}

// Recursively process a Go AST symbol. If the symbol represents a test,
// benchmark, or example function, a test item will be created for it, if one
// does not already exist. If the symbol is not a function and contains
// children, those children will be processed recursively.
async function processSymbol(expl: TestExplorer, uri: Uri, file: TestItem, seen: Set<string>, symbol: DocumentSymbol) {
	// Skip TestMain(*testing.M) - allow TestMain(*testing.T)
	if (symbol.name === 'TestMain' && /\*testing.M\)/.test(symbol.detail)) {
		return;
	}

	// Recursively process symbols that are nested
	if (symbol.kind !== SymbolKind.Function) {
		for (const sym of symbol.children) await processSymbol(expl, uri, file, seen, sym);
		return;
	}

	const match = symbol.name.match(/^(?<type>Test|Example|Benchmark)/);
	if (!match) {
		return;
	}

	seen.add(symbol.name);

	const kind = match.groups.type.toLowerCase();
	const existing = expl.getItem(file, uri, kind, symbol.name);
	if (existing) {
		if (!existing.range.isEqual(symbol.range)) {
			existing.range = symbol.range;
			relocateChildren(existing);
		}
		return existing;
	}

	const item = expl.getOrCreateItem(file, symbol.name, uri, kind, symbol.name);
	item.range = symbol.range;
}

// Processes a Go document, calling processSymbol for each symbol in the
// document.
//
// Any previously existing tests that no longer have a corresponding symbol in
// the file will be disposed. If the document contains no tests, it will be
// disposed.
async function processDocument(expl: TestExplorer, doc: TextDocument, ranges?: Range[]) {
	const seen = new Set<string>();
	const item = await getFile(expl, doc.uri);
	const symbols = await expl.provideDocumentSymbols(doc, null);
	for (const symbol of symbols) await processSymbol(expl, doc.uri, item, seen, symbol);

	for (const child of collect(item.children)) {
		const uri = Uri.parse(child.id);
		if (!seen.has(uri.fragment)) {
			dispose(child);
			continue;
		}

		if (ranges?.some((r) => !!child.range.intersection(r))) {
			discardChildren(child);
		}
	}

	disposeIfEmpty(item);
}

// Reasons to stop walking
enum WalkStop {
	None = 0, // Don't stop
	Abort, // Abort the walk
	Current, // Stop walking the current directory
	Files, // Skip remaining files
	Directories // Skip remaining directories
}

// Recursively walk a directory, breadth first.
async function walk(
	fs: TestExplorer.FileSystem,
	uri: Uri,
	cb: (dir: Uri, file: string, type: FileType) => Promise<WalkStop | undefined>
): Promise<void> {
	let dirs = [uri];

	// While there are directories to be scanned
	while (dirs.length > 0) {
		const d = dirs;
		dirs = [];

		outer: for (const uri of d) {
			const dirs2 = [];
			let skipFiles = false,
				skipDirs = false;

			// Scan the directory
			inner: for (const [file, type] of await fs.readDirectory(uri)) {
				if ((skipFiles && type === FileType.File) || (skipDirs && type === FileType.Directory)) {
					continue;
				}

				// Ignore all dotfiles
				if (file.startsWith('.')) {
					continue;
				}

				if (type === FileType.Directory) {
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

// Walk the workspace, looking for Go modules. Returns a map indicating paths
// that are modules (value == true) and paths that are not modules but contain
// Go files (value == false).
async function walkWorkspaces(fs: TestExplorer.FileSystem, uri: Uri): Promise<Map<string, boolean>> {
	const found = new Map<string, boolean>();
	await walk(fs, uri, async (dir, file, type) => {
		if (type !== FileType.File) {
			return;
		}

		if (file === 'go.mod') {
			// BUG(firelizard18): This ignores modules within a module
			found.set(dir.toString(), true);
			return WalkStop.Current;
		}

		if (file.endsWith('.go')) {
			found.set(dir.toString(), false);
		}
	});
	return found;
}

// Walk the workspace, calling the callback for any directory that contains a Go
// test file.
async function walkPackages(fs: TestExplorer.FileSystem, uri: Uri, cb: (uri: Uri) => Promise<unknown>) {
	await walk(fs, uri, async (dir, file) => {
		if (file.endsWith('_test.go')) {
			await cb(dir);
			return WalkStop.Files;
		}
	});
}

// Handle opened documents, document changes, and file creation.
async function documentUpdate(expl: TestExplorer, doc: TextDocument, ranges?: Range[]) {
	if (!doc.uri.path.endsWith('_test.go')) {
		return;
	}

	if (doc.uri.scheme === 'git') {
		// TODO(firelizzard18): When a workspace is reopened, VSCode passes us git: URIs. Why?
		return;
	}

	await processDocument(expl, doc, ranges);
}

// TestController.resolveChildrenHandler callback
async function resolve(expl: TestExplorer, item?: TestItem) {
	// Expand the root item - find all modules and workspaces
	if (!item) {
		// Dispose of package entries at the root if they are now part of a workspace folder
		for (const item of collect(expl.ctrl.items)) {
			const uri = Uri.parse(item.id);
			if (uri.query !== 'package') {
				continue;
			}

			if (expl.ws.getWorkspaceFolder(uri)) {
				dispose(item);
			}
		}

		// Create entries for all modules and workspaces
		for (const folder of expl.ws.workspaceFolders || []) {
			const found = await walkWorkspaces(expl.ws.fs, folder.uri);
			let needWorkspace = false;
			for (const [uri, isMod] of found.entries()) {
				if (!isMod) {
					needWorkspace = true;
					continue;
				}

				await getModule(expl, Uri.parse(uri));
			}

			// If the workspace folder contains any Go files not in a module, create a workspace entry
			if (needWorkspace) {
				await getWorkspace(expl, folder);
			}
		}
		return;
	}

	const uri = Uri.parse(item.id);

	// The user expanded a module or workspace - find all packages
	if (uri.query === 'module' || uri.query === 'workspace') {
		await walkPackages(expl.ws.fs, uri, async (uri) => {
			await getPackage(expl, uri);
		});
	}

	// The user expanded a module or package - find all files
	if (uri.query === 'module' || uri.query === 'package') {
		for (const [file, type] of await expl.ws.fs.readDirectory(uri)) {
			if (type !== FileType.File || !file.endsWith('_test.go')) {
				continue;
			}

			await getFile(expl, Uri.joinPath(uri, file));
		}
	}

	// The user expanded a file - find all functions
	if (uri.query === 'file') {
		const doc = await expl.ws.openTextDocument(uri.with({ query: '', fragment: '' }));
		await processDocument(expl, doc);
	}

	// TODO(firelizzard18): If uri.query is test or benchmark, this is where we
	// would discover sub tests or benchmarks, if that is feasible.
}

type CollectedTest = { item: TestItem; explicitlyIncluded: boolean };

// Recursively find all tests, benchmarks, and examples within a
// module/package/etc, minus exclusions. Map tests to the package they are
// defined in, and track files.
async function collectTests(
	expl: TestExplorer,
	item: TestItem,
	explicitlyIncluded: boolean,
	excluded: TestItem[],
	functions: Map<string, CollectedTest[]>,
	docs: Set<Uri>
) {
	for (let i = item; i.parent; i = i.parent) {
		if (excluded.indexOf(i) >= 0) {
			return;
		}
	}

	const uri = Uri.parse(item.id);
	if (!uri.fragment) {
		if (item.children.size === 0) {
			await resolve(expl, item);
		}

		for (const child of collect(item.children)) {
			await collectTests(expl, child, false, excluded, functions, docs);
		}
		return;
	}

	const file = uri.with({ query: '', fragment: '' });
	docs.add(file);

	const dir = file.with({ path: path.dirname(uri.path) }).toString();
	if (functions.has(dir)) {
		functions.get(dir).push({ item, explicitlyIncluded });
	} else {
		functions.set(dir, [{ item, explicitlyIncluded }]);
	}
	return;
}

// TestRunOutput is a fake OutputChannel that forwards all test output to the test API
// console.
class TestRunOutput implements OutputChannel {
	readonly name: string;
	readonly lines: string[] = [];

	constructor(private run: TestRun) {
		this.name = `Test run at ${new Date()}`;
	}

	append(value: string) {
		this.run.appendOutput(value);
	}

	appendLine(value: string) {
		this.lines.push(value);
		this.run.appendOutput(value + '\r\n');
	}

	clear() {}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	show(...args: unknown[]) {}
	hide() {}
	dispose() {}
}

// Resolve a test name to a test item. If the test name is TestXxx/Foo, Foo is
// created as a child of TestXxx. The same is true for TestXxx#Foo and
// TestXxx/#Foo.
function resolveTestName(expl: TestExplorer, tests: Record<string, TestItem>, name: string): TestItem | undefined {
	if (!name) {
		return;
	}

	const parts = name.split(/[#/]+/);
	let test = tests[parts[0]];
	if (!test) {
		return;
	}

	for (const part of parts.slice(1)) {
		test = expl.getOrCreateSubTest(test, part);
	}
	return test;
}

// Process benchmark events (see test_events.md)
function consumeGoBenchmarkEvent(
	expl: TestExplorer,
	run: TestRun,
	benchmarks: Record<string, TestItem>,
	complete: Set<TestItem>,
	e: GoTestOutput
) {
	if (e.Test) {
		// Find (or create) the (sub)benchmark
		const test = resolveTestName(expl, benchmarks, e.Test);
		if (!test) {
			return;
		}

		switch (e.Action) {
			case 'fail': // Failed
				run.failed(test, { message: 'Failed' });
				complete.add(test);
				break;

			case 'skip': // Skipped
				run.skipped(test);
				complete.add(test);
				break;
		}

		return;
	}

	// Ignore anything that's not an output event
	if (!e.Output) {
		return;
	}

	// On start:    "BenchmarkFooBar"
	// On complete: "BenchmarkFooBar-4    123456    123.4 ns/op    123 B/op    12 allocs/op"

	// Extract the benchmark name and status
	const m = e.Output.match(/^(?<name>Benchmark[/\w]+)(?:-(?<procs>\d+)\s+(?<result>.*))?(?:$|\n)/);
	if (!m) {
		// If the output doesn't start with `BenchmarkFooBar`, ignore it
		return;
	}

	// Find (or create) the (sub)benchmark
	const test = resolveTestName(expl, benchmarks, m.groups.name);
	if (!test) {
		return;
	}

	// If output includes benchmark results, the benchmark passed. If output
	// only includes the benchmark name, the benchmark is running.
	if (m.groups.result) {
		run.passed(test);
		complete.add(test);
		vscode.commands.executeCommand('testing.showMostRecentOutput');
	} else {
		run.started(test);
	}
}

// Pass any incomplete benchmarks (see test_events.md)
function markComplete(items: Record<string, TestItem>, complete: Set<TestItem>, fn: (item: TestItem) => void) {
	function mark(item: TestItem) {
		if (!complete.has(item)) {
			fn(item);
		}
		for (const child of collect(item.children)) {
			mark(child);
		}
	}

	for (const name in items) {
		mark(items[name]);
	}
}

// Process test events (see test_events.md)
function consumeGoTestEvent(
	expl: TestExplorer,
	run: TestRun,
	tests: Record<string, TestItem>,
	record: Map<TestItem, string[]>,
	complete: Set<TestItem>,
	concat: boolean,
	e: GoTestOutput
) {
	const test = resolveTestName(expl, tests, e.Test);
	if (!test) {
		return;
	}

	switch (e.Action) {
		case 'cont':
		case 'pause':
			// ignore
			break;

		case 'run':
			run.started(test);
			break;

		case 'pass':
			// TODO(firelizzard18): add messages on pass, once that capability
			// is added.
			complete.add(test);
			run.passed(test, e.Elapsed * 1000);
			break;

		case 'fail': {
			complete.add(test);
			const messages = parseOutput(test, record.get(test) || []);

			if (!concat) {
				run.failed(test, messages, e.Elapsed * 1000);
				break;
			}

			const merged = new Map<string, TestMessage>();
			for (const { message, location } of messages) {
				const loc = `${location.uri}:${location.range.start.line}`;
				if (merged.has(loc)) {
					merged.get(loc).message += '\n' + message;
				} else {
					merged.set(loc, { message, location });
				}
			}

			run.failed(test, Array.from(merged.values()), e.Elapsed * 1000);
			break;
		}

		case 'skip':
			complete.add(test);
			run.skipped(test);
			break;

		case 'output':
			if (/^(=== RUN|\s*--- (FAIL|PASS): )/.test(e.Output)) {
				break;
			}

			if (record.has(test)) record.get(test).push(e.Output);
			else record.set(test, [e.Output]);
			break;
	}
}

function parseOutput(test: TestItem, output: string[]): TestMessage[] {
	const messages: TestMessage[] = [];

	const uri = Uri.parse(test.id);
	const gotI = output.indexOf('got:\n');
	const wantI = output.indexOf('want:\n');
	if (uri.query === 'example' && gotI >= 0 && wantI >= 0) {
		const got = output.slice(gotI + 1, wantI).join('');
		const want = output.slice(wantI + 1).join('');
		const message = TestMessage.diff('Output does not match', want, got);
		message.location = new Location(test.uri, test.range.start);
		messages.push(message);
		output = output.slice(0, gotI);
	}

	let current: Location;
	const dir = Uri.joinPath(test.uri, '..');
	for (const line of output) {
		const m = line.match(/^\s*(?<file>.*\.go):(?<line>\d+): ?(?<message>.*\n)$/);
		if (m) {
			const file = Uri.joinPath(dir, m.groups.file);
			const ln = Number(m.groups.line) - 1; // VSCode uses 0-based line numbering (internally)
			current = new Location(file, new Position(ln, 0));
			messages.push({ message: m.groups.message, location: current });
		} else if (current) {
			messages.push({ message: line, location: current });
		}
	}

	return messages;
}

function isBuildFailure(output: string[]): boolean {
	const rePkg = /^# (?<pkg>[\w/.-]+)(?: \[(?<test>[\w/.-]+).test\])?/;

	// TODO(firelizzard18): Add more sophisticated check for build failures?
	return output.some((x) => rePkg.test(x));
}

// Execute tests - TestController.runTest callback
async function runTests(expl: TestExplorer, request: TestRunRequest, token: CancellationToken) {
	const collected = new Map<string, CollectedTest[]>();
	const docs = new Set<Uri>();
	if (request.include) {
		for (const item of request.include) {
			await collectTests(expl, item, true, request.exclude || [], collected, docs);
		}
	} else {
		const promises: Promise<unknown>[] = [];
		expl.ctrl.items.forEach((item) => {
			const p = collectTests(expl, item, true, request.exclude || [], collected, docs);
			promises.push(p);
		});
		await Promise.all(promises);
	}

	// Save all documents that contain a test we're about to run, to ensure `go
	// test` has the latest changes
	await Promise.all(
		Array.from(docs).map((uri) => {
			expl.ws.openTextDocument(uri).then((doc) => doc.save());
		})
	);

	let hasBench = false,
		hasNonBench = false;
	for (const items of collected.values()) {
		for (const { item } of items) {
			const uri = Uri.parse(item.id);
			if (uri.query === 'benchmark') hasBench = true;
			else hasNonBench = true;
		}
	}

	const run = expl.ctrl.createTestRun(request);
	const outputChannel = new TestRunOutput(run);
	for (const [dir, items] of collected.entries()) {
		const uri = Uri.parse(dir);
		const isMod = await isModSupported(uri, true);
		const goConfig = getGoConfig(uri);
		const flags = getTestFlags(goConfig);
		const includeBench = getGoConfig(uri).get('testExplorerRunBenchmarks');

		// Separate tests and benchmarks and mark them as queued for execution.
		// Clear any sub tests/benchmarks generated by a previous run.
		const tests: Record<string, TestItem> = {};
		const benchmarks: Record<string, TestItem> = {};
		for (const { item, explicitlyIncluded } of items) {
			const uri = Uri.parse(item.id);
			if (/[/#]/.test(uri.fragment)) {
				// running sub-tests is not currently supported
				vscode.window.showErrorMessage(`Cannot run ${uri.fragment} - running sub-tests is not supported`);
				continue;
			}

			if (uri.query === 'benchmark' && !explicitlyIncluded && !includeBench && !(hasBench && !hasNonBench)) {
				continue;
			}

			item.error = null;
			run.enqueued(item);
			discardChildren(item);

			if (uri.query === 'benchmark') {
				benchmarks[uri.fragment] = item;
			} else {
				tests[uri.fragment] = item;
			}
		}

		const record = new Map<TestItem, string[]>();
		const testFns = Object.keys(tests);
		const benchmarkFns = Object.keys(benchmarks);
		const concat = goConfig.get<boolean>('testExplorerConcatenateMessages');

		// Run tests
		if (testFns.length > 0) {
			const complete = new Set<TestItem>();
			const success = await goTest({
				goConfig,
				flags,
				isMod,
				outputChannel,
				dir: uri.fsPath,
				functions: testFns,
				cancel: token,
				goTestOutputConsumer: (e) => consumeGoTestEvent(expl, run, tests, record, complete, concat, e)
			});
			if (!success) {
				if (isBuildFailure(outputChannel.lines)) {
					markComplete(benchmarks, new Set(), (item) => {
						// TODO change to errored when that is added back
						run.failed(item, { message: 'Compilation failed' });
						item.error = 'Compilation failed';
					});
				} else {
					markComplete(benchmarks, complete, (x) => run.skipped(x));
				}
			}
		}

		// Run benchmarks
		if (benchmarkFns.length > 0) {
			const complete = new Set<TestItem>();
			const success = await goTest({
				goConfig,
				flags,
				isMod,
				outputChannel,
				dir: uri.fsPath,
				functions: benchmarkFns,
				isBenchmark: true,
				cancel: token,
				goTestOutputConsumer: (e) => consumeGoBenchmarkEvent(expl, run, benchmarks, complete, e)
			});

			// Explicitly complete any incomplete benchmarks (see test_events.md)
			if (success) {
				markComplete(benchmarks, complete, (x) => run.passed(x));
			} else if (isBuildFailure(outputChannel.lines)) {
				markComplete(benchmarks, new Set(), (item) => {
					// TODO change to errored when that is added back
					run.failed(item, { message: 'Compilation failed' });
					item.error = 'Compilation failed';
				});
			} else {
				markComplete(benchmarks, complete, (x) => run.skipped(x));
			}
		}
	}

	run.end();
}
