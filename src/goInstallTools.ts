/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import path = require('path');
import { SemVer } from 'semver';
import util = require('util');
import vscode = require('vscode');
import { toolExecutionEnvironment, toolInstallationEnvironment } from './goEnv';
import { addGoRuntimeBaseToPATH, clearGoRuntimeBaseFromPATH, initGoStatusBar } from './goEnvironmentStatus';
import { getLanguageServerToolPath } from './goLanguageServer';
import { restartLanguageServer } from './goMain';
import { hideGoStatus, outputChannel, showGoStatus } from './goStatus';
import {
	containsTool,
	disableModulesForWildcard,
	getConfiguredTools,
	getImportPath,
	getImportPathWithVersion,
	getTool,
	hasModSuffix,
	Tool,
	ToolAtVersion,
} from './goTools';
import { getFromWorkspaceState } from './stateUtils';
import {
	getBinPath,
	getBinPathWithExplanation,
	getGoConfig,
	getGoVersion,
	getTempFilePath,
	getWorkspaceFolderPath,
	GoVersion,
	rmdirRecursive,
} from './util';
import { envPath, getCurrentGoRoot, getToolFromToolPath, setCurrentGoRoot } from './utils/pathUtils';

// declinedUpdates tracks the tools that the user has declined to update.
const declinedUpdates: Tool[] = [];

// declinedUpdates tracks the tools that the user has declined to install.
const declinedInstalls: Tool[] = [];

export async function installAllTools(updateExistingToolsOnly: boolean = false) {
	const goVersion = await getGoVersion();
	let allTools = getConfiguredTools(goVersion);

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
	await installTools(selected.map((x) => getTool(x.label)), goVersion);
}

/**
 * Installs given array of missing tools. If no input is given, the all tools are installed
 *
 * @param missing array of tool names and optionally, their versions to be installed.
 *                If a tool's version is not specified, it will install the latest.
 * @param goVersion version of Go that affects how to install the tool. (e.g. modules vs legacy GOPATH mode)
 */
export async function installTools(missing: ToolAtVersion[], goVersion: GoVersion): Promise<void> {
	if (!missing) {
		return;
	}

	outputChannel.show();
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
		const p = toolsGopath.split(path.delimiter).map((e) => path.join(e, 'bin')).join(path.delimiter);
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

	const toInstall: Promise<{ tool: Tool, reason: string }>[] = [];
	for (const tool of missing) {
		// Disable modules for tools which are installed with the "..." wildcard.
		const modulesOffForTool = modulesOff || disableModulesForWildcard(tool, goVersion);

		const reason = installTool(tool, goVersion, envForTools, !modulesOffForTool);
		toInstall.push(Promise.resolve({ tool, reason: await reason }));
	}

	const results = await Promise.all(toInstall);

	const failures: { tool: ToolAtVersion, reason: string }[] = [];
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
		outputChannel.appendLine(failures.length + ' tools failed to install.\n');
		for (const failure of failures) {
			outputChannel.appendLine(`${failure.tool.name}: ${failure.reason} `);
		}
	}
}

export async function installTool(
	tool: ToolAtVersion, goVersion: GoVersion,
	envForTools: NodeJS.Dict<string>, modulesOn: boolean): Promise<string> {
	// Some tools may have to be closed before we reinstall them.
	if (tool.close) {
		const reason = await tool.close(envForTools);
		if (reason) {
			return reason;
		}
	}
	// Install tools in a temporary directory, to avoid altering go.mod files.
	const mkdtemp = util.promisify(fs.mkdtemp);
	const toolsTmpDir = await mkdtemp(getTempFilePath('go-tools-'));
	const env = Object.assign({}, envForTools);
	let tmpGoModFile: string;
	if (modulesOn) {
		env['GO111MODULE'] = 'on';

		// Write a temporary go.mod file to avoid version conflicts.
		tmpGoModFile = path.join(toolsTmpDir, 'go.mod');
		const writeFile = util.promisify(fs.writeFile);
		await writeFile(tmpGoModFile, 'module tools');
	} else {
		envForTools['GO111MODULE'] = 'off';
	}

	// Build the arguments list for the tool installation.
	const args = ['get', '-v'];
	// Only get tools at master if we are not using modules.
	if (!modulesOn) {
		args.push('-u');
	}
	// Tools with a "mod" suffix should not be installed,
	// instead we run "go build -o" to rename them.
	if (hasModSuffix(tool)) {
		args.push('-d');
	}
	let importPath: string;
	if (!modulesOn) {
		importPath = getImportPath(tool, goVersion);
	} else {
		importPath = getImportPathWithVersion(tool, tool.version, goVersion);
	}
	args.push(importPath);

	const toolImportPath = tool.version ? importPath + '@' + tool.version : importPath;

	let output: string;
	let result: string = '';
	try {
		const opts = {
			env,
			cwd: toolsTmpDir,
		};
		const execFile = util.promisify(cp.execFile);
		const { stdout, stderr } = await execFile(goVersion.binaryPath, args, opts);
		output = `${stdout} ${stderr}`;

		// TODO(rstambler): Figure out why this happens and maybe delete it.
		if (stderr.indexOf('unexpected directory layout:') > -1) {
			await execFile(goVersion.binaryPath, args, opts);
		} else if (hasModSuffix(tool)) {
			const gopath = env['GOPATH'];
			if (!gopath) {
				return `GOPATH not configured in environment`;
			}
			const destDir = gopath.split(path.delimiter)[0];
			const outputFile = path.join(destDir, 'bin', process.platform === 'win32' ? `${tool.name}.exe` : tool.name);
			await execFile(goVersion.binaryPath, ['build', '-o', outputFile, importPath], opts);
		}
		const toolInstallPath = getBinPath(tool.name);
		outputChannel.appendLine(`Installing ${toolImportPath} (${toolInstallPath}) SUCCEEDED`);
	} catch (e) {
		outputChannel.appendLine(`Installing ${toolImportPath} FAILED`);
		result = `failed to install ${tool.name}(${toolImportPath}): ${e} ${output} `;
	}

	// Delete the temporary installation directory.
	rmdirRecursive(toolsTmpDir);

	return result;
}

export async function promptForMissingTool(toolName: string) {
	const tool = getTool(toolName);

	// If user has declined to install this tool, don't prompt for it.
	if (containsTool(declinedInstalls, tool)) {
		return;
	}

	const goVersion = await getGoVersion();
	if (!goVersion) {
		return;
	}

	// Show error messages for outdated tools or outdated Go versions.
	if (tool.minimumGoVersion && goVersion.lt(tool.minimumGoVersion.format())) {
		vscode.window.showInformationMessage(`You are using go${goVersion.format()}, but ${tool.name} requires at least go${tool.minimumGoVersion.format()}.`);
		return;
	}
	if (tool.maximumGoVersion && goVersion.gt(tool.maximumGoVersion.format())) {
		vscode.window.showInformationMessage(`You are using go${goVersion.format()}, but ${tool.name} only supports go${tool.maximumGoVersion.format()} and below.`);
		return;
	}

	const installOptions = ['Install'];
	let missing = await getMissingTools(goVersion);
	if (!containsTool(missing, tool)) {
		return;
	}
	missing = missing.filter((x) => x === tool || tool.isImportant);
	if (missing.length > 1) {
		// Offer the option to install all tools.
		installOptions.push('Install All');
	}
	const msg = `The "${tool.name}" command is not available.
Run "go get -v ${getImportPath(tool, goVersion)}" to install.`;
	const selected = await vscode.window.showInformationMessage(msg, ...installOptions);
	switch (selected) {
		case 'Install':
			await installTools([tool], goVersion);
			break;
		case 'Install All':
			await installTools(missing, goVersion);
			hideGoStatus();
			break;
		default:
			// The user has declined to install this tool.
			declinedInstalls.push(tool);
			break;
	}
}

export async function promptForUpdatingTool(toolName: string, newVersion?: SemVer) {
	const tool = getTool(toolName);
	const toolVersion = { ...tool, version: newVersion }; // ToolWithVersion

	// If user has declined to update, then don't prompt.
	if (containsTool(declinedUpdates, tool)) {
		return;
	}
	const goVersion = await getGoVersion();
	let updateMsg = `Your version of ${tool.name} appears to be out of date. Please update for an improved experience.`;
	const choices: string[] = ['Update'];
	if (toolName === `gopls`) {
		choices.push('Release Notes');
	}
	if (newVersion) {
		updateMsg = `A new version of ${tool.name} (v${newVersion}) is available. Please update for an improved experience.`;
	}
	const selected = await vscode.window.showInformationMessage(updateMsg, ...choices);
	switch (selected) {
		case 'Update':
			await installTools([toolVersion], goVersion);
			break;
		case 'Release Notes':
			vscode.commands.executeCommand(
				'vscode.open',
				vscode.Uri.parse(`https://github.com/golang/tools/releases/tag/${tool.name}/v${newVersion}`)
			);
			break;
		default:
			declinedUpdates.push(tool);
			break;
	}
}

export function updateGoVarsFromConfig(): Promise<void> {
	const {binPath, why} = getBinPathWithExplanation('go', false);
	const goRuntimePath = binPath;

	if (!goRuntimePath || !path.isAbsolute(goRuntimePath)) {
		// getBinPath returns the absolute path to the tool if it exists.
		// Otherwise, it may return the tool name (e.g. 'go').
		suggestDownloadGo();
		return Promise.reject();
	}

	return new Promise<void>((resolve, reject) => {
		cp.execFile(goRuntimePath,
			['env', 'GOPATH', 'GOROOT', 'GOPROXY', 'GOBIN', 'GOMODCACHE'],
			{ env: toolExecutionEnvironment(), cwd: getWorkspaceFolderPath() },
			(err, stdout, stderr) => {
				if (err || stderr) {
					outputChannel.append(`Failed to run '${goRuntimePath} env: ${err}\n${stderr}`);
					outputChannel.show();

					vscode.window.showErrorMessage(`Failed to run '${goRuntimePath} env. The config change may not be applied correctly.`);
					return reject();
				}
				const envOutput = stdout.split('\n');
				if (!process.env['GOPATH'] && envOutput[0].trim()) {
					process.env['GOPATH'] = envOutput[0].trim();
				}
				if (envOutput[1] && envOutput[1].trim()) {
					setCurrentGoRoot(envOutput[1].trim());
				}
				if (!process.env['GOPROXY'] && envOutput[2] && envOutput[2].trim()) {
					process.env['GOPROXY'] = envOutput[2].trim();
				}
				if (!process.env['GOBIN'] && envOutput[3] && envOutput[3].trim()) {
					process.env['GOBIN'] = envOutput[3].trim();
				}
				if (!process.env['GOMODCACHE'] && envOutput[4] && envOutput[4].trim()) {
					process.env['GOMODCACHE'] = envOutput[4].trim();
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
			});
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
		showGoStatus('Analysis Tools Missing', 'go.promptforinstall', 'Not all Go tools are available on the GOPATH');
		vscode.commands.registerCommand('go.promptforinstall', () => {
			const installItem = {
				title: 'Install',
				async command() {
					hideGoStatus();
					await installTools(missing, goVersion);
				}
			};
			const showItem = {
				title: 'Show',
				command() {
					outputChannel.clear();
					outputChannel.appendLine('Below tools are needed for the basic features of the Go extension.');
					missing.forEach((x) => outputChannel.appendLine(x.name));
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
						hideGoStatus();
					}
				});
		});
	}

	const usingSourceGraph = getToolFromToolPath(getLanguageServerToolPath()) === 'go-langserver';
	if (usingSourceGraph && goVersion.gt('1.10')) {
		const promptMsg =
			'The language server from Sourcegraph is no longer under active development and it does not support Go modules as well. Please install and use the language server from Google or disable the use of language servers altogether.';
		const disableLabel = 'Disable language server';
		const installLabel = 'Install';
		const selected = await vscode.window.showInformationMessage(promptMsg, installLabel, disableLabel);
		if (selected === installLabel) {
			await installTools([getTool('gopls')], goVersion);
		} else if (selected === disableLabel) {
			const goConfig = getGoConfig();
			const inspectLanguageServerSetting = goConfig.inspect('useLanguageServer');
			if (inspectLanguageServerSetting.globalValue === true) {
				goConfig.update('useLanguageServer', false, vscode.ConfigurationTarget.Global);
			} else if (inspectLanguageServerSetting.workspaceFolderValue === true) {
				goConfig.update('useLanguageServer', false, vscode.ConfigurationTarget.WorkspaceFolder);
			}
		}
	}
}

function getMissingTools(goVersion: GoVersion): Promise<Tool[]> {
	const keys = getConfiguredTools(goVersion);
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
	if (suggestedDownloadGo) {
		vscode.window.showErrorMessage(
			`Failed to find the "go" binary in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath}).`
		);
		return;
	}

	const choice = await vscode.window.showErrorMessage(
		`Failed to find the "go" binary in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath}). ` +
		`Check PATH, or Install Go and reload the window.`,
		'Go to Download Page'
	);
	if (choice === 'Go to Download Page') {
		vscode.env.openExternal(vscode.Uri.parse('https://golang.org/dl/'));
	}
	suggestedDownloadGo = true;
}
