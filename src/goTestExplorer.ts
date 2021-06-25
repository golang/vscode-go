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
	TestRun,
	TestMessageSeverity,
	Location,
	Position
} from 'vscode';
import path = require('path');
import { getModFolderPath, isModSupported } from './goModules';
import { getCurrentGoPath } from './util';
import { GoDocumentSymbolProvider } from './goOutline';
import { getGoConfig } from './config';
import { getTestFlags, goTest, GoTestOutput } from './testUtils';

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
				if (item.id === id) {
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
				if (uri.query === 'package') {
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

	return ctrl.createTestItem(id, label, parent, uri.with({ query: '', fragment: '' }));
}

function createSubItem(ctrl: TestController, item: TestItem, name: string): TestItem {
	let uri = Uri.parse(item.id);
	uri = uri.with({ fragment: `${uri.fragment}/${name}` });
	const existing = item.children.get(uri.toString());
	if (existing) {
		return existing;
	}

	item.canResolveChildren = true;
	const sub = ctrl.createTestItem(uri.toString(), name, item, item.uri);
	sub.runnable = false;
	sub.range = item.range;
	return sub;
}

function removeIfEmpty(item: TestItem) {
	// Don't dispose of the root
	if (!item.parent) {
		return;
	}

	// Don't dispose of empty modules
	const uri = Uri.parse(item.id);
	if (uri.query === 'module') {
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

		if (uri.path === modUri.path) {
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

async function walkWorkspaces(uri: Uri) {
	const found = new Map<string, boolean>();
	await walk(uri, async (dir, file, type) => {
		if (type !== FileType.File) {
			return;
		}

		if (file === 'go.mod') {
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
	if (uri.query === 'module' || uri.query === 'workspace') {
		// Create entries for all packages in the module or workspace
		await walkPackages(uri, async (uri) => {
			await getPackage(ctrl, uri);
		});
	}

	if (uri.query === 'module' || uri.query === 'package') {
		// Create entries for all test files in the package
		for (const [file, type] of await workspace.fs.readDirectory(uri)) {
			if (type !== FileType.File || !file.endsWith('_test.go')) {
				continue;
			}

			await getFile(ctrl, Uri.joinPath(uri, file));
		}
	}

	if (uri.query === 'file') {
		// Create entries for all test functions in a file
		const doc = await workspace.openTextDocument(uri.with({ query: '', fragment: '' }));
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

class TestRunOutput<T> implements OutputChannel {
	readonly name: string;
	constructor(private run: TestRun<T>) {
		this.name = `Test run at ${new Date()}`;
	}

	append(value: string) {
		this.run.appendOutput(value);
	}

	appendLine(value: string) {
		this.run.appendOutput(value + '\r\n');
	}

	clear() {}
	show(...args: any[]) {}
	hide() {}
	dispose() {}
}

function resolveTestName(ctrl: TestController, tests: Record<string, TestItem>, name: string): TestItem | undefined {
	if (!name) {
		return;
	}

	const parts = name.split(/[#\/]+/);
	let test = tests[parts[0]];
	if (!test) {
		return;
	}

	for (const part of parts.slice(1)) {
		test = createSubItem(ctrl, test, part);
	}
	return test;
}

function consumeGoBenchmarkEvent<T>(
	ctrl: TestController,
	run: TestRun<T>,
	benchmarks: Record<string, TestItem>,
	complete: Set<TestItem>,
	e: GoTestOutput
) {
	if (e.Test) {
		const test = resolveTestName(ctrl, benchmarks, e.Test);
		if (!test) {
			return;
		}

		switch (e.Action) {
			case 'fail':
				run.setState(test, TestResultState.Failed);
				complete.add(test);
				break;

			case 'skip':
				run.setState(test, TestResultState.Skipped);
				complete.add(test);
				break;
		}

		return;
	}

	if (!e.Output) {
		return;
	}

	// Started: "BenchmarkFooBar"
	// Completed: "BenchmarkFooBar-4    123456    123.4 ns/op    123 B/op    12 allocs/op"
	const m = e.Output.match(/^(?<name>Benchmark[\/\w]+)(?:-(?<procs>\d+)\s+(?<result>.*))?(?:$|\n)/);
	if (!m) {
		return;
	}

	const test = resolveTestName(ctrl, benchmarks, m.groups.name);
	if (!test) {
		return;
	}

	if (m.groups.result) {
		run.appendMessage(test, {
			message: m.groups.result,
			severity: TestMessageSeverity.Information,
			location: new Location(test.uri, test.range.start)
		});
		run.setState(test, TestResultState.Passed);
		complete.add(test);
	} else {
		run.setState(test, TestResultState.Running);
	}
}

function passBenchmarks<T>(run: TestRun<T>, items: Record<string, TestItem>, complete: Set<TestItem>) {
	function pass(item: TestItem) {
		if (!complete.has(item)) {
			run.setState(item, TestResultState.Passed);
		}
		for (const child of item.children.values()) {
			pass(child);
		}
	}

	for (const name in items) {
		pass(items[name]);
	}
}

function consumeGoTestEvent<T>(
	ctrl: TestController,
	run: TestRun<T>,
	tests: Record<string, TestItem>,
	record: Map<TestItem, string[]>,
	e: GoTestOutput
) {
	const test = resolveTestName(ctrl, tests, e.Test);
	if (!test) {
		return;
	}

	switch (e.Action) {
		case 'run':
			run.setState(test, TestResultState.Running);
			return;

		case 'pass':
			run.setState(test, TestResultState.Passed, e.Elapsed * 1000);
			return;

		case 'fail':
			run.setState(test, TestResultState.Failed, e.Elapsed * 1000);
			return;

		case 'skip':
			run.setState(test, TestResultState.Skipped);
			return;

		case 'output':
			if (/^(=== RUN|\s*--- (FAIL|PASS): )/.test(e.Output)) {
				return;
			}

			if (record.has(test)) record.get(test).push(e.Output);
			else record.set(test, [e.Output]);
			return;

		default:
			console.log(e);
			return;
	}
}

function processRecordedOutput<T>(run: TestRun<T>, test: TestItem, output: string[]) {
	// mostly copy and pasted from https://gitlab.com/firelizzard/vscode-go-test-adapter/-/blob/733443d229df68c90145a5ae7ed78ca64dec6f43/src/tests.ts
	type message = { all: string; error?: string };
	const parsed = new Map<string, message>();
	let current: message | undefined;

	for (const item of output) {
		const fileAndLine = item.match(/^\s*(?<file>.*\.go):(?<line>\d+): ?(?<message>.*\n)$/);
		if (fileAndLine) {
			current = { all: fileAndLine.groups.message };
			parsed.set(`${fileAndLine.groups.file}:${fileAndLine.groups.line}`, current);
			continue;
		}

		if (!current) continue;

		const entry = item.match(/^\s*(?:(?<name>[^:]+): *| +)\t(?<message>.*\n)$/);
		if (!entry) continue;

		current.all += entry.groups.message;
		if (entry.groups.name == 'Error') {
			current.error = entry.groups.message;
		} else if (!entry.groups.name && current.error) current.error += entry.groups.message;
	}

	const dir = Uri.joinPath(test.uri, '..');
	for (const [location, { all, error }] of parsed.entries()) {
		const hover = (error || all).trim();
		const message = hover.split('\n')[0].replace(/:\s+$/, '');

		const i = location.lastIndexOf(':');
		const file = location.substring(0, i);
		const line = Number(location.substring(i + 1)) - 1;

		run.appendMessage(test, {
			message,
			severity: error ? TestMessageSeverity.Error : TestMessageSeverity.Information,
			location: new Location(Uri.joinPath(dir, file), new Position(line, 0))
		});
	}
}

async function runTest<T>(ctrl: TestController, request: TestRunRequest<T>) {
	const collected = new Map<string, TestItem[]>();
	const docs = new Set<Uri>();
	for (const item of request.tests) {
		await collectTests(ctrl, item, request.exclude, collected, docs);
	}

	// Ensure `go test` has the latest changes
	await Promise.all(
		Array.from(docs).map((uri) => {
			workspace.openTextDocument(uri).then((doc) => doc.save());
		})
	);

	const run = ctrl.createTestRun(request);
	const outputChannel = new TestRunOutput(run);
	const goConfig = getGoConfig();
	for (const [dir, items] of collected.entries()) {
		const uri = Uri.parse(dir);
		const isMod = await isModSupported(uri, true);
		const flags = getTestFlags(goConfig);

		const tests: Record<string, TestItem> = {};
		const benchmarks: Record<string, TestItem> = {};
		for (const item of items) {
			run.setState(item, TestResultState.Queued);

			// Remove any subtests
			item.canResolveChildren = false;
			Array.from(item.children.values()).forEach((x) => x.dispose());

			const uri = Uri.parse(item.id);
			if (uri.query === 'benchmark') {
				benchmarks[uri.fragment] = item;
			} else {
				tests[uri.fragment] = item;
			}
		}

		const record = new Map<TestItem, string[]>();
		const testFns = Object.keys(tests);
		const benchmarkFns = Object.keys(benchmarks);

		if (testFns.length) {
			await goTest({
				goConfig,
				flags,
				isMod,
				outputChannel,
				dir: uri.fsPath,
				functions: testFns,
				goTestOutputConsumer: (e) => consumeGoTestEvent(ctrl, run, tests, record, e)
			});
		}

		if (benchmarkFns.length) {
			const complete = new Set<TestItem>();
			await goTest({
				goConfig,
				flags,
				isMod,
				outputChannel,
				dir: uri.fsPath,
				functions: benchmarkFns,
				isBenchmark: true,
				goTestOutputConsumer: (e) => consumeGoBenchmarkEvent(ctrl, run, benchmarks, complete, e)
			});

			passBenchmarks(run, benchmarks, complete);
		}

		for (const [test, output] of record.entries()) {
			processRecordedOutput(run, test, output);
		}
	}

	run.end();
}
