/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-useless-escape */
/* eslint-disable no-async-promise-executor */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import cp = require('child_process');
import path = require('path');
import util = require('util');
import vscode = require('vscode');

import { applyCodeCoverageToAllEditors } from './goCover';
import { toolExecutionEnvironment } from './goEnv';
import { getCurrentPackage } from './goModules';
import { GoDocumentSymbolProvider } from './goOutline';
import { getNonVendorPackages } from './goPackages';
import { getBinPath, getCurrentGoPath, getTempFilePath, LineBuffer, resolvePath } from './util';
import { parseEnvFile } from './utils/envUtils';
import { envPath, expandFilePathInOutput, getCurrentGoRoot, getCurrentGoWorkspaceFromGOPATH } from './utils/pathUtils';
import { killProcessTree } from './utils/processUtils';

const testOutputChannel = vscode.window.createOutputChannel('Go Tests');
const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
statusBarItem.command = 'go.test.cancel';
statusBarItem.text = '$(x) Cancel Running Tests';

/**
 *  testProcesses holds a list of currently running test processes.
 */
const runningTestProcesses: cp.ChildProcess[] = [];

// https://github.com/golang/go/blob/117b1c84d3678a586c168a5f7f2f0a750c27f0c2/src/cmd/go/internal/load/test.go#L487
// uses !unicode.isLower to find test/example/benchmark functions.
// There could be slight difference between \P{Ll} (not lowercase letter)
// & go unicode package's uppercase detection. But hopefully
// these will be replaced by gopls's codelens computation soon.
const testFuncRegex = /^Test\P{Ll}.*|^Example\P{Ll}.*/u;
const testMethodRegex = /^\(([^)]+)\)\.(Test\P{Ll}.*)$/u;
const benchmarkRegex = /^Benchmark\P{Ll}.*/u;

const checkPkg = '"gopkg.in/check.v1"';
const testifyPkg = '"github.com/stretchr/testify/suite"';

/**
 * Input to goTest.
 */
export interface TestConfig {
	/**
	 * The working directory for `go test`.
	 */
	dir: string;
	/**
	 * Configuration for the Go extension
	 */
	goConfig: vscode.WorkspaceConfiguration;
	/**
	 * Test flags to override the testFlags and buildFlags from goConfig.
	 */
	flags: string[];
	/**
	 * Specific function names to test.
	 */
	functions?: string[];
	/**
	 * Test was not requested explicitly. The output should not appear in the UI.
	 */
	background?: boolean;
	/**
	 * Run all tests from all sub directories under `dir`
	 */
	includeSubDirectories?: boolean;
	/**
	 * Whether this is a benchmark.
	 */
	isBenchmark?: boolean;
	/**
	 * Whether the tests are being run in a project that uses Go modules
	 */
	isMod?: boolean;
	/**
	 * Whether code coverage should be generated and applied.
	 */
	applyCodeCoverage?: boolean;
	/**
	 * Output channel for test output.
	 */
	outputChannel?: vscode.OutputChannel;
}

export function getTestEnvVars(config: vscode.WorkspaceConfiguration): any {
	const envVars = toolExecutionEnvironment();
	const testEnvConfig = config['testEnvVars'] || {};

	let fileEnv: { [key: string]: any } = {};
	let testEnvFile = config['testEnvFile'];
	if (testEnvFile) {
		testEnvFile = resolvePath(testEnvFile);
		try {
			fileEnv = parseEnvFile(testEnvFile);
		} catch (e) {
			console.log(e);
		}
	}

	Object.keys(fileEnv).forEach(
		(key) => (envVars[key] = typeof fileEnv[key] === 'string' ? resolvePath(fileEnv[key]) : fileEnv[key])
	);
	Object.keys(testEnvConfig).forEach(
		(key) =>
			(envVars[key] =
				typeof testEnvConfig[key] === 'string' ? resolvePath(testEnvConfig[key]) : testEnvConfig[key])
	);

	return envVars;
}

export function getTestFlags(goConfig: vscode.WorkspaceConfiguration, args?: any): string[] {
	let testFlags: string[] = goConfig['testFlags'] || goConfig['buildFlags'] || [];
	testFlags = testFlags.map((x) => resolvePath(x)); // Use copy of the flags, dont pass the actual object from config
	return args && args.hasOwnProperty('flags') && Array.isArray(args['flags']) ? args['flags'] : testFlags;
}

export function getTestTags(goConfig: vscode.WorkspaceConfiguration): string {
	return goConfig['testTags'] !== null ? goConfig['testTags'] : goConfig['buildTags'];
}

/**
 * Returns all Go unit test functions in the given source file.
 *
 * @param the URI of a Go source file.
 * @return test function symbols for the source file.
 */
export async function getTestFunctions(
	doc: vscode.TextDocument,
	token: vscode.CancellationToken
): Promise<vscode.DocumentSymbol[] | undefined> {
	const documentSymbolProvider = new GoDocumentSymbolProvider(true);
	const symbols = await documentSymbolProvider.provideDocumentSymbols(doc, token);
	if (!symbols || symbols.length === 0) {
		return;
	}
	const symbol = symbols[0];
	if (!symbol) {
		return;
	}
	const children = symbol.children;

	// include test functions and methods from 3rd party testing packages
	let containsExternalPackages = false;
	const allExternalPackages = [checkPkg, testifyPkg];
	allExternalPackages.forEach((pkg) => {
		const ext = children.some((sym) => sym.kind === vscode.SymbolKind.Namespace && sym.name === pkg);
		if (ext) {
			containsExternalPackages = ext;
		}
	});
	return children.filter(
		(sym) =>
			sym.kind === vscode.SymbolKind.Function &&
			(testFuncRegex.test(sym.name) || (containsExternalPackages && testMethodRegex.test(sym.name)))
	);
}

/**
 * Extracts test method name of a suite test function.
 * For example a symbol with name "(*testSuite).TestMethod" will return "TestMethod".
 *
 * @param symbolName Symbol Name to extract method name from.
 */
export function extractInstanceTestName(symbolName: string): string {
	const match = symbolName.match(testMethodRegex);
	if (!match || match.length !== 3) {
		return null;
	}
	return match[2];
}

/**
 * Gets the appropriate debug arguments for a debug session on a test function.
 * @param document  The document containing the tests
 * @param testFunctionName The test function to get the debug args
 * @param testFunctions The test functions found in the document
 */
export function getTestFunctionDebugArgs(
	document: vscode.TextDocument,
	testFunctionName: string,
	testFunctions: vscode.DocumentSymbol[]
): string[] {
	if (benchmarkRegex.test(testFunctionName)) {
		return ['-test.bench', '^' + testFunctionName + '$', '-test.run', 'a^'];
	}
	const instanceMethod = extractInstanceTestName(testFunctionName);
	if (instanceMethod) {
		if (containsThirdPartyTestPackages(document, null, [checkPkg])) {
			return ['-check.f', `^${instanceMethod}$`];
		}

		const testFns = findAllTestSuiteRuns(document, testFunctions);
		const testSuiteRuns = ['-test.run', `^${testFns.map((t) => t.name).join('|')}$`];
		return [...testSuiteRuns, ...testSuiteTests];
	} else {
		return ['-test.run', `^${testFunctionName}$`];
	}
}
/**
 * Finds test methods containing "suite.Run()" call.
 *
 * @param doc Editor document
 * @param allTests All test functions
 */
export function findAllTestSuiteRuns(
	doc: vscode.TextDocument,
	allTests: vscode.DocumentSymbol[]
): vscode.DocumentSymbol[] {
	// get non-instance test functions
	const testFunctions = allTests.filter((t) => !testMethodRegex.test(t.name));
	// filter further to ones containing suite.Run()
	return testFunctions.filter((t) => doc.getText(t.range).includes('suite.Run('));
}

/**
 * Returns all Benchmark functions in the given source file.
 *
 * @param the URI of a Go source file.
 * @return benchmark function symbols for the source file.
 */
export async function getBenchmarkFunctions(
	doc: vscode.TextDocument,
	token: vscode.CancellationToken
): Promise<vscode.DocumentSymbol[] | undefined> {
	const documentSymbolProvider = new GoDocumentSymbolProvider();
	const symbols = await documentSymbolProvider.provideDocumentSymbols(doc, token);
	if (!symbols || symbols.length === 0) {
		return;
	}
	const symbol = symbols[0];
	if (!symbol) {
		return;
	}
	const children = symbol.children;
	return children.filter((sym) => sym.kind === vscode.SymbolKind.Function && benchmarkRegex.test(sym.name));
}

/**
 * go test -json output format.
 * which is a subset of https://golang.org/cmd/test2json/#hdr-Output_Format
 * and includes only the fields that we are using.
 */
interface GoTestOutput {
	Action: string;
	Output?: string;
	Package?: string;
}

/**
 * Runs go test and presents the output in the 'Go' channel.
 *
 * @param goConfig Configuration for the Go extension.
 */
export async function goTest(testconfig: TestConfig): Promise<boolean> {
	let outputChannel = testOutputChannel;
	if (testconfig.outputChannel) {
		outputChannel = testconfig.outputChannel;
	}

	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		vscode.window.showErrorMessage(
			`Failed to run "go test" as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath})`
		);
		return Promise.resolve(false);
	}

	// We do not want to clear it if tests are already running, as that could
	// lose valuable output.
	if (runningTestProcesses.length < 1) {
		outputChannel.clear();
	}

	if (testconfig.goConfig['disableConcurrentTests']) {
		await cancelRunningTests();
	}

	if (!testconfig.background) {
		outputChannel.show(true);
	}

	const testType: string = testconfig.isBenchmark ? 'Benchmarks' : 'Tests';

	// compute test target package
	const { targets, pkgMap, currentGoWorkspace } = await getTestTargetPackages(testconfig, outputChannel);

	// generate full test args.
	const { args, outArgs, tmpCoverPath, addJSONFlag } = computeTestCommand(testconfig, targets);

	outputChannel.appendLine(['Running tool:', goRuntimePath, ...outArgs].join(' '));
	outputChannel.appendLine('');

	let testResult = false;
	try {
		testResult = await new Promise<boolean>(async (resolve, reject) => {
			const testEnvVars = getTestEnvVars(testconfig.goConfig);
			const tp = cp.spawn(goRuntimePath, args, { env: testEnvVars, cwd: testconfig.dir });
			const outBuf = new LineBuffer();
			const errBuf = new LineBuffer();

			const testResultLines: string[] = [];
			const processTestResultLine = addJSONFlag
				? processTestResultLineInJSONMode(pkgMap, currentGoWorkspace, outputChannel)
				: processTestResultLineInStandardMode(pkgMap, currentGoWorkspace, testResultLines, outputChannel);

			outBuf.onLine((line) => processTestResultLine(line));
			outBuf.onDone((last) => {
				if (last) {
					processTestResultLine(last);
				}

				// If there are any remaining test result lines, emit them to the output channel.
				if (testResultLines.length > 0) {
					testResultLines.forEach((line) => outputChannel.appendLine(line));
				}
			});

			// go test emits build errors on stderr, which contain paths relative to the cwd
			errBuf.onLine((line) => outputChannel.appendLine(expandFilePathInOutput(line, testconfig.dir)));
			errBuf.onDone((last) => last && outputChannel.appendLine(expandFilePathInOutput(last, testconfig.dir)));

			tp.stdout.on('data', (chunk) => outBuf.append(chunk.toString()));
			tp.stderr.on('data', (chunk) => errBuf.append(chunk.toString()));

			statusBarItem.show();

			tp.on('close', (code, signal) => {
				outBuf.done();
				errBuf.done();

				const index = runningTestProcesses.indexOf(tp, 0);
				if (index > -1) {
					runningTestProcesses.splice(index, 1);
				}

				if (!runningTestProcesses.length) {
					statusBarItem.hide();
				}

				resolve(code === 0);
			});

			runningTestProcesses.push(tp);
		});
	} catch (err) {
		outputChannel.appendLine(`Error: ${testType} failed.`);
		outputChannel.appendLine(err);
	}
	if (tmpCoverPath) {
		await applyCodeCoverageToAllEditors(tmpCoverPath, testconfig.dir);
	}
	return testResult;
}

async function getTestTargetPackages(testconfig: TestConfig, outputChannel: vscode.OutputChannel) {
	const targets = testconfig.includeSubDirectories ? ['./...'] : [];
	let currentGoWorkspace = '';
	let getCurrentPackagePromise: Promise<string>;
	let pkgMapPromise: Promise<Map<string, string>>;
	if (testconfig.isMod) {
		getCurrentPackagePromise = getCurrentPackage(testconfig.dir);
		// We need the mapping to get absolute paths for the files in the test output.
		pkgMapPromise = getNonVendorPackages(testconfig.dir, !!testconfig.includeSubDirectories);
	} else {
		// GOPATH mode
		currentGoWorkspace = getCurrentGoWorkspaceFromGOPATH(getCurrentGoPath(), testconfig.dir);
		getCurrentPackagePromise = Promise.resolve(
			currentGoWorkspace ? testconfig.dir.substr(currentGoWorkspace.length + 1) : ''
		);
		// We dont need mapping, as we can derive the absolute paths from package path
		pkgMapPromise = Promise.resolve(null);
	}

	let pkgMap = new Map<string, string>();
	// run go list to populate pkgMap and currentPackage necessary to adjust the test output later.
	try {
		const [pkgMap0, currentPackage] = await Promise.all([pkgMapPromise, getCurrentPackagePromise]);
		if (pkgMap0) {
			pkgMap = pkgMap0;
		}
		// Use the package name to be in the args to enable running tests in symlinked directories
		// TODO(hyangah): check why modules mode didn't set currentPackage.
		if (!testconfig.includeSubDirectories && currentPackage) {
			targets.splice(0, 0, currentPackage);
		}
	} catch (err) {
		outputChannel.appendLine(`warning: failed to compute package mapping... ${err}`);
	}
	return { targets, pkgMap, currentGoWorkspace };
}

// computeTestCommand returns the test command argument list and extra info necessary
// to post process the test results.
// Exported for testing.
export function computeTestCommand(
	testconfig: TestConfig,
	targets: string[]
): {
	args: Array<string>; // test command args.
	outArgs: Array<string>; // compact test command args to show to user.
	tmpCoverPath?: string; // coverage file path if coverage info is necessary.
	addJSONFlag: boolean; // true if we add extra -json flag for stream processing.
} {
	const args: Array<string> = ['test'];
	// user-specified flags
	const argsFlagIdx = testconfig.flags?.indexOf('-args') ?? -1;
	const userFlags = argsFlagIdx < 0 ? testconfig.flags : testconfig.flags.slice(0, argsFlagIdx);
	const userArgsFlags = argsFlagIdx < 0 ? [] : testconfig.flags.slice(argsFlagIdx);

	// flags to limit test time
	if (testconfig.isBenchmark) {
		args.push('-benchmem', '-run=^$');
	} else {
		args.push('-timeout', testconfig.goConfig['testTimeout']);
	}

	// tags flags only if user didn't set -tags yet.
	const testTags: string = getTestTags(testconfig.goConfig);
	if (testTags && userFlags.indexOf('-tags') === -1) {
		args.push('-tags', testTags);
	}

	// coverage flags
	let tmpCoverPath: string;
	if (testconfig.applyCodeCoverage) {
		tmpCoverPath = getTempFilePath('go-code-cover');
		args.push('-coverprofile=' + tmpCoverPath);
		const coverMode = testconfig.goConfig['coverMode'];
		switch (coverMode) {
			case 'default':
				break;
			case 'set':
			case 'count':
			case 'atomic':
				args.push('-covermode', coverMode);
				break;
			default:
				vscode.window.showWarningMessage(
					`go.coverMode=${coverMode} is illegal. Use 'set', 'count', 'atomic', or 'default'.`
				);
		}
	}

	// all other test run/benchmark flags
	args.push(...targetArgs(testconfig));

	const outArgs = args.slice(0); // command to show

	// if user set -v, set -json to emulate streaming test output
	const addJSONFlag = userFlags.includes('-v') && !userFlags.includes('-json');
	if (addJSONFlag) {
		args.push('-json'); // this is not shown to the user.
	}

	if (targets.length > 4) {
		outArgs.push('<long arguments omitted>');
	} else {
		outArgs.push(...targets);
	}
	args.push(...targets);

	// ensure that user provided flags are appended last (allow use of -args ...)
	// ignore user provided -run flag if we are already using it
	if (args.indexOf('-run') > -1) {
		removeRunFlag(userFlags);
	}

	args.push(...userFlags);
	outArgs.push(...userFlags);

	args.push(...userArgsFlags);
	outArgs.push(...userArgsFlags);

	return {
		args,
		outArgs,
		tmpCoverPath,
		addJSONFlag
	};
}

function processTestResultLineInJSONMode(
	pkgMap: Map<string, string>,
	currentGoWorkspace: string,
	outputChannel: vscode.OutputChannel
) {
	return (line: string) => {
		try {
			const m = <GoTestOutput>JSON.parse(line);
			if (m.Action !== 'output' || !m.Output) {
				return;
			}
			const out = m.Output;
			const pkg = m.Package;
			if (pkg && (pkgMap.has(pkg) || currentGoWorkspace)) {
				const pkgNameArr = pkg.split('/');
				const baseDir = pkgMap.get(pkg) || path.join(currentGoWorkspace, ...pkgNameArr);
				// go test emits test results on stdout, which contain file names relative to the package under test
				outputChannel.appendLine(expandFilePathInOutput(out, baseDir).trimRight());
			} else {
				outputChannel.appendLine(out.trimRight());
			}
		} catch (e) {
			// TODO: disable this log if it becomes too spammy.
			console.log(`failed to parse JSON: ${e}: ${line}`);
			// Build failures or other messages come in non-JSON format. So, output as they are.
			outputChannel.appendLine(line);
		}
	};
}

function processTestResultLineInStandardMode(
	pkgMap: Map<string, string>,
	currentGoWorkspace: string,
	testResultLines: string[],
	outputChannel: vscode.OutputChannel
) {
	// 1=ok/FAIL/?, 2=package, 3=time/(cached)/[no test files]
	const packageResultLineRE = /^(ok|FAIL|\?)\s+(\S+)\s+([0-9\.]+s|\(cached\)|\[no test files\])/;
	const lineWithErrorRE = /^\s+(\S+\.go):(\d+):/;

	return (line: string) => {
		testResultLines.push(line);
		const result = line.match(packageResultLineRE);
		if (result && (pkgMap.has(result[2]) || currentGoWorkspace)) {
			const hasTestFailed = line.startsWith('FAIL');
			const packageNameArr = result[2].split('/');
			const baseDir = pkgMap.get(result[2]) || path.join(currentGoWorkspace, ...packageNameArr);
			testResultLines.forEach((testResultLine) => {
				if (hasTestFailed && lineWithErrorRE.test(testResultLine)) {
					outputChannel.appendLine(expandFilePathInOutput(testResultLine, baseDir));
				} else {
					outputChannel.appendLine(testResultLine);
				}
			});
			testResultLines.splice(0);
		}
	};
}

/**
 * Reveals the output channel in the UI.
 */
export function showTestOutput() {
	testOutputChannel.show(true);
}

/**
 * Iterates the list of currently running test processes and kills them all.
 */
export function cancelRunningTests(): Thenable<boolean> {
	return new Promise<boolean>((resolve, reject) => {
		runningTestProcesses.forEach((tp) => {
			killProcessTree(tp);
		});
		// All processes are now dead. Empty the array to prepare for the next run.
		runningTestProcesses.splice(0, runningTestProcesses.length);
		statusBarItem.hide();
		resolve(true);
	});
}

/**
 * Get the test target arguments.
 *
 * @param testconfig Configuration for the Go extension.
 */
function targetArgs(testconfig: TestConfig): Array<string> {
	let params: string[] = [];

	if (testconfig.functions) {
		if (testconfig.isBenchmark) {
			params = ['-bench', util.format('^(%s)$', testconfig.functions.join('|'))];
		} else {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showInformationMessage('No editor is active.');
				return;
			}
			if (!editor.document.fileName.endsWith('_test.go')) {
				vscode.window.showInformationMessage('No tests found. Current file is not a test file.');
				return;
			}

			let testFunctions = testconfig.functions;
			let testMethods = testFunctions.filter((fn) => testMethodRegex.test(fn));
			if (testMethods.length > 0) {
				// filter out methods
				testFunctions = testFunctions.filter((fn) => !testMethodRegex.test(fn));
				testMethods = testMethods.map(extractInstanceTestName);
			}

			// we might skip the '-run' param when running only external test package methods, which will
			// result in running all the test methods, but in the case of testify, one of them should call
			// testify's `suite.Run(...)`, which will cause the correct thing to happen
			if (testFunctions.length > 0) {
				if (testFunctions.length === 1) {
					params = params.concat(['-run', util.format('^%s$', testFunctions[0])]);
				} else {
					params = params.concat(['-run', util.format('^(%s)$', testFunctions.join('|'))]);
				}
			}
			if (testMethods.length > 0) {
				if (containsThirdPartyTestPackages(editor.document, null, [checkPkg])) {
					params = params.concat(['-check.f', util.format('^(%s)$', testMethods.join('|'))]);
				} else if (containsThirdPartyTestPackages(editor.document, null, [testifyPkg])) {
					params = params.concat(['-testify.m', util.format('^(%s)$', testMethods.join('|'))]);
				}
			}
		}
		return params;
	}

	if (testconfig.isBenchmark) {
		params = ['-bench', '.'];
	}
	return params;
}

function removeRunFlag(flags: string[]): void {
	const index: number = flags.indexOf('-run');
	if (index !== -1) {
		flags.splice(index, 2);
	}
}

export async function containsThirdPartyTestPackages(
	doc: vscode.TextDocument,
	token: vscode.CancellationToken,
	pkgs: string[]
): Promise<boolean> {
	const documentSymbolProvider = new GoDocumentSymbolProvider(true);
	const allPackages = await documentSymbolProvider
		.provideDocumentSymbols(doc, token)
		.then((symbols) => symbols[0].children)
		.then((symbols) => {
			return symbols.filter(
				(sym) =>
					sym.kind === vscode.SymbolKind.Namespace &&
					pkgs.some((pkg) => {
						sym.name === pkg;
					})
			);
		});
	return allPackages.length > 0;
}
