/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as moment from 'moment';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { getFormatTool } from './language/legacy/goFormat';
import { allToolsInformation } from './goToolsInformation';
import { GoVersion } from './util';

export interface Tool {
	name: string;
	importPath: string;
	modulePath: string;
	isImportant: boolean;
	replacedByGopls?: boolean;
	description: string;

	// If true, consider prerelease version in prerelease mode
	// (prerelease & dev)
	usePrereleaseInPreviewMode?: boolean;
	// If set, this string will be used when installing the tool
	// instead of the default 'latest'. It can be used when
	// we need to pin a tool version (`deadbeef`) or to use
	// a dev version available in a branch (e.g. `master`).
	defaultVersion?: string;

	// latestVersion and latestVersionTimestamp are hardcoded default values
	// for the last known version of the given tool.
	latestVersion?: semver.SemVer | null;
	latestVersionTimestamp?: moment.Moment;

	// minimumGoVersion sets the minimum required version of Go
	// for the tool.
	minimumGoVersion?: semver.SemVer | null;
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
	goVersion: GoVersion // This is the Go version to build the project.
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
		if (goVersion.lt('1.19')) return importPath + '@v0.4.0'; // pre-go1.19
		if (goVersion.lt('1.20')) return importPath + '@v0.5.0'; // go1.19
		if (goVersion.lt('1.22')) return importPath + '@v0.6.0'; // go1.20~1.21
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

export function getTool(name: string): Tool | undefined {
	const [n] = name.split('@');
	return allToolsInformation.get(n);
}

export function getToolAtVersion(name: string, version?: semver.SemVer): ToolAtVersion {
	return { ...allToolsInformation.get(name)!, version };
}

// hasModSuffix returns true if the given tool has a different, module-specific
// name to avoid conflicts.
export function hasModSuffix(tool: Tool): boolean {
	return tool.name.endsWith('-gomod');
}

/**
 * getRequiredTools returns the tools that required explicitly by the user
 * through settings like "go.lintTool", "go.formatTool" and implicitly by the
 * extension's functionality like "goplay".
 *
 * Tools that is replaced by gopls will not be returned if gopls is enabled.
 */
export function getRequiredTools(goConfig: vscode.WorkspaceConfiguration): Tool[] {
	// If language server is enabled, don't suggest tools that are replaced by gopls.
	// TODO(github.com/golang/vscode-go/issues/388): decide what to do when
	// the go version is no longer supported by gopls while the legacy tools are
	// no longer working (or we remove the legacy language feature providers completely).
	const useLanguageServer = goConfig.get<boolean>('useLanguageServer');

	// The default tools that is required by the extension's functionality.
	const toolNames = new Set<string>(['gotests', 'gomodifytags', 'impl', 'goplay']);

	// Check if the system supports dlv, i.e. is 64-bit.
	// There doesn't seem to be a good way to check if the mips and s390
	// families are 64-bit, so just try to install it and hope for the best.
	if (process.arch.match(/^(mips|mipsel|ppc64|s390|s390x|x64|arm64)$/)) {
		toolNames.add('dlv');
	}

	// Configurable linter and formatter through "go.formatTool" and "go.lintTool".
	toolNames.add(getFormatTool(goConfig));
	const lintToolName = goConfig.get<string>('lintTool');
	if (lintToolName) {
		toolNames.add(lintToolName);
	}

	// Add the language server if the user has chosen to do so.
	if (useLanguageServer) {
		toolNames.add('gopls');
	}

	const tools: Tool[] = [];
	for (const name of toolNames) {
		const tool = allToolsInformation.get(name);
		if (!tool) {
			continue;
		}
		// If language server is enabled, filter out tools that are replaced by gopls.
		if (useLanguageServer && tool.replacedByGopls) {
			continue;
		}
		tools.push(tool);
	}
	return tools;
}
