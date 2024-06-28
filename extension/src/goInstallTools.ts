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
import { extensionInfo, getGoConfig, getGoplsConfig } from './config';
import { toolExecutionEnvironment, toolInstallationEnvironment } from './goEnv';
import { addGoRuntimeBaseToPATH, clearGoRuntimeBaseFromPATH } from './goEnvironmentStatus';
import { GoExtensionContext } from './context';
import { addGoStatus, initGoStatusBar, outputChannel, removeGoStatus } from './goStatus';
import { containsTool, getConfiguredTools, getImportPathWithVersion, getTool, Tool, ToolAtVersion } from './goTools';
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
import {
	getEnvPath,
	getCurrentGoRoot,
	setCurrentGoRoot,
	correctBinname,
	executableFileExists
} from './utils/pathUtils';
import util = require('util');
import vscode = require('vscode');
import { RestartReason } from './language/goLanguageServer';
import { telemetryReporter } from './goTelemetry';
import { allToolsInformation } from './goToolsInformation';

const STATUS_BAR_ITEM_NAME = 'Go Tools';

// declinedUpdates tracks the tools that the user has declined to update.
const declinedUpdates: Tool[] = [];

// declinedUpdates tracks the tools that the user has declined to install.
const declinedInstalls: Tool[] = [];

export interface IToolsManager {
	getMissingTools(filter: (tool: Tool) => boolean): Promise<Tool[]>;
	installTool(tool: Tool, goVersion: GoVersion, env: NodeJS.Dict<string>): Promise<string | undefined>;
}

export const defaultToolsManager: IToolsManager = {
	getMissingTools,
	installTool: installToolWithGo
};

export async function installAllTools(updateExistingToolsOnly = false) {
	const goVersion = await getGoVersion();
	let allTools = getConfiguredTools(getGoConfig(), getGoplsConfig());

	// exclude tools replaced by alternateTools.
	const alternateTools: { [key: string]: string } = getGoConfig().get('alternateTools') ?? {};
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
				label: `${x.name}@${x.defaultVersion || 'latest'}`,
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

export const getGoForInstall = _getGoForInstall;
async function _getGoForInstall(goVersion: GoVersion): Promise<GoVersion | undefined> {
	let configured = getGoConfig().get<string>('toolsManagement.go');
	if (!configured) {
		configured = goVersion.binaryPath;
	}
	try {
		// goVersion may be the version picked based on the the minimum
		// toolchain version requirement specified in go.mod or go.work.
		// Compute the local toolchain version. (GOTOOLCHAIN=local go version)
		const go = await getGoVersion(configured, 'local');
		if (go) return go;
	} catch (e) {
		outputChannel.error(`failed to run "go version" with "${configured}". Provide a valid path to the Go binary`);
	}
	return;
}

interface installToolsOptions {
	silent?: boolean;
	skipRestartGopls?: boolean;
	toolsManager?: IToolsManager;
}

/**
 * Installs given array of missing tools. If no input is given, the all tools are installed
 *
 * @param missing array of tool names and optionally, their versions to be installed.
 *                If a tool's version is not specified, it will install the latest.
 * @param goVersion version of Go used in the project. (e.g. result of 'go version' from
 *                workspace root). If go used for tools installation
 *                is not configured or misconfigured, this is used as a fallback.
 * @returns a list of tools that failed to install.
 */
export async function installTools(
	missing: ToolAtVersion[],
	goVersion: GoVersion,
	options?: installToolsOptions
): Promise<{ tool: ToolAtVersion; reason: string }[]> {
	// TODO(hyangah): the return value (tool, reason) is not used anywhere
	// other than in tests. Check if we are giving users enough information
	// about failed tools installation.
	if (!missing) {
		return [];
	}
	const { silent, skipRestartGopls } = options || {};
	if (!silent) {
		outputChannel.show();
	}

	const goForInstall = await getGoForInstall(goVersion);
	if (!goForInstall || !goForInstall.isValid()) {
		vscode.window.showErrorMessage('Failed to find a go command needed to install tools.');
		outputChannel.show(); // show error.
		return missing.map((tool) => {
			return { tool: tool, reason: 'failed to find go' };
		});
	}

	const minVersion = goForInstall.lt('1.21') ? (goVersion.lt('1.19') ? '1.19' : goVersion.format()) : '1.21.0';
	if (goForInstall.lt(minVersion)) {
		vscode.window.showErrorMessage(
			`Failed to find a go command (go${minVersion} or newer) needed to install tools. ` +
				`The go command (${goForInstall.binaryPath}) is too old (go${goForInstall.svString}). ` +
				'If your project requires a Go version older than go1.19, either manually install the tools or, use the "go.toolsManagement.go" setting ' +
				'to configure the Go version used for tools installation. See https://github.com/golang/vscode-go/issues/2898.'
		);
		return missing.map((tool) => {
			return { tool: tool, reason: `failed to find go (requires go${minVersion} or newer)` };
		});
	}

	const envForTools = toolInstallationEnvironment();
	if (
		!goVersion.isDevel &&
		goVersion.sv &&
		!goForInstall.isDevel &&
		goForInstall.sv &&
		semver.gt(goVersion.sv, goForInstall.sv)
	) {
		// If goVersion.isDevel === true, for example,
		//    go version go1.23-20240317-RC00 cl/616607620 +0a6f05e30f X:fieldtrack,boringcrypto linux/amd64
		//    go version devel go1.23-cd294f55ca Mon Apr 1 20:28:41 2024 +0000 darwin/amd64
		// we optimisitically assume the go command chosen for install (goForInstall)
		// is new enough (possibly newer than the officially released go version),
		// and don't set GOTOOLCHAIN.
		const version = goVersion.format(true);
		envForTools['GOTOOLCHAIN'] = `go${version}+auto`;
	}

	const toolsGopath = envForTools['GOPATH'];
	let envMsg = `Tools environment: GOPATH=${toolsGopath}`;
	if (envForTools['GOBIN']) {
		envMsg += `, GOBIN=${envForTools['GOBIN']}`;
	}
	if (envForTools['GOTOOLCHAIN']) {
		envMsg += `, GOTOOLCHAIN=${envForTools['GOTOOLCHAIN']}`;
	}
	outputChannel.appendLine(envMsg);

	let installingMsg = `Installing ${missing.length} ${missing.length > 1 ? 'tools' : 'tool'} at `;
	if (envForTools['GOBIN']) {
		installingMsg += `the configured GOBIN: ${envForTools['GOBIN']}`;
	} else {
		const p = toolsGopath
			?.split(path.delimiter)
			.map((e) => path.join(e, 'bin'))
			.join(path.delimiter);
		installingMsg += `${p}`;
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

	const failures: { tool: ToolAtVersion; reason: string }[] = [];
	const tm = options?.toolsManager ?? defaultToolsManager;
	for (const tool of missing) {
		const failed = await tm.installTool(tool, goForInstall, envForTools);
		if (failed) {
			failures.push({ tool, reason: failed });
		} else if (tool.name === 'gopls' && !skipRestartGopls) {
			// Restart the language server if a new binary has been installed.
			vscode.commands.executeCommand('go.languageserver.restart', RestartReason.INSTALLATION);
		}
	}

	// Report detailed information about any failures.
	outputChannel.appendLine(''); // blank line for spacing
	if (failures.length === 0) {
		outputChannel.appendLine('All tools successfully installed. You are ready to Go. :)');
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
	if (missing.some((tool) => tool.isImportant)) {
		// if we just installed important tools, update the status bar.
		updateImportantToolsStatus(tm);
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

// installTool installs the specified tool.
export async function installTool(tool: ToolAtVersion): Promise<string | undefined> {
	const goVersion = await getGoForInstall(await getGoVersion());
	if (!goVersion) {
		return 'failed to find "go" for install';
	}
	const envForTools = toolInstallationEnvironment();

	return await installToolWithGo(tool, goVersion, envForTools);
}

async function installToolWithGo(
	tool: ToolAtVersion,
	goVersion: GoVersion, // go version to be used for installation.
	envForTools: NodeJS.Dict<string>
): Promise<string | undefined> {
	// Some tools may have to be closed before we reinstall them.
	if (tool.close) {
		const reason = await tool.close(envForTools);
		if (reason) {
			return reason;
		}
	}

	const env = Object.assign({}, envForTools);

	let version: semver.SemVer | string | undefined | null = tool.version;
	if (!version && tool.usePrereleaseInPreviewMode && extensionInfo.isPreview) {
		version = await latestToolVersion(tool, true);
	}
	const importPath = getImportPathWithVersion(tool, version, goVersion);

	try {
		await installToolWithGoInstall(goVersion, env, importPath);
		const toolInstallPath = getBinPath(tool.name);
		outputChannel.appendLine(`Installing ${importPath} (${toolInstallPath}) SUCCEEDED`);
	} catch (e) {
		outputChannel.appendLine(`Installing ${importPath} FAILED`);
		outputChannel.appendLine(`${JSON.stringify(e, null, 1)}`);
		return `failed to install ${tool.name}(${importPath}): ${e}`;
	}
}

async function installToolWithGoInstall(goVersion: GoVersion, env: NodeJS.Dict<string>, importPath: string) {
	// Unlike installToolWithGoGet, `go install` in module mode
	// can run in the current directory safely. So, use the user-specified go tool path.
	const goBinary = goVersion?.binaryPath || getBinPath('go');
	const opts = {
		env,
		cwd: getWorkspaceFolderPath()
	};

	const execFile = util.promisify(cp.execFile);
	outputChannel.trace(`${goBinary} install -v ${importPath} (cwd: ${opts.cwd})`);
	await execFile(goBinary, ['install', '-v', importPath], opts);
}

export function declinedToolInstall(toolName: string) {
	const tool = getTool(toolName);

	// If user has declined to install this tool, don't prompt for it.
	return !!containsTool(declinedInstalls, tool);
}

export async function promptForMissingTool(toolName: string) {
	const tool = getTool(toolName);
	if (!tool) {
		vscode.window.showWarningMessage(
			`${toolName} is not found. Please make sure it is installed and available in the PATH ${getEnvPath()}`
		);
		return;
	}

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
	let missing = await getMissingTools();
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
	const cmd = `go install -v ${getImportPathWithVersion(tool, undefined, goVersion)}`;
	const selected = await vscode.window.showErrorMessage(
		`The "${tool.name}" command is not available. Run "${cmd}" to install.`,
		...installOptions
	);
	switch (selected) {
		case 'Install':
			await installTools([tool], goVersion);
			break;
		case 'Install All':
			await installTools(missing, goVersion);
			removeGoStatus(STATUS_BAR_ITEM_NAME);
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
	if (!tool) {
		return; // not a tool known to us.
	}
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
	if (toolName === 'dlv') {
		choices = ['Always Update', 'Update Once'];
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

export function updateGoVarsFromConfig(goCtx: GoExtensionContext): Promise<void> {
	const { binPath, why } = getBinPathWithExplanation('go', false);
	const goRuntimePath = binPath;

	outputChannel.debug(`updateGoVarsFromConfig: found 'go' in ${goRuntimePath}`);
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
				outputChannel.trace(`${goRuntimePath} env ...:\n${stdout}`);
				const envOutput = JSON.parse(stdout);
				if (envOutput.GOROOT && envOutput.GOROOT.trim()) {
					outputChannel.debug('setCurrentGOROOT:', envOutput.GOROOT);
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
				initGoStatusBar(goCtx);
				// TODO: restart language server or synchronize with language server update.

				return resolve();
			}
		);
	});
}

// maybeInstallImportantTools checks whether important tools are installed,
// and tries to auto-install them if missing.
export async function maybeInstallImportantTools(
	alternateTools: { [key: string]: string } | undefined,
	tm: IToolsManager = defaultToolsManager
): Promise<vscode.LanguageStatusItem> {
	const statusBarItem = addGoStatus(STATUS_BAR_ITEM_NAME);
	statusBarItem.name = STATUS_BAR_ITEM_NAME;
	statusBarItem.text = 'Analysis tools';

	try {
		statusBarItem.busy = true;
		let missing = await tm.getMissingTools((tool: Tool) => {
			return tool.isImportant;
		}); // expect gopls and a linter.

		// Initial install.
		if (missing.length > 0) {
			outputChannel.show(); // Best effort: make it visible so users can see the progress.
			statusBarItem.detail = missing.map((tool) => tool.name).join(', ');
			const goVersion = await getGoVersion();
			// filter out tools with 'alternateTools' setting. updateImportantToolsStatus will
			// recompute missing tools and recognize tools still missing.
			if (alternateTools) {
				missing = missing
					.map((tool) => {
						if (alternateTools[tool.name]) {
							outputChannel.appendLine(
								`skip installing ${
									tool.name
								} because the 'alternateTools' setting is configured to use ${
									alternateTools[tool.name]
								} instead.`
							);
						}
						return tool;
					})
					.filter((tool) => !alternateTools[tool.name]);
			}
			await installTools(missing, goVersion, { toolsManager: tm, skipRestartGopls: true });
			// installTools will update ImportantToolsStatus.
		} else {
			// no essential tools to be installed.
			await updateImportantToolsStatus(tm);
		}
	} catch (e) {
		outputChannel.appendLine('install missing tools failed - ' + JSON.stringify(e));
	} finally {
		statusBarItem.busy = false;
	}
	return statusBarItem;
}

async function updateImportantToolsStatus(tm: IToolsManager = defaultToolsManager): Promise<void> {
	const statusBarItem = addGoStatus(STATUS_BAR_ITEM_NAME);
	let missing: Tool[] | null = null;
	try {
		missing = await tm.getMissingTools((tool: Tool) => {
			return tool.isImportant;
		}); // expect gopls and a linter.
	} catch (e) {
		// ignore.
	}

	if (missing === null) {
		statusBarItem.severity = vscode.LanguageStatusSeverity.Error;
		statusBarItem.detail = 'failed to compute missing tools';
		statusBarItem.command = {
			command: 'go.tools.install',
			title: 'Retry',
			tooltip: 'Install/Update Tools'
		};
		return;
	} else if (missing.length === 0) {
		statusBarItem.severity = vscode.LanguageStatusSeverity.Information;
		statusBarItem.detail = 'no missing tools';
		statusBarItem.command = {
			command: 'go.tools.install',
			title: 'Update',
			tooltip: 'Install/Update Tools'
		};
		return;
	} else {
		statusBarItem.severity = vscode.LanguageStatusSeverity.Error;
		statusBarItem.detail = `missing ${missing.map((tool) => tool.name).join(',')}`;
		statusBarItem.command = {
			command: 'go.tools.install',
			arguments: missing.map((tool) => tool.name),
			title: 'Install missing tools',
			tooltip: `Install ${missing.join(',')}`
		};
	}
}

// getMissingTools returns missing tools.
// If matcher is provided, only the tools that match the filter will be checked.
function getMissingTools(matcher?: (value: Tool) => boolean): Promise<Tool[]> {
	let keys = getConfiguredTools(getGoConfig(), getGoplsConfig());
	if (matcher) {
		keys = keys.filter(matcher);
	}
	return Promise.all(
		keys.map(
			(tool) =>
				new Promise<Tool | null>((resolve, reject) => {
					const toolPath = getBinPath(tool.name);
					resolve(path.isAbsolute(toolPath) ? null : tool);
				})
		)
	).then((res) => {
		return res.filter((x): x is Tool => x != null);
	});
}

let suggestedDownloadGo = false;

async function suggestDownloadGo() {
	const msg =
		`Failed to find the "go" binary in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()}). ` +
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
			{
				env,
				cwd: tmpDir
			}
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
async function defaultInspectGoToolVersion(
	binPath: string
): Promise<{ goVersion?: string; moduleVersion?: string; debugInfo?: string }> {
	const goCmd = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	let debugInfo = 'go version -m failed';
	try {
		const { stdout } = await execFile(goCmd, ['version', '-m', binPath]);
		debugInfo = stdout;
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

		   if the binary was built with a dev version of go, in module mode.
			/Users/hakim/go/bin/gopls: devel go1.21-41f485b9a7 Mon Jan 31 13:43:52 2022 +0000
			path    golang.org/x/tools/gopls
			mod     golang.org/x/tools/gopls        v0.8.0-pre.1    h1:6iHi9bCJ8XndQtBEFFG/DX+eTJrf2lKFv4GI3zLeDOo=
			...
		*/
		const lines = stdout.split('\n', 3);
		const goVersion = lines[0] && lines[0].match(/\s+(go\d+.\d+\S*)/)?.[1];
		const moduleVersion = lines[2].split(/\s+/)[3];
		return { goVersion, moduleVersion };
	} catch (e) {
		// either go version failed (e.g. the tool was compiled with a more recent version of go)
		// or stdout is not in the expected format.
		return { debugInfo };
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

export async function suggestUpdates() {
	const configuredGoVersion = await getGoVersion();
	if (!configuredGoVersion || configuredGoVersion.lt('1.19')) {
		// User is using an ancient or a dev version of go. Don't suggest updates -
		// user should know what they are doing.
		return;
	}

	const allTools = getConfiguredTools(getGoConfig(), getGoplsConfig());
	const toolsToUpdate = await listOutdatedTools(configuredGoVersion, allTools);
	if (toolsToUpdate.length === 0) {
		return;
	}

	// If the user has opted in to automatic tool updates, we can update
	// without prompting.
	const toolsManagementConfig = getGoConfig()['toolsManagement'];
	if (toolsManagementConfig && toolsManagementConfig['autoUpdate'] === true) {
		installTools(toolsToUpdate, configuredGoVersion, { silent: true });
	} else {
		const updateToolsCmdText = 'Update tools';
		const selected = await vscode.window.showWarningMessage(
			`Tools (${toolsToUpdate.map((tool) => tool.name).join(', ')}) need recompiling to work with ${
				configuredGoVersion.version
			}`,
			updateToolsCmdText
		);
		if (selected === updateToolsCmdText) {
			installTools(toolsToUpdate, configuredGoVersion);
		}
	}
}

// exported for testing
export async function listOutdatedTools(configuredGoVersion: GoVersion | undefined, allTools: Tool[]): Promise<Tool[]> {
	if (!configuredGoVersion || !configuredGoVersion.sv) {
		return [];
	}

	const { major, minor } = configuredGoVersion.sv;

	const oldTools = await Promise.all(
		allTools.map(async (tool) => {
			const toolPath = getBinPath(tool.name);
			if (!path.isAbsolute(toolPath)) {
				return;
			}
			const m = await inspectGoToolVersion(toolPath);
			if (!m) {
				console.log(`failed to get go tool version: ${toolPath}`);
				return;
			}
			const { goVersion } = m;
			if (!goVersion) {
				// TODO: we cannot tell whether the tool was compiled with a newer version of go
				// or compiled in an unconventional way.
				return;
			}
			const toolGoVersion = new GoVersion('', `go version ${goVersion} os/arch`);
			if (!toolGoVersion || !toolGoVersion.sv) {
				return tool;
			}
			if (
				major > toolGoVersion.sv.major ||
				(major === toolGoVersion.sv.major && minor > toolGoVersion.sv.minor)
			) {
				return tool;
			}
			// special case: if the tool was compiled with beta or rc, and the current
			// go version is a stable version, let's ask to recompile.
			if (
				major === toolGoVersion.sv.major &&
				minor === toolGoVersion.sv.minor &&
				(goVersion.includes('beta') || goVersion.includes('rc')) &&
				// We assume tools compiled with different rc/beta need to be recompiled.
				// We test the inequality by checking whether the exact beta or rc version
				// appears in the `go version` output. e.g.,
				//   configuredGoVersion.version      	goVersion(tool)		update
				//   'go version go1.21 ...'    		'go1.21beta1'		Yes
				//   'go version go1.21beta1 ...'		'go1.21beta1'		No
				//   'go version go1.21beta2 ...'		'go1.21beta1'		Yes
				//   'go version go1.21rc1 ...'			'go1.21beta1'		Yes
				//   'go version go1.21rc1 ...'			'go1.21'			No
				//   'go version devel go1.21-deadbeaf ...'	'go1.21beta1'	No (* rare)
				!configuredGoVersion.version.includes(goVersion)
			) {
				return tool;
			}
			return;
		})
	);
	return oldTools.filter((tool): tool is Tool => !!tool);
}

// maybeInstallVSCGO is a special program released and installed with the Go extension.
// Unlike other tools, it is installed under the extension path (which is cleared
// when a new version is installed).
export async function maybeInstallVSCGO(
	extensionMode: vscode.ExtensionMode,
	extensionId: string,
	extensionVersion: string,
	extensionPath: string,
	isPreview: boolean
): Promise<string> {
	// golang.go stable, golang.go-nightly stable -> install once per version.
	// golang.go dev through launch.json -> install every time.
	const progPath = path.join(extensionPath, 'bin', correctBinname('vscgo'));

	if (extensionMode === vscode.ExtensionMode.Production && executableFileExists(progPath)) {
		return progPath; // reuse existing executable.
	}
	telemetryReporter.add('vscgo_install', 1);
	const mkdir = util.promisify(fs.mkdir);
	await mkdir(path.dirname(progPath), { recursive: true });
	const execFile = util.promisify(cp.execFile);

	const cwd = path.join(extensionPath);
	const env = toolExecutionEnvironment();
	env['GOBIN'] = path.dirname(progPath);

	const importPath = allToolsInformation['vscgo'].importPath;
	const version =
		extensionMode !== vscode.ExtensionMode.Production
			? ''
			: extensionId !== 'golang.go' || isPreview
			? '@master'
			: `@v${extensionVersion}`;
	// build from source acquired from the module proxy if this is a non-preview version.
	try {
		const args = ['install', '-trimpath', `${importPath}${version}`];
		console.log(`installing vscgo: ${args.join(' ')}`);
		await execFile(getBinPath('go'), args, { cwd, env });
		return progPath;
	} catch (e) {
		telemetryReporter.add('vscgo_install_fail', 1);
		return Promise.reject(`failed to install vscgo - ${e}`);
	}
}
