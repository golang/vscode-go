/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import moment = require('moment');
import semver = require('semver');
import { getFormatTool, usingCustomFormatTool } from './language/legacy/goFormat';
import { allToolsInformation } from './goToolsInformation';
import { GoVersion } from './util';

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
	latestVersion?: semver.SemVer | null;
	latestVersionTimestamp?: moment.Moment;
	latestPrereleaseVersion?: semver.SemVer | null;
	latestPrereleaseVersionTimestamp?: moment.Moment;

	// minimumGoVersion and maximumGoVersion set the range for the versions of
	// Go with which this tool can be used.
	minimumGoVersion?: semver.SemVer | null;
	maximumGoVersion?: semver.SemVer | null;

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

export function getImportPathWithVersion(
	tool: Tool,
	version: semver.SemVer | string | undefined | null,
	goVersion: GoVersion
): string {
	const importPath = tool.importPath;
	if (version) {
		if (version instanceof semver.SemVer) {
			return importPath + '@v' + version;
		} else {
			return importPath + '@' + version;
		}
	}
	if (tool.name === 'gopls') {
		if (goVersion.lt('1.19')) return importPath + '@v0.14.2';
		if (goVersion.lt('1.21')) return importPath + '@v0.15.3';
	}
	if (tool.name === 'dlv') {
		if (goVersion.lt('1.19')) return importPath + '@v1.20.2';
		if (goVersion.lt('1.21')) return importPath + '@v1.22.1';
	}
	if (tool.name === 'staticcheck') {
		if (goVersion.lt('1.19')) return importPath + '@v0.3.3';
		if (goVersion.lt('1.21')) return importPath + '@v0.4.7';
	}
	if (tool.name === 'gofumpt') {
		if (goVersion.lt('1.19')) return importPath + '@v0.4.0';
		if (goVersion.lt('1.20')) return importPath + '@v0.5.0';
		if (goVersion.lt('1.21')) return importPath + '@v0.6.0';
	}
	if (tool.name === 'golangci-lint') {
		if (goVersion.lt('1.20')) return importPath + '@v1.53.3';
		if (goVersion.lt('1.21')) return importPath + '@v1.55.2';
	}
	if (tool.defaultVersion) {
		return importPath + '@' + tool.defaultVersion;
	}
	return importPath + '@latest';
}

export function containsTool(tools: Tool[], tool: Tool): boolean {
	return tools.indexOf(tool) > -1;
}

export function containsString(tools: Tool[], toolName: string): boolean {
	return tools.some((tool) => tool.name === toolName);
}

export function getTool(name: string): Tool {
	const [n] = name.split('@');
	return allToolsInformation[n];
}

export function getToolAtVersion(name: string, version?: semver.SemVer): ToolAtVersion {
	return { ...allToolsInformation[name], version };
}

// hasModSuffix returns true if the given tool has a different, module-specific
// name to avoid conflicts.
export function hasModSuffix(tool: Tool): boolean {
	return tool.name.endsWith('-gomod');
}

export function getConfiguredTools(goConfig: { [key: string]: any }, goplsConfig: { [key: string]: any }): Tool[] {
	// If language server is enabled, don't suggest tools that are replaced by gopls.
	// TODO(github.com/golang/vscode-go/issues/388): decide what to do when
	// the go version is no longer supported by gopls while the legacy tools are
	// no longer working (or we remove the legacy language feature providers completely).
	const useLanguageServer = goConfig['useLanguageServer'];

	const tools: Tool[] = [];
	function maybeAddTool(name: string) {
		const tool = allToolsInformation[name];
		if (tool) {
			if (!useLanguageServer || !tool.replacedByGopls) {
				tools.push(tool);
			}
		}
	}

	// Add the language server if the user has chosen to do so.
	if (useLanguageServer) {
		maybeAddTool('gopls');
	}

	// Start with default tools that should always be installed.
	for (const name of ['gotests', 'gomodifytags', 'impl', 'goplay']) {
		maybeAddTool(name);
	}

	// Check if the system supports dlv, i.e. is 64-bit.
	// There doesn't seem to be a good way to check if the mips and s390
	// families are 64-bit, so just try to install it and hope for the best.
	if (process.arch.match(/^(mips|mipsel|ppc64|s390|s390x|x64|arm64)$/)) {
		maybeAddTool('dlv');
	}

	// Only add format tools if the language server is disabled or the
	// format tool is known to us.
	if (!useLanguageServer || usingCustomFormatTool(goConfig)) {
		maybeAddTool(getFormatTool(goConfig));
	}

	// Add the linter that was chosen by the user, but don't add staticcheck
	// if it is enabled via gopls.
	const goplsStaticheckEnabled = useLanguageServer && goplsStaticcheckEnabled(goConfig, goplsConfig);
	if (goConfig['lintTool'] !== 'staticcheck' || !goplsStaticheckEnabled) {
		maybeAddTool(goConfig['lintTool']);
	}
	return tools;
}

export function goplsStaticcheckEnabled(
	goConfig: { [key: string]: any },
	goplsConfig: { [key: string]: any }
): boolean {
	if (
		goplsConfig['ui.diagnostic.staticcheck'] === false ||
		(goplsConfig['ui.diagnostic.staticcheck'] === undefined && goplsConfig['staticcheck'] !== true)
	) {
		return false;
	}
	return true;
}
