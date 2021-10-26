/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import {
	CancellationToken,
	DebugSession,
	Location,
	OutputChannel,
	Position,
	TestController,
	TestItem,
	TestMessage,
	TestRun,
	TestRunProfileKind,
	TestRunRequest,
	Uri,
	WorkspaceConfiguration
} from 'vscode';
import vscode = require('vscode');
import { outputChannel } from '../goStatus';
import { isModSupported } from '../goModules';
import { getGoConfig } from '../config';
import { getBenchmarkFunctions, getTestFlags, getTestFunctions, goTest, GoTestOutput } from '../testUtils';
import { GoTestResolver } from './resolve';
import { dispose, forEachAsync, GoTest, Workspace } from './utils';
import { GoTestProfiler, ProfilingOptions } from './profile';
import { debugTestAtCursor } from '../goTest';

let debugSessionID = 0;

type CollectedTest = { item: TestItem; explicitlyIncluded?: boolean };

interface RunConfig {
	goConfig: WorkspaceConfiguration;
	flags: string[];
	isMod: boolean;
	isBenchmark?: boolean;
	cancel: CancellationToken;

	run: TestRun;
	options: ProfilingOptions;
	pkg: TestItem;
	concat: boolean;
	record: Map<TestItem, string[]>;
	functions: Record<string, TestItem>;
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

export class GoTestRunner {
	constructor(
		private readonly workspace: Workspace,
		private readonly ctrl: TestController,
		private readonly resolver: GoTestResolver,
		private readonly profiler: GoTestProfiler
	) {
		ctrl.createRunProfile(
			'Go',
			TestRunProfileKind.Run,
			async (request, token) => {
				try {
					await this.run(request, token);
				} catch (error) {
					const m = 'Failed to execute tests';
					outputChannel.appendLine(`${m}: ${error}`);
					await vscode.window.showErrorMessage(m);
				}
			},
			true
		);

		ctrl.createRunProfile(
			'Go (Debug)',
			TestRunProfileKind.Debug,
			async (request, token) => {
				try {
					await this.debug(request, token);
				} catch (error) {
					const m = 'Failed to debug tests';
					outputChannel.appendLine(`${m}: ${error}`);
					await vscode.window.showErrorMessage(m);
				}
			},
			true
		);

		const pprof = ctrl.createRunProfile(
			'Go (Profile)',
			TestRunProfileKind.Run,
			async (request, token) => {
				try {
					await this.run(request, token, this.profiler.options);
				} catch (error) {
					const m = 'Failed to execute tests';
					outputChannel.appendLine(`${m}: ${error}`);
					await vscode.window.showErrorMessage(m);
				}
			},
			false
		);

		pprof.configureHandler = async () => {
			const state = await this.profiler.configure();
			if (!state) return;
			this.profiler.options = state;
		};
	}

	async debug(request: TestRunRequest, token?: CancellationToken) {
		if (!request.include) {
			await vscode.window.showErrorMessage('The Go test explorer does not support debugging multiple tests');
			return;
		}

		const collected = new Map<TestItem, CollectedTest[]>();
		const files = new Set<TestItem>();
		for (const item of request.include) {
			await this.collectTests(item, true, request.exclude || [], collected, files);
		}

		const tests = Array.from(collected.values()).reduce((a, b) => a.concat(b), []);
		if (tests.length > 1) {
			await vscode.window.showErrorMessage('The Go test explorer does not support debugging multiple tests');
			return;
		}

		const test = tests[0].item;
		const { kind, name } = GoTest.parseId(test.id);
		const doc = await vscode.workspace.openTextDocument(test.uri);
		await doc.save();

		const goConfig = getGoConfig(test.uri);
		const getFunctions = kind === 'benchmark' ? getBenchmarkFunctions : getTestFunctions;
		const testFunctions = await getFunctions(doc, token);

		// TODO Can we get output from the debug session, in order to check for
		// run/pass/fail events?

		const id = `debug #${debugSessionID++} ${name}`;
		const subs: vscode.Disposable[] = [];
		const sessionPromise = new Promise<DebugSession>((resolve) => {
			subs.push(
				vscode.debug.onDidStartDebugSession((s) => {
					if (s.configuration.sessionID === id) {
						resolve(s);
						subs.forEach((s) => s.dispose());
					}
				})
			);

			if (token) {
				subs.push(
					token.onCancellationRequested(() => {
						resolve(null);
						subs.forEach((s) => s.dispose());
					})
				);
			}
		});

		const run = this.ctrl.createTestRun(request, `Debug ${name}`);
		const started = await debugTestAtCursor(doc, name, testFunctions, goConfig, id);
		if (!started) {
			subs.forEach((s) => s.dispose());
			run.end();
			return;
		}

		const session = await sessionPromise;
		if (!session) {
			run.end();
			return;
		}

		token.onCancellationRequested(() => vscode.debug.stopDebugging(session));

		await new Promise<void>((resolve) => {
			const sub = vscode.debug.onDidTerminateDebugSession(didTerminateSession);

			token?.onCancellationRequested(() => {
				resolve();
				sub.dispose();
			});

			function didTerminateSession(s: DebugSession) {
				if (s.id !== session.id) return;
				resolve();
				sub.dispose();
			}
		});
		run.end();
	}

	// Execute tests - TestController.runTest callback
	async run(request: TestRunRequest, token?: CancellationToken, options: ProfilingOptions = {}): Promise<boolean> {
		const collected = new Map<TestItem, CollectedTest[]>();
		const files = new Set<TestItem>();
		if (request.include) {
			for (const item of request.include) {
				await this.collectTests(item, true, request.exclude || [], collected, files);
			}
		} else {
			const promises: Promise<unknown>[] = [];
			this.ctrl.items.forEach((item) => {
				const p = this.collectTests(item, true, request.exclude || [], collected, files);
				promises.push(p);
			});
			await Promise.all(promises);
		}

		// Save all documents that contain a test we're about to run, to ensure `go
		// test` has the latest changes
		const fileUris = new Set(Array.from(files).map((x) => x.uri));
		await Promise.all(this.workspace.textDocuments.filter((x) => fileUris.has(x.uri)).map((x) => x.save()));

		let hasBench = false,
			hasNonBench = false;
		for (const items of collected.values()) {
			for (const { item } of items) {
				const { kind } = GoTest.parseId(item.id);
				if (kind === 'benchmark') hasBench = true;
				else hasNonBench = true;
			}
		}

		function isInMod(item: TestItem): boolean {
			const { kind } = GoTest.parseId(item.id);
			if (kind === 'module') return true;
			if (!item.parent) return false;
			return isInMod(item.parent);
		}

		const run = this.ctrl.createTestRun(request);
		const windowGoConfig = getGoConfig();
		if (windowGoConfig.get<boolean>('testExplorer.showOutput')) {
			await vscode.commands.executeCommand('testing.showMostRecentOutput');
		}

		let success = true;
		const subItems: string[] = [];
		for (const [pkg, items] of collected.entries()) {
			const isMod = isInMod(pkg) || (await isModSupported(pkg.uri, true));
			const goConfig = getGoConfig(pkg.uri);
			const flags = getTestFlags(goConfig);
			const includeBench = getGoConfig(pkg.uri).get('testExplorer.alwaysRunBenchmarks');

			// If any of the tests are test suite methods, add all test functions that call `suite.Run`
			const hasTestMethod = items.some(({ item }) => this.resolver.isTestMethod.has(item));
			if (hasTestMethod) {
				const add: TestItem[] = [];
				pkg.children.forEach((file) => {
					file.children.forEach((test) => {
						if (!this.resolver.isTestSuiteFunc.has(test)) return;
						if (items.some(({ item }) => item === test)) return;
						add.push(test);
					});
				});
				items.push(...add.map((item) => ({ item })));
			}

			// Separate tests and benchmarks and mark them as queued for execution.
			// Clear any sub tests/benchmarks generated by a previous run.
			const tests: Record<string, TestItem> = {};
			const benchmarks: Record<string, TestItem> = {};
			for (const { item, explicitlyIncluded } of items) {
				const { kind, name } = GoTest.parseId(item.id);
				if (/[/#]/.test(name)) subItems.push(name);

				// When the user clicks the run button on a package, they expect all
				// of the tests within that package to run - they probably don't
				// want to run the benchmarks. So if a benchmark is not explicitly
				// selected, don't run benchmarks. But the user may disagree, so
				// behavior can be changed with `go.testExplorerRunBenchmarks`.
				// However, if the user clicks the run button on a file or package
				// that contains benchmarks and nothing else, they likely expect
				// those benchmarks to run.
				if (kind === 'benchmark' && !explicitlyIncluded && !includeBench && !(hasBench && !hasNonBench)) {
					continue;
				}

				item.error = null;
				run.enqueued(item);

				// Remove subtests created dynamically from test output
				item.children.forEach((child) => {
					if (this.resolver.isDynamicSubtest.has(child)) {
						dispose(this.resolver, child);
					}
				});

				if (kind === 'benchmark') {
					benchmarks[name] = item;
				} else {
					tests[name] = item;
				}
			}

			const record = new Map<TestItem, string[]>();
			const concat = goConfig.get<boolean>('testExplorer.concatenateMessages');

			// https://github.com/golang/go/issues/39904
			if (subItems.length > 0 && Object.keys(tests).length + Object.keys(benchmarks).length > 1) {
				outputChannel.appendLine(
					`The following tests in ${pkg.uri} failed to run, as go test will only run a sub-test or sub-benchmark if it is by itself:`
				);
				Object.keys(tests)
					.concat(Object.keys(benchmarks))
					.forEach((x) => outputChannel.appendLine(x));
				outputChannel.show();
				vscode.window.showErrorMessage(
					`Cannot run the selected tests in package ${pkg.label} - see the Go output panel for details`
				);
				continue;
			}

			const config = {
				flags,
				isMod,
				goConfig,
				cancel: token,

				run,
				options,
				pkg,
				record,
				concat
			};

			// Run tests
			if (!options.kind) {
				const r = await this.runGoTest({ ...config, functions: tests });
				if (!r) success = false;
			} else {
				for (const name in tests) {
					const r = await this.runGoTest({ ...config, functions: { [name]: tests[name] } });
					if (!r) success = false;
				}
			}

			// Run benchmarks
			if (!options.kind) {
				const r = await this.runGoTest({ ...config, isBenchmark: true, functions: benchmarks });
				if (!r) success = false;
			} else {
				for (const name in benchmarks) {
					const r = await this.runGoTest({
						...config,
						isBenchmark: true,
						functions: { [name]: benchmarks[name] }
					});
					if (!r) success = false;
				}
			}

			if (token?.isCancellationRequested) {
				break;
			}
		}

		run.end();

		this.profiler.postRun();

		return success;
	}

	// Recursively find all tests, benchmarks, and examples within a
	// module/package/etc, minus exclusions. Map tests to the package they are
	// defined in, and track files.
	async collectTests(
		item: TestItem,
		explicitlyIncluded: boolean,
		excluded: TestItem[],
		functions: Map<TestItem, CollectedTest[]>,
		files: Set<TestItem>
	) {
		for (let i = item; i.parent; i = i.parent) {
			if (excluded.indexOf(i) >= 0) {
				return;
			}
		}

		const { name } = GoTest.parseId(item.id);
		if (!name) {
			if (item.children.size === 0) {
				await this.resolver.resolve(item);
			}

			await forEachAsync(item.children, (child) => {
				return this.collectTests(child, false, excluded, functions, files);
			});
			return;
		}

		function getFile(item: TestItem): TestItem {
			const { kind } = GoTest.parseId(item.id);
			if (kind === 'file') return item;
			return getFile(item.parent);
		}

		const file = getFile(item);
		files.add(file);

		const pkg = file.parent;
		if (functions.has(pkg)) {
			functions.get(pkg).push({ item, explicitlyIncluded });
		} else {
			functions.set(pkg, [{ item, explicitlyIncluded }]);
		}
		return;
	}

	private async runGoTest(config: RunConfig): Promise<boolean> {
		const { run, options, pkg, functions, record, concat, ...rest } = config;
		if (Object.keys(functions).length === 0) return true;

		if (options.kind) {
			if (Object.keys(functions).length > 1) {
				throw new Error('Profiling more than one test at once is unsupported');
			}
			rest.flags.push(...this.profiler.preRun(options, Object.values(functions)[0]));
		}

		const complete = new Set<TestItem>();
		const outputChannel = new TestRunOutput(run);

		const success = await goTest({
			...rest,
			outputChannel,
			dir: pkg.uri.fsPath,
			functions: Object.keys(functions),
			goTestOutputConsumer: rest.isBenchmark
				? (e) => this.consumeGoBenchmarkEvent(run, functions, complete, e)
				: (e) => this.consumeGoTestEvent(run, functions, record, complete, concat, e)
		});
		if (success) {
			if (rest.isBenchmark) {
				this.markComplete(functions, complete, (x) => run.passed(x));
			}
			return true;
		}

		if (this.isBuildFailure(outputChannel.lines)) {
			this.markComplete(functions, new Set(), (item) => {
				run.errored(item, { message: 'Compilation failed' });
				item.error = 'Compilation failed';
			});
		} else {
			this.markComplete(functions, complete, (x) => run.skipped(x));
		}
		return false;
	}

	// Resolve a test name to a test item. If the test name is TestXxx/Foo, Foo is
	// created as a child of TestXxx. The same is true for TestXxx#Foo and
	// TestXxx/#Foo.
	resolveTestName(tests: Record<string, TestItem>, name: string): TestItem | undefined {
		if (!name) {
			return;
		}

		const re = /[#/]+/;

		const resolve = (parent?: TestItem, start = 0, length = 0): TestItem | undefined => {
			const pos = start + length;
			const m = name.substring(pos).match(re);
			if (!m) {
				if (!parent) return tests[name];
				return this.resolver.getOrCreateSubTest(parent, name.substring(pos), name, true);
			}

			const subName = name.substring(0, pos + m.index);
			const test = parent
				? this.resolver.getOrCreateSubTest(parent, name.substring(pos, pos + m.index), subName, true)
				: tests[subName];
			return resolve(test, pos + m.index, m[0].length);
		};

		return resolve();
	}

	// Process benchmark events (see test_events.md)
	consumeGoBenchmarkEvent(
		run: TestRun,
		benchmarks: Record<string, TestItem>,
		complete: Set<TestItem>,
		e: GoTestOutput
	) {
		if (e.Test) {
			// Find (or create) the (sub)benchmark
			const test = this.resolveTestName(benchmarks, e.Test);
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
		const test = this.resolveTestName(benchmarks, m.groups.name);
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
	markComplete(items: Record<string, TestItem>, complete: Set<TestItem>, fn: (item: TestItem) => void) {
		function mark(item: TestItem) {
			if (!complete.has(item)) {
				fn(item);
			}
			item.children.forEach((child) => mark(child));
		}

		for (const name in items) {
			mark(items[name]);
		}
	}

	// Process test events (see test_events.md)
	consumeGoTestEvent(
		run: TestRun,
		tests: Record<string, TestItem>,
		record: Map<TestItem, string[]>,
		complete: Set<TestItem>,
		concat: boolean,
		e: GoTestOutput
	) {
		const test = this.resolveTestName(tests, e.Test);
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
				const messages = this.parseOutput(test, record.get(test) || []);

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

	parseOutput(test: TestItem, output: string[]): TestMessage[] {
		const messages: TestMessage[] = [];

		const { kind } = GoTest.parseId(test.id);
		const gotI = output.indexOf('got:\n');
		const wantI = output.indexOf('want:\n');
		if (kind === 'example' && gotI >= 0 && wantI >= 0) {
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

	isBuildFailure(output: string[]): boolean {
		const rePkg = /^# (?<pkg>[\w/.-]+)(?: \[(?<test>[\w/.-]+).test\])?/;

		// TODO(firelizzard18): Add more sophisticated check for build failures?
		return output.some((x) => rePkg.test(x));
	}
}
