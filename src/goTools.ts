/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import moment = require('moment');
import path = require('path');
import semver = require('semver');
import util = require('util');
import { getFormatTool, usingCustomFormatTool } from './goFormat';
import { goLiveErrorsEnabled } from './goLiveErrors';
import { getBinPath, GoVersion } from './util';

export interface Tool {
	name: string;
	importPath: string;
	modulePath: string;
	isImportant: boolean;
	replacedByGopls?: boolean;
	description: string;

	// If true, consider prerelease version in preview mode
	// (nightly & dev)
	usePrereleaseInPreviewMode?: boolean;
	// If set, this string will be used when installing the tool
	// instead of the default 'latest'. It can be used when
	// we need to pin a tool version (`deadbeaf`) or to use
	// a dev version available in a branch (e.g. `master`).
	defaultVersion?: string;

	// latestVersion and latestVersionTimestamp are hardcoded default values
	// for the last known version of the given tool. We also hardcode values
	// for the latest known pre-release of the tool for the Nightly extension.
	latestVersion?: semver.SemVer;
	latestVersionTimestamp?: moment.Moment;
	latestPrereleaseVersion?: semver.SemVer;
	latestPrereleaseVersionTimestamp?: moment.Moment;

	// minimumGoVersion and maximumGoVersion set the range for the versions of
	// Go with which this tool can be used.
	minimumGoVersion?: semver.SemVer;
	maximumGoVersion?: semver.SemVer;

	// close performs any shutdown tasks that a tool must execute before a new
	// version is installed. It returns a string containing an error message on
	// failure.
	close?: (env: NodeJS.Dict<string>) => Promise<string>;
}

/**
 * ToolAtVersion is a Tool at a specific version.
 * Lack of version implies the latest version.
 */
export interface ToolAtVersion extends Tool {
	version?: semver.SemVer;
}

/**
 * Returns the import path for a given tool, at a given Go version.
 * @param tool 		Object of type `Tool` for the Go tool.
 * @param goVersion The current Go version.
 */
export function getImportPath(tool: Tool, goVersion: GoVersion): string {
	// For older versions of Go, install the older version of gocode.
	if (tool.name === 'gocode' && goVersion.lt('1.10')) {
		return 'github.com/nsf/gocode';
	}
	return tool.importPath;
}

export function getImportPathWithVersion(
	tool: Tool,
	version: semver.SemVer | string | undefined,
	goVersion: GoVersion
): string {
	const importPath = getImportPath(tool, goVersion);
	if (version) {
		if (version instanceof semver.SemVer) {
			return importPath + '@v' + version;
		} else {
			return importPath + '@' + version;
		}
	}
	return importPath;
}

export function containsTool(tools: Tool[], tool: Tool): boolean {
	return tools.indexOf(tool) > -1;
}

export function containsString(tools: Tool[], toolName: string): boolean {
	return tools.some((tool) => tool.name === toolName);
}

export function getTool(name: string): Tool {
	return allToolsInformation[name];
}

export function getToolAtVersion(name: string, version?: semver.SemVer): ToolAtVersion {
	return { ...allToolsInformation[name], version };
}

// hasModSuffix returns true if the given tool has a different, module-specific
// name to avoid conflicts.
export function hasModSuffix(tool: Tool): boolean {
	return tool.name.endsWith('-gomod');
}

export function isGocode(tool: Tool): boolean {
	return tool.name === 'gocode' || tool.name === 'gocode-gomod';
}

export function getConfiguredTools(
	goVersion: GoVersion,
	goConfig: { [key: string]: any },
	goplsConfig: { [key: string]: any }
): Tool[] {
	// If language server is enabled, don't suggest tools that are replaced by gopls.
	// TODO(github.com/golang/vscode-go/issues/388): decide what to do when
	// the go version is no longer supported by gopls while the legacy tools are
	// no longer working (or we remove the legacy language feature providers completely).
	const useLanguageServer = goConfig['useLanguageServer'] && goVersion.gt('1.11');

	const tools: Tool[] = [];
	function maybeAddTool(name: string) {
		const tool = allToolsInformation[name];
		if (tool) {
			if (!useLanguageServer || !tool.replacedByGopls) {
				tools.push(tool);
			}
		}
	}

	// Start with default tools that should always be installed.
	for (const name of [
		'gocode',
		'gopkgs',
		'go-outline',
		'go-symbols',
		'guru',
		'gorename',
		'gotests',
		'gomodifytags',
		'impl',
		'fillstruct',
		'goplay',
		'godoctor'
	]) {
		maybeAddTool(name);
	}

	// Check if the system supports dlv, i.e. is 64-bit.
	// There doesn't seem to be a good way to check if the mips and s390
	// families are 64-bit, so just try to install it and hope for the best.
	if (process.arch.match(/^(arm64|mips|mipsel|ppc64|s390|s390x|x64)$/)) {
		maybeAddTool('dlv');
	}

	// gocode-gomod needed in go 1.11 & higher
	if (goVersion.gt('1.10')) {
		maybeAddTool('gocode-gomod');
	}

	// Add the doc/def tool that was chosen by the user.
	switch (goConfig['docsTool']) {
		case 'godoc':
			maybeAddTool('godef');
			break;
		default:
			maybeAddTool(goConfig['docsTool']);
			break;
	}

	// Only add format tools if the language server is disabled and the
	// format tool is known to us.
	if (goConfig['useLanguageServer'] === false && !usingCustomFormatTool(goConfig)) {
		maybeAddTool(getFormatTool(goConfig));
	}

	// Add the linter that was chosen by the user, but don't add staticcheck
	// if it is enabled via gopls.
	const goplsStaticheckEnabled = useLanguageServer && goplsStaticcheckEnabled(goConfig, goplsConfig);
	if (goConfig['lintTool'] !== 'staticcheck' || !goplsStaticheckEnabled) {
		maybeAddTool(goConfig['lintTool']);
	}

	// Add the language server if the user has chosen to do so.
	// Even though we arranged this to run after the first attempt to start gopls
	// this is still useful if we've fail to start gopls.
	if (useLanguageServer) {
		maybeAddTool('gopls');
	}

	if (goLiveErrorsEnabled()) {
		maybeAddTool('gotype-live');
	}

	return tools;
}

export function goplsStaticcheckEnabled(
	goConfig: { [key: string]: any },
	goplsConfig: { [key: string]: any }
): boolean {
	if (goConfig['useLanguageServer'] !== true || goplsConfig['ui.diagnostic.staticcheck'] !== true) {
		return false;
	}
	const features = goConfig['languageServerExperimentalFeatures'];
	return !features || features['diagnostics'] === true;
}

export const allToolsInformation: { [key: string]: Tool } = {
	'gocode': {
		name: 'gocode',
		importPath: 'github.com/mdempsky/gocode',
		modulePath: 'github.com/mdempsky/gocode',
		isImportant: true,
		replacedByGopls: true,
		description: 'Auto-completion, does not work with modules',
		close: async (env: NodeJS.Dict<string>): Promise<string> => {
			const toolBinPath = getBinPath('gocode');
			if (!path.isAbsolute(toolBinPath)) {
				return '';
			}
			try {
				const execFile = util.promisify(cp.execFile);
				const { stderr } = await execFile(toolBinPath, ['close'], { env, timeout: 10000 }); // give 10sec.
				if (stderr.indexOf("rpc: can't find service Server.") > -1) {
					return 'Installing gocode aborted as existing process cannot be closed. Please kill the running process for gocode and try again.';
				}
			} catch (err) {
				// This may fail if gocode isn't already running.
				console.log(`gocode close failed: ${err}`);
			}
			return '';
		}
	},
	'gocode-gomod': {
		name: 'gocode-gomod',
		importPath: 'github.com/stamblerre/gocode',
		modulePath: 'github.com/stamblerre/gocode',
		isImportant: true,
		replacedByGopls: true,
		description: 'Auto-completion, works with modules',
		minimumGoVersion: semver.coerce('1.11')
	},
	'gopkgs': {
		name: 'gopkgs',
		importPath: 'github.com/uudashr/gopkgs/v2/cmd/gopkgs',
		modulePath: 'github.com/uudashr/gopkgs/v2',
		replacedByGopls: false, // TODO(github.com/golang/vscode-go/issues/258): disable Add Import command.
		isImportant: true,
		description: 'Auto-completion of unimported packages & Add Import feature'
	},
	'go-outline': {
		name: 'go-outline',
		importPath: 'github.com/ramya-rao-a/go-outline',
		modulePath: 'github.com/ramya-rao-a/go-outline',
		replacedByGopls: false, // TODO(github.com/golang/vscode-go/issues/1020): replace with Gopls.
		isImportant: true,
		description: 'Go to symbol in file' // GoDocumentSymbolProvider, used by 'run test' codelens
	},
	'go-symbols': {
		name: 'go-symbols',
		importPath: 'github.com/acroca/go-symbols',
		modulePath: 'github.com/acroca/go-symbols',
		replacedByGopls: true,
		isImportant: false,
		description: 'Go to symbol in workspace'
	},
	'guru': {
		name: 'guru',
		importPath: 'golang.org/x/tools/cmd/guru',
		modulePath: 'golang.org/x/tools',
		replacedByGopls: true,
		isImportant: false,
		description: 'Find all references and Go to implementation of symbols'
	},
	'gorename': {
		name: 'gorename',
		importPath: 'golang.org/x/tools/cmd/gorename',
		modulePath: 'golang.org/x/tools',
		replacedByGopls: true,
		isImportant: false,
		description: 'Rename symbols'
	},
	'gomodifytags': {
		name: 'gomodifytags',
		importPath: 'github.com/fatih/gomodifytags',
		modulePath: 'github.com/fatih/gomodifytags',
		replacedByGopls: false,
		isImportant: false,
		description: 'Modify tags on structs'
	},
	'goplay': {
		name: 'goplay',
		importPath: 'github.com/haya14busa/goplay/cmd/goplay',
		modulePath: 'github.com/haya14busa/goplay',
		replacedByGopls: false,
		isImportant: false,
		description: 'The Go playground'
	},
	'impl': {
		name: 'impl',
		importPath: 'github.com/josharian/impl',
		modulePath: 'github.com/josharian/impl',
		replacedByGopls: false,
		isImportant: false,
		description: 'Stubs for interfaces'
	},
	'gotype-live': {
		name: 'gotype-live',
		importPath: 'github.com/tylerb/gotype-live',
		modulePath: 'github.com/tylerb/gotype-live',
		replacedByGopls: true, // TODO(github.com/golang/vscode-go/issues/1021): recommend users to turn off.
		isImportant: false,
		description: 'Show errors as you type'
	},
	'godef': {
		name: 'godef',
		importPath: 'github.com/rogpeppe/godef',
		modulePath: 'github.com/rogpeppe/godef',
		replacedByGopls: true,
		isImportant: true,
		description: 'Go to definition'
	},
	'gogetdoc': {
		name: 'gogetdoc',
		importPath: 'github.com/zmb3/gogetdoc',
		modulePath: 'github.com/zmb3/gogetdoc',
		replacedByGopls: true,
		isImportant: true,
		description: 'Go to definition & text shown on hover'
	},
	'gofumports': {
		name: 'gofumports',
		importPath: 'mvdan.cc/gofumpt/gofumports',
		modulePath: 'mvdan.cc/gofumpt',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter'
	},
	'gofumpt': {
		name: 'gofumpt',
		importPath: 'mvdan.cc/gofumpt',
		modulePath: 'mvdan.cc/gofumpt',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter'
	},
	'goimports': {
		name: 'goimports',
		importPath: 'golang.org/x/tools/cmd/goimports',
		modulePath: 'golang.org/x/tools',
		replacedByGopls: true,
		isImportant: true,
		description: 'Formatter'
	},
	'goreturns': {
		name: 'goreturns',
		importPath: 'github.com/sqs/goreturns',
		modulePath: 'github.com/sqs/goreturns',
		replacedByGopls: true,
		isImportant: true,
		description: 'Formatter'
	},
	'goformat': {
		name: 'goformat',
		importPath: 'winterdrache.de/goformat/goformat',
		modulePath: 'winterdrache.de/goformat/goformat',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter'
	},
	'gotests': {
		name: 'gotests',
		importPath: 'github.com/cweill/gotests/gotests',
		modulePath: 'github.com/cweill/gotests',
		replacedByGopls: false,
		isImportant: false,
		description: 'Generate unit tests',
		minimumGoVersion: semver.coerce('1.9')
	},
	// TODO(github.com/golang/vscode-go/issues/189): consider disabling lint when gopls is turned on.
	'golint': {
		name: 'golint',
		importPath: 'golang.org/x/lint/golint',
		modulePath: 'golang.org/x/lint',
		replacedByGopls: false,
		isImportant: false,
		description: 'Linter',
		minimumGoVersion: semver.coerce('1.9')
	},
	'staticcheck': {
		name: 'staticcheck',
		importPath: 'honnef.co/go/tools/cmd/staticcheck',
		modulePath: 'honnef.co/go/tools',
		replacedByGopls: false,
		isImportant: true,
		description: 'Linter'
	},
	'golangci-lint': {
		name: 'golangci-lint',
		importPath: 'github.com/golangci/golangci-lint/cmd/golangci-lint',
		modulePath: 'github.com/golangci/golangci-lint',
		replacedByGopls: false,
		isImportant: true,
		description: 'Linter'
	},
	'revive': {
		name: 'revive',
		importPath: 'github.com/mgechev/revive',
		modulePath: 'github.com/mgechev/revive',
		isImportant: true,
		description: 'Linter'
	},
	'gopls': {
		name: 'gopls',
		importPath: 'golang.org/x/tools/gopls',
		modulePath: 'golang.org/x/tools/gopls',
		replacedByGopls: false, // lol
		isImportant: true,
		description: 'Language Server from Google',
		usePrereleaseInPreviewMode: true,
		minimumGoVersion: semver.coerce('1.12'),
		latestVersion: semver.coerce('0.6.8'),
		latestVersionTimestamp: moment('2021-03-17', 'YYYY-MM-DD'),
		latestPrereleaseVersion: semver.coerce('0.6.8'),
		latestPrereleaseVersionTimestamp: moment('2021-03-17', 'YYYY-MM-DD')
	},
	'dlv': {
		name: 'dlv',
		importPath: 'github.com/go-delve/delve/cmd/dlv',
		modulePath: 'github.com/go-delve/delve',
		replacedByGopls: false,
		isImportant: true,
		description: 'Go debugger (Delve)'
	},
	'dlv-dap': {
		name: 'dlv-dap',
		importPath: 'github.com/go-delve/delve/cmd/dlv',
		modulePath: 'github.com/go-delve/delve',
		replacedByGopls: false,
		isImportant: false,
		description: 'Go debugger (Delve built for DAP experiment)',
		defaultVersion: 'master', // Always build from the master.
		minimumGoVersion: semver.coerce('1.14'), // last 3 versions per delve policy
		latestVersion: semver.parse('v1.6.1-0.20210224092741-5360c6286949'),
		latestVersionTimestamp: moment('2021-02-24', 'YYYY-MM-DD')
	},
	'fillstruct': {
		name: 'fillstruct',
		importPath: 'github.com/davidrjenni/reftools/cmd/fillstruct',
		modulePath: 'github.com/davidrjenni/reftools',
		replacedByGopls: true,
		isImportant: false,
		description: 'Fill structs with defaults'
	},
	'godoctor': {
		name: 'godoctor',
		importPath: 'github.com/godoctor/godoctor',
		modulePath: 'github.com/godoctor/godoctor',
		replacedByGopls: true,
		isImportant: false,
		description: 'Extract to functions and variables'
	}
};
