/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable eqeqeq */
/* eslint-disable no-case-declarations */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import semver = require('semver');
import { ConfigurationTarget } from 'vscode';
import { getGoConfig, getGoplsConfig } from './config';
import { toolExecutionEnvironment, toolInstallationEnvironment } from './goEnv';
import { addGoRuntimeBaseToPATH, clearGoRuntimeBaseFromPATH } from './goEnvironmentStatus';
import { logVerbose } from './goLogging';
import { restartLanguageServer } from './goMain';
import { addGoStatus, initGoStatusBar, outputChannel, removeGoStatus } from './goStatus';
import {
	containsTool,
	getConfiguredTools,
	getImportPath,
	getImportPathWithVersion,
	getTool,
	hasModSuffix,
	Tool,
	ToolAtVersion
} from './goTools';
import {
	getBinPath,
	getBinPathWithExplanation,
	getCheckForToolsUpdatesConfig,
	getGoVersion,
	getTempFilePath,
	getWorkspaceFolderPath,
	GoVersion,
	rmdirRecursive
} from './util';
import { correctBinname, envPath, getCurrentGoRoot, setCurrentGoRoot } from './utils/pathUtils';
import util = require('util');
import vscode = require('vscode');
import { isInPreviewMode } from './goLanguageServer';

// declinedUpdates tracks the tools that the user has declined to update.
const declinedUpdates: Tool[] = [];

// declinedUpdates tracks the tools that the user has declined to install.
const declinedInstalls: Tool[] = [];

export async function installAllTools(updateExistingToolsOnly = false) {
	const goVersion = await getGoVersion();
	let allTools = getConfiguredTools(goVersion, getGoConfig(), getGoplsConfig());

	// exclude tools replaced by alternateTools.
	const alternateTools: { [key: string]: string } = getGoConfig().get('alternateTools');
	allTools = allTools.filter((tool) => {
		return !alternateTools[tool.name];
	});

	// Update existing tools by finding all tools the user has already installed.
	if (updateExistingToolsOnly) {
		await installTools(
			allTools.filter((tool) => {
				const toolPath = getBinPath(tool.name);
				return toolPath && path.isAbsolute(toolPath);
			}),
			goVersion
		);
		return;
	}

	// Otherwise, allow the user to select which tools to install or update.
	const selected = await vscode.window.showQuickPick(
		allTools.map((x) => {
			const item: vscode.QuickPickItem = {
				label: x.name,
				description: x.description
			};
			return item;
		}),
		{
			canPickMany: true,
			placeHolder: 'Select the tools to install/update.'
		}
	);
	if (!selected) {
		return;
	}
	await installTools(
		selected.map((x) => getTool(x.label)),
		goVersion
	);
}

/**
 * Installs given array of missing tools. If no input is given, the all tools are installed
 *
 * @param missing array of tool names and optionally, their versions to be installed.
 *                If a tool's version is not specified, it will install the latest.
 * @param goVersion version of Go that affects how to install the tool. (e.g. modules vs legacy GOPATH mode)
 * @returns a list of tools that failed to install.
 */
export async function installTools(
	missing: ToolAtVersion[],
	goVersion: GoVersion,
	silent?: boolean
): Promise<{ tool: ToolAtVersion; reason: string }[]> {
	if (!missing) {
		return [];
	}

	if (!silent) {
		outputChannel.show();
	}
	outputChannel.clear();

	const envForTools = toolInstallationEnvironment();
	const toolsGopath = envForTools['GOPATH'];
	let envMsg = `Tools environment: GOPATH=${toolsGopath}`;
	if (envForTools['GOBIN']) {
		envMsg += `, GOBIN=${envForTools['GOBIN']}`;
	}
	outputChannel.appendLine(envMsg);

	let installingMsg = `Installing ${missing.length} ${missing.length > 1 ? 'tools' : 'tool'} at `;
	if (envForTools['GOBIN']) {
		installingMsg += `the configured GOBIN: ${envForTools['GOBIN']}`;
	} else {
		const p = toolsGopath
			.split(path.delimiter)
			.map((e) => path.join(e, 'bin'))
			.join(path.delimiter);
		installingMsg += `${p}`;
	}

	// If the user is on Go >= 1.11, tools should be installed with modules enabled.
	// This ensures that users get the latest tagged version, rather than master,
	// which may be unstable.
	let modulesOff = false;
	if (goVersion.lt('1.11')) {
		modulesOff = true;
	} else {
		installingMsg += ' in module mode.';
	}

	outputChannel.appendLine(installingMsg);
	missing.forEach((missingTool) => {
		let toolName = missingTool.name;
		if (missingTool.version) {
			toolName += '@' + missingTool.version;
		}
		outputChannel.appendLine('  ' + toolName);
	});

	outputChannel.appendLine(''); // Blank line for spacing.

	const toInstall: Promise<{ tool: Tool; reason: string }>[] = [];
	for (const tool of missing) {
		const modulesOffForTool = modulesOff;

		const reason = installTool(tool, goVersion, envForTools, !modulesOffForTool);
		toInstall.push(Promise.resolve({ tool, reason: await reason }));
	}

	const results = await Promise.all(toInstall);

	const failures: { tool: ToolAtVersion; reason: string }[] = [];
	for (const result of results) {
		if (result.reason === '') {
			// Restart the language server if a new binary has been installed.
			if (result.tool.name === 'gopls') {
				restartLanguageServer();
			}
		} else {
			failures.push(result);
		}
	}

	// Report detailed information about any failures.
	outputChannel.appendLine(''); // blank line for spacing
	if (failures.length === 0) {
		outputChannel.appendLine('All tools successfully installed. You are ready to Go :).');
	} else {
		// Show the output channel on failures, even if the installation should
		// be silent.
		if (silent) {
			outputChannel.show();
		}
		outputChannel.appendLine(failures.length + ' tools failed to install.\n');
		for (const failure of failures) {
			outputChannel.appendLine(`${failure.tool.name}: ${failure.reason} `);
		}
	}
	return failures;
}

async function tmpDirForToolInstallation() {
	// Install tools in a temporary directory, to avoid altering go.mod files.
	const mkdtemp = util.promisify(fs.mkdtemp);
	const toolsTmpDir = await mkdtemp(getTempFilePath('go-tools-'));
	// Write a temporary go.mod file to avoid version conflicts.
	const tmpGoModFile = path.join(toolsTmpDir, 'go.mod');
	const writeFile = util.promisify(fs.writeFile);
	await writeFile(tmpGoModFile, 'module tools');

	return toolsTmpDir;
}

export async function installTool(
	tool: ToolAtVersion,
	goVersion: GoVersion,
	envForTools: NodeJS.Dict<string>,
	modulesOn: boolean
): Promise<string> {
	// Some tools may have to be closed before we reinstall them.
	if (tool.close) {
		const reason = await tool.close(envForTools);
		if (reason) {
			return reason;
		}
	}
	let toolsTmpDir = '';
	try {
		toolsTmpDir = await tmpDirForToolInstallation();
	} catch (e) {
		return `Failed to create a temp directory: ${e}`;
	}

	const env = Object.assign({}, envForTools);
	env['GO111MODULE'] = modulesOn ? 'on' : 'off';

	// Some users use direnv-like setup where the choice of go is affected by
	// the current directory path. In order to avoid choosing a different go,
	// we will explicitly use `GOROOT/bin/go` instead of goVersion.binaryPath
	// (which can be a wrapper script that switches 'go').
	const goBinary = getCurrentGoRoot()
		? path.join(getCurrentGoRoot(), 'bin', correctBinname('go'))
		: goVersion.binaryPath;

	// Build the arguments list for the tool installation.
	const args = ['get', '-v'];
	// Only get tools at master if we are not using modules.
	if (!modulesOn) {
		args.push('-u');
	}
	// dlv-dap or tools with a "mod" suffix can't be installed with
	// simple `go install` or `go get`. We need to get, build, and rename them.
	if (hasModSuffix(tool) || tool.name === 'dlv-dap') {
		args.push('-d'); // get the version, but don't build.
	}
	let importPath: string;
	if (!modulesOn) {
		importPath = getImportPath(tool, goVersion);
	} else {
		let version: semver.SemVer | string | undefined = tool.version;
		if (!version) {
			if (tool.usePrereleaseInPreviewMode && isInPreviewMode()) {
				version = await latestToolVersion(tool, true);
			} else if (tool.defaultVersion) {
				version = tool.defaultVersion;
			}
		}
		importPath = getImportPathWithVersion(tool, version, goVersion);
	}
	args.push(importPath);

	let output = 'no output';
	let result = '';
	try {
		const opts = {
			env,
			cwd: toolsTmpDir
		};
		const execFile = util.promisify(cp.execFile);
		const { stdout, stderr } = await execFile(goBinary, args, opts);
		output = `${stdout} ${stderr}`;
		logVerbose(`install: ${goBinary} ${args.join(' ')}\n${stdout}${stderr}`);
		if (hasModSuffix(tool) || tool.name === 'dlv-dap') {
			// Actual installation of the -gomod tool and dlv-dap is done by running go build.
			const gopath = env['GOBIN'] || env['GOPATH'];
			if (!gopath) {
				throw new Error('GOBIN/GOPATH not configured in environment');
			}
			const destDir = gopath.split(path.delimiter)[0];
			const outputFile = path.join(destDir, 'bin', process.platform === 'win32' ? `${tool.name}.exe` : tool.name);
			// go build does not take @version suffix yet.
			const importPath = getImportPath(tool, goVersion);
			await execFile(goBinary, ['build', '-o', outputFile, importPath], opts);
		}
		const toolInstallPath = getBinPath(tool.name);
		outputChannel.appendLine(`Installing ${importPath} (${toolInstallPath}) SUCCEEDED`);
	} catch (e) {
		outputChannel.appendLine(`Installing ${importPath} FAILED`);
		outputChannel.appendLine(`${JSON.stringify(e, null, 1)}`);
		result = `failed to install ${tool.name}(${importPath}): ${e} ${output}`;
	} finally {
		// Delete the temporary installation directory.
		rmdirRecursive(toolsTmpDir);
	}

	return result;
}

export function declinedToolInstall(toolName: string) {
	const tool = getTool(toolName);

	// If user has declined to install this tool, don't prompt for it.
	return !!containsTool(declinedInstalls, tool);
}

export async function promptForMissingTool(toolName: string) {
	const tool = getTool(toolName);

	// If user has declined to install this tool, don't prompt for it.
	if (declinedToolInstall(toolName)) {
		return;
	}

	const goVersion = await getGoVersion();
	if (!goVersion) {
		return;
	}

	// Show error messages for outdated tools or outdated Go versions.
	if (tool.minimumGoVersion && goVersion.lt(tool.minimumGoVersion.format())) {
		vscode.window.showInformationMessage(
			`You are using go${goVersion.format()}, but ${
				tool.name
			} requires at least go${tool.minimumGoVersion.format()}.`
		);
		return;
	}
	if (tool.maximumGoVersion && goVersion.gt(tool.maximumGoVersion.format())) {
		vscode.window.showInformationMessage(
			`You are using go${goVersion.format()}, but ${
				tool.name
			} only supports go${tool.maximumGoVersion.format()} and below.`
		);
		return;
	}

	const installOptions = ['Install'];
	let missing = await getMissingTools(goVersion);
	if (!containsTool(missing, tool)) {
		// If this function has been called, we want to display the prompt whether
		// it appears in missing or not.
		missing.push(tool);
	}
	missing = missing.filter((x) => x === tool || tool.isImportant);
	if (missing.length > 1) {
		// Offer the option to install all tools.
		installOptions.push('Install All');
	}
	const msg = `The "${tool.name}" command is not available.
Run "go get -v ${getImportPath(tool, goVersion)}" to install.`;
	const selected = await vscode.window.showErrorMessage(msg, ...installOptions);
	switch (selected) {
		case 'Install':
			await installTools([tool], goVersion);
			break;
		case 'Install All':
			await installTools(missing, goVersion);
			removeGoStatus();
			break;
		default:
			// The user has declined to install this tool.
			declinedInstalls.push(tool);
			break;
	}
}

export async function promptForUpdatingTool(
	toolName: string,
	newVersion?: semver.SemVer,
	crashed?: boolean,
	message?: string
) {
	const tool = getTool(toolName);
	const toolVersion = { ...tool, version: newVersion }; // ToolWithVersion

	// If user has declined to update, then don't prompt.
	if (containsTool(declinedUpdates, tool)) {
		return;
	}

	// Adjust the prompt if it occurred because the tool crashed.
	let updateMsg: string;
	if (message) {
		updateMsg = message;
	} else if (crashed === true) {
		updateMsg = `${tool.name} has crashed, but you are using an outdated version. Please update to the latest version of ${tool.name}.`;
	} else if (newVersion) {
		updateMsg = `A new version of ${tool.name} (v${newVersion}) is available. Please update for an improved experience.`;
	} else {
		updateMsg = `Your version of ${tool.name} appears to be out of date. Please update for an improved experience.`;
	}

	let choices: string[] = ['Update'];
	if (toolName === 'gopls') {
		choices = ['Always Update', 'Update Once', 'Release Notes'];
	}

	const goVersion = await getGoVersion();

	while (choices.length > 0) {
		const selected = await vscode.window.showInformationMessage(updateMsg, ...choices);
		switch (selected) {
			case 'Always Update':
				// Update the user's settings to enable auto updates. They can
				// always opt-out in their settings.
				const goConfig = getGoConfig();
				await goConfig.update('toolsManagement.autoUpdate', true, ConfigurationTarget.Global);

				// And then install the tool.
				choices = [];
				await installTools([toolVersion], goVersion);
				break;
			case 'Update Once':
				choices = [];
				await installTools([toolVersion], goVersion);
				break;
			case 'Update':
				choices = [];
				await installTools([toolVersion], goVersion);
				break;
			case 'Release Notes':
				choices = choices.filter((value) => value !== 'Release Notes');
				vscode.commands.executeCommand(
					'vscode.open',
					vscode.Uri.parse(`https://github.com/golang/tools/releases/tag/${tool.name}/v${newVersion}`)
				);
				break;
			default:
				choices = [];
				declinedUpdates.push(tool);
				break;
		}
	}
}

export function updateGoVarsFromConfig(): Promise<void> {
	const { binPath, why } = getBinPathWithExplanation('go', false);
	const goRuntimePath = binPath;

	logVerbose(`updateGoVarsFromConfig: found 'go' in ${goRuntimePath}`);
	if (!goRuntimePath || !path.isAbsolute(goRuntimePath)) {
		// getBinPath returns the absolute path to the tool if it exists.
		// Otherwise, it may return the tool name (e.g. 'go').
		suggestDownloadGo();
		return Promise.reject();
	}

	return new Promise<void>((resolve, reject) => {
		cp.execFile(
			goRuntimePath,
			// -json is supported since go1.9
			['env', '-json', 'GOPATH', 'GOROOT', 'GOPROXY', 'GOBIN', 'GOMODCACHE'],
			{ env: toolExecutionEnvironment(), cwd: getWorkspaceFolderPath() },
			(err, stdout, stderr) => {
				if (err) {
					outputChannel.append(
						`Failed to run '${goRuntimePath} env' (cwd: ${getWorkspaceFolderPath()}): ${err}\n${stderr}`
					);
					outputChannel.show();

					vscode.window.showErrorMessage(
						`Failed to run '${goRuntimePath} env. The config change may not be applied correctly.`
					);
					return reject();
				}
				if (stderr) {
					// 'go env' may output warnings about potential misconfiguration.
					// Show the messages to users but keep processing the stdout.
					outputChannel.append(`'${goRuntimePath} env': ${stderr}`);
					outputChannel.show();
				}
				logVerbose(`${goRuntimePath} env ...:\n${stdout}`);
				const envOutput = JSON.parse(stdout);
				if (envOutput.GOROOT && envOutput.GOROOT.trim()) {
					setCurrentGoRoot(envOutput.GOROOT.trim());
					delete envOutput.GOROOT;
				}
				for (const envName in envOutput) {
					if (!process.env[envName] && envOutput[envName] && envOutput[envName].trim()) {
						process.env[envName] = envOutput[envName].trim();
					}
				}

				// cgo, gopls, and other underlying tools will inherit the environment and attempt
				// to locate 'go' from the PATH env var.
				// Update the PATH only if users configured to use a different
				// version of go than the system default found from PATH (or Path).
				if (why !== 'path') {
					addGoRuntimeBaseToPATH(path.join(getCurrentGoRoot(), 'bin'));
				} else {
					// clear pre-existing terminal PATH mutation logic set up by this extension.
					clearGoRuntimeBaseFromPATH();
				}
				initGoStatusBar();
				// TODO: restart language server or synchronize with language server update.

				return resolve();
			}
		);
	});
}

let alreadyOfferedToInstallTools = false;

export async function offerToInstallTools() {
	if (alreadyOfferedToInstallTools) {
		return;
	}
	alreadyOfferedToInstallTools = true;

	const goVersion = await getGoVersion();
	let missing = await getMissingTools(goVersion);
	missing = missing.filter((x) => x.isImportant);
	if (missing.length > 0) {
		addGoStatus('Analysis Tools Missing', 'go.promptforinstall', 'Not all Go tools are available on the GOPATH');
		vscode.commands.registerCommand('go.promptforinstall', () => {
			const installItem = {
				title: 'Install',
				async command() {
					removeGoStatus();
					await installTools(missing, goVersion);
				}
			};
			const showItem = {
				title: 'Show',
				command() {
					outputChannel.clear();
					outputChannel.show();
					outputChannel.appendLine('Below tools are needed for the basic features of the Go extension.');
					missing.forEach((x) => outputChannel.appendLine(`  ${x.name}`));
				}
			};
			vscode.window
				.showInformationMessage(
					'Failed to find some of the Go analysis tools. Would you like to install them?',
					installItem,
					showItem
				)
				.then((selection) => {
					if (selection) {
						selection.command();
					} else {
						removeGoStatus();
					}
				});
		});
	}

	const goConfig = getGoConfig();
	if (!goConfig['useLanguageServer']) {
		return;
	}
}

function getMissingTools(goVersion: GoVersion): Promise<Tool[]> {
	const keys = getConfiguredTools(goVersion, getGoConfig(), getGoplsConfig());
	return Promise.all<Tool>(
		keys.map(
			(tool) =>
				new Promise<Tool>((resolve, reject) => {
					const toolPath = getBinPath(tool.name);
					resolve(path.isAbsolute(toolPath) ? null : tool);
				})
		)
	).then((res) => {
		return res.filter((x) => x != null);
	});
}

let suggestedDownloadGo = false;

async function suggestDownloadGo() {
	const msg =
		`Failed to find the "go" binary in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath}).` +
		'Check PATH, or Install Go and reload the window. ' +
		"If PATH isn't what you expected, see https://github.com/golang/vscode-go/issues/971";
	if (suggestedDownloadGo) {
		vscode.window.showErrorMessage(msg);
		return;
	}

	const choice = await vscode.window.showErrorMessage(msg, 'Go to Download Page');
	if (choice === 'Go to Download Page') {
		vscode.env.openExternal(vscode.Uri.parse('https://golang.org/dl/'));
	}
	suggestedDownloadGo = true;
}

// ListVersionsOutput is the output of `go list -m -versions -json`.
interface ListVersionsOutput {
	Version: string; // module version
	Versions?: string[]; // available module versions (with -versions)
}

// latestToolVersion returns the latest version of the tool.
export async function latestToolVersion(tool: Tool, includePrerelease?: boolean): Promise<semver.SemVer | null> {
	const goCmd = getBinPath('go');
	const tmpDir = await tmpDirForToolInstallation();
	const execFile = util.promisify(cp.execFile);
	let ret: semver.SemVer | null = null;
	try {
		const env = toolInstallationEnvironment();
		env['GO111MODULE'] = 'on';
		// Run go list in a temp directory to avoid altering go.mod
		// when using older versions of go (<1.16).
		const version = 'latest'; // TODO(hyangah): use 'master' for delve-dap.
		const { stdout } = await execFile(
			goCmd,
			['list', '-m', '--versions', '-json', `${tool.modulePath}@${version}`],
			{ env, cwd: tmpDir }
		);
		const m = <ListVersionsOutput>JSON.parse(stdout);
		// Versions field is a list of all known versions of the module,
		// ordered according to semantic versioning, earliest to latest.
		const latest = includePrerelease && m.Versions && m.Versions.length > 0 ? m.Versions.pop() : m.Version;
		ret = semver.parse(latest);
	} catch (e) {
		console.log(`failed to retrieve the latest tool ${tool.name} version: ${e}`);
	} finally {
		rmdirRecursive(tmpDir);
	}
	return ret;
}

// inspectGoToolVersion reads the go version and module version
// of the given go tool using `go version -m` command.
export const inspectGoToolVersion = defaultInspectGoToolVersion;
async function defaultInspectGoToolVersion(binPath: string): Promise<{ goVersion?: string; moduleVersion?: string }> {
	const goCmd = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	try {
		const { stdout } = await execFile(goCmd, ['version', '-m', binPath]);
		/* The output format will look like this

		   if the binary was built in module mode.
			/Users/hakim/go/bin/gopls: go1.16
			path    golang.org/x/tools/gopls
			mod     golang.org/x/tools/gopls        v0.6.6  h1:GmCsAKZMEb1BD1BTWnQrMyx4FmNThlEsmuFiJbLBXio=
			dep     github.com/BurntSushi/toml      v0.3.1  h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ=

		   if the binary was built in GOPATH mode => the following code will throw an error which will be handled.
		    /Users/hakim/go/bin/gopls: go1.16

		   if the binary was built in dev branch, in module mode => the following code will not throw an error,
		   and return (devel) as the moduleVersion.
		    /Users/hakim/go/bin/gopls: go1.16
			path    golang.org/x/tools/gopls
			mod     golang.org/x/tools/gopls        (devel)
			dep     github.com/BurntSushi/toml      v0.3.1  h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ=
		*/
		const lines = stdout.split('\n', 3);
		const goVersion = lines[0].split(/\s+/)[1];
		const moduleVersion = lines[2].split(/\s+/)[3];
		return { goVersion, moduleVersion };
	} catch (e) {
		outputChannel.appendLine(
			`Failed to determine the version of ${binPath}. For debugging, run "go version -m ${binPath}"`
		);
		// either go version failed or stdout is not in the expected format.
		return {};
	}
}

export async function shouldUpdateTool(tool: Tool, toolPath: string): Promise<boolean> {
	if (!tool.latestVersion) {
		return false;
	}

	const checkForUpdates = getCheckForToolsUpdatesConfig(getGoConfig());
	if (checkForUpdates === 'off') {
		return false;
	}
	const { moduleVersion } = await inspectGoToolVersion(toolPath);
	if (!moduleVersion) {
		return false; // failed to inspect the tool version.
	}
	const localVersion = semver.parse(moduleVersion, { includePrerelease: true });
	if (!localVersion) {
		// local version can't be determined. e.g. (devel)
		return false;
	}
	return semver.lt(localVersion, tool.latestVersion);
	// update only if the local version is older than the desired version.

	// TODO(hyangah): figure out when to check if a version newer than
	// tool.latestVersion is released when checkForUpdates === 'proxy'
}
