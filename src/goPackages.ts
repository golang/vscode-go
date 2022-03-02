/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import path = require('path');
import { promisify } from 'util';
import vscode = require('vscode');
import { toolExecutionEnvironment } from './goEnv';
import { getBinPath, getCurrentGoPath } from './util';
import { envPath, fixDriveCasingInWindows, getCurrentGoRoot, getCurrentGoWorkspaceFromGOPATH } from './utils/pathUtils';

type GoListPkgsDone = (res: Map<string, PackageInfo>) => void;
interface Cache {
	entry: Map<string, PackageInfo>;
	lastHit: number;
}

export interface PackageInfo {
	name: string;
	isStd: boolean;
}

let goListPkgsNotified = false;
let cacheTimeout = 5000;

const goListPkgsSubscriptions: Map<string, GoListPkgsDone[]> = new Map<string, GoListPkgsDone[]>();
const goListPkgsRunning: Set<string> = new Set<string>();

const allPkgsCache: Map<string, Cache> = new Map<string, Cache>();

const pkgRootDirs = new Map<string, string>();

/**
 * goListPkgs collects package information for the transitive set of
 * package imports from workDir and all standard library packages using
 * the go list command.
 * @param workDir the current working directory.
 * @returns package path to PackageInfo map.
 */
async function goListPkgs(workDir?: string): Promise<Map<string, PackageInfo>> {
	const pkgs = new Map<string, PackageInfo>();

	if (workDir) {
		workDir = fixDriveCasingInWindows(workDir);
	}

	const goBin = getBinPath('go');
	if (!goBin) {
		vscode.window.showErrorMessage(
			`Failed to run "go list" to fetch packages as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath})`
		);
		return pkgs;
	}
	const t0 = Date.now();

	const args = ['list', '-e', '-f', '{{.Name}};{{.ImportPath}};{{.Dir}}', 'std', 'all'];
	const env = toolExecutionEnvironment();
	const execFile = promisify(cp.execFile);
	try {
		const { stdout, stderr } = await execFile(goBin, args, { env, cwd: workDir });
		if (stderr) {
			throw stderr;
		}
		const goroot = getCurrentGoRoot();
		stdout.split('\n').forEach((pkgDetail) => {
			if (!pkgDetail || !pkgDetail.trim() || pkgDetail.indexOf(';') === -1) {
				return;
			}
			const [pkgName, pkgPath, pkgDir] = pkgDetail.trim().split(';');
			const pkgDirNormalized = fixDriveCasingInWindows(pkgDir);
			// goListPkgs are used to retrieve packages importable from packages under workDir.
			// Vendored packages outside the workDir, thus, do not qualify.
			// (equivalent to `gopkgs -workDir`)
			// Remove vendored packages if it's outside the current workDir (e.g. vendor of Go project's src/ and src/cmd)
			if (workDir) {
				const vendorIdx = pkgDirNormalized.indexOf('/vendor/');
				if (
					vendorIdx !== -1 &&
					// Both workDir (from vscode file path) and pkgDir (from go list -f {{.Dir}}) are absolute.
					!workDir.startsWith(pkgDirNormalized.substring(0, vendorIdx))
				) {
					return;
				}
			}
			pkgs.set(pkgPath, {
				name: pkgName,
				isStd: goroot === null ? false : pkgDir.startsWith(goroot)
			});
		});
	} catch (err) {
		vscode.window.showErrorMessage(
			`Running go list failed with "${err}"\nCheck if you can run \`go ${args.join(
				' '
			)}\` in a terminal successfully.`
		);
	}
	const timeTaken = Date.now() - t0;
	cacheTimeout = timeTaken > 5000 ? timeTaken : 5000;
	return pkgs;
}

function getAllPackagesNoCache(workDir: string): Promise<Map<string, PackageInfo>> {
	return new Promise<Map<string, PackageInfo>>((resolve, reject) => {
		// Use subscription style to guard costly/long running invocation
		const callback = (pkgMap: Map<string, PackageInfo>) => {
			resolve(pkgMap);
		};

		let subs = goListPkgsSubscriptions.get(workDir);
		if (!subs) {
			subs = [];
			goListPkgsSubscriptions.set(workDir, subs);
		}
		subs.push(callback);

		// Ensure only single gokpgs running
		if (!goListPkgsRunning.has(workDir)) {
			goListPkgsRunning.add(workDir);

			goListPkgs(workDir).then((pkgMap) => {
				goListPkgsRunning.delete(workDir);
				goListPkgsSubscriptions.delete(workDir);
				subs.forEach((cb) => cb(pkgMap));
			});
		}
	});
}

/**
 * Runs `go list all std`
 * @argument workDir. The workspace directory of the project.
 * @returns Map<string, string> mapping between package import path and package name
 */
export async function getAllPackages(workDir: string): Promise<Map<string, PackageInfo>> {
	const cache = allPkgsCache.get(workDir);
	const useCache = cache && new Date().getTime() - cache.lastHit < cacheTimeout;
	if (useCache) {
		cache.lastHit = new Date().getTime();
		return Promise.resolve(cache.entry);
	}

	const pkgs = await getAllPackagesNoCache(workDir);
	if (!pkgs || pkgs.size === 0) {
		if (!goListPkgsNotified) {
			vscode.window.showInformationMessage(
				'Could not find packages. Ensure `go list -e -f {{.Name}};{{.ImportPath}}` runs successfully.'
			);
			goListPkgsNotified = true;
		}
	}
	allPkgsCache.set(workDir, {
		entry: pkgs,
		lastHit: new Date().getTime()
	});
	return pkgs;
}

/**
 * Returns mapping of import path and package name for packages that can be imported
 * Possible to return empty if useCache options is used.
 * @param filePath. Used to determine the right relative path for vendor pkgs
 * @param useCache. Force to use cache
 * @returns Map<string, string> mapping between package import path and package name
 */
export function getImportablePackages(filePath: string, useCache = false): Promise<Map<string, PackageInfo>> {
	filePath = fixDriveCasingInWindows(filePath);
	const fileDirPath = path.dirname(filePath);

	let foundPkgRootDir = pkgRootDirs.get(fileDirPath);
	const workDir = foundPkgRootDir || fileDirPath;
	const cache = allPkgsCache.get(workDir);

	const getAllPackagesPromise: Promise<Map<string, PackageInfo>> =
		useCache && cache ? Promise.race([getAllPackages(workDir), cache.entry]) : getAllPackages(workDir);

	return getAllPackagesPromise.then((pkgs) => {
		const pkgMap = new Map<string, PackageInfo>();
		if (!pkgs) {
			return pkgMap;
		}

		const currentWorkspace = getCurrentGoWorkspaceFromGOPATH(getCurrentGoPath(), fileDirPath);
		pkgs.forEach((info, pkgPath) => {
			if (info.name === 'main') {
				return;
			}

			if (!currentWorkspace) {
				pkgMap.set(pkgPath, info);
				return;
			}

			if (!foundPkgRootDir) {
				// try to guess package root dir
				const vendorIndex = pkgPath.indexOf('/vendor/');
				if (vendorIndex !== -1) {
					foundPkgRootDir = path.join(
						currentWorkspace,
						pkgPath.substring(0, vendorIndex).replace('/', path.sep)
					);
					pkgRootDirs.set(fileDirPath, foundPkgRootDir);
				}
			}

			const relativePkgPath = getRelativePackagePath(fileDirPath, currentWorkspace, pkgPath);
			if (!relativePkgPath) {
				return;
			}

			const allowToImport = isAllowToImportPackage(fileDirPath, currentWorkspace, relativePkgPath);
			if (allowToImport) {
				pkgMap.set(relativePkgPath, info);
			}
		});
		return pkgMap;
	});
}

/**
 * If given pkgPath is not vendor pkg, then the same pkgPath is returned
 * Else, the import path for the vendor pkg relative to given filePath is returned.
 */
function getRelativePackagePath(currentFileDirPath: string, currentWorkspace: string, pkgPath: string): string {
	let magicVendorString = '/vendor/';
	let vendorIndex = pkgPath.indexOf(magicVendorString);
	if (vendorIndex === -1) {
		magicVendorString = 'vendor/';
		if (pkgPath.startsWith(magicVendorString)) {
			vendorIndex = 0;
		}
	}
	// Check if current file and the vendor pkg belong to the same root project and not sub vendor
	// If yes, then vendor pkg can be replaced with its relative path to the "vendor" folder
	// If not, then the vendor pkg should not be allowed to be imported.
	if (vendorIndex > -1) {
		const rootProjectForVendorPkg = path.join(currentWorkspace, pkgPath.substr(0, vendorIndex));
		const relativePathForVendorPkg = pkgPath.substring(vendorIndex + magicVendorString.length);
		const subVendor = relativePathForVendorPkg.indexOf('/vendor/') !== -1;

		if (relativePathForVendorPkg && currentFileDirPath.startsWith(rootProjectForVendorPkg) && !subVendor) {
			return relativePathForVendorPkg;
		}
		return '';
	}

	return pkgPath;
}

const pkgToFolderMappingRegex = /ImportPath: (.*) FolderPath: (.*)/;
/**
 * Returns mapping between import paths and folder paths for all packages under given folder (vendor will be excluded)
 */
export function getNonVendorPackages(currentFolderPath: string, recursive = true): Promise<Map<string, string>> {
	const target = recursive ? './...' : '.'; // go list ./... excludes vendor dirs since 1.9
	return getImportPathToFolder([target], currentFolderPath);
}

export function getImportPathToFolder(targets: string[], cwd?: string): Promise<Map<string, string>> {
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		console.warn(
			`Failed to run "go list" to find packages as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) PATH(${envPath})`
		);
		return;
	}

	return new Promise<Map<string, string>>((resolve, reject) => {
		const childProcess = cp.spawn(
			goRuntimePath,
			['list', '-e', '-f', 'ImportPath: {{.ImportPath}} FolderPath: {{.Dir}}', ...targets],
			{ cwd, env: toolExecutionEnvironment() }
		);
		const chunks: any[] = [];
		childProcess.stdout.on('data', (stdout) => {
			chunks.push(stdout);
		});

		childProcess.on('close', async (status) => {
			const lines = chunks.join('').toString().split('\n');
			const result = new Map<string, string>();

			lines.forEach((line) => {
				const matches = line.match(pkgToFolderMappingRegex);
				if (!matches || matches.length !== 3) {
					return;
				}
				const [_, pkgPath, folderPath] = matches;
				if (!pkgPath) {
					return;
				}
				result.set(pkgPath, folderPath);
			});
			resolve(result);
		});
	});
}

// This will check whether it's regular package or internal package
// Regular package will always allowed
// Internal package only allowed if the package doing the import is within the
// tree rooted at the parent of "internal" directory
// see: https://golang.org/doc/go1.4#internalpackages
// see: https://golang.org/s/go14internal
function isAllowToImportPackage(toDirPath: string, currentWorkspace: string, pkgPath: string) {
	if (pkgPath.startsWith('internal/')) {
		return false;
	}

	const internalPkgFound = pkgPath.match(/\/internal\/|\/internal$/);
	if (internalPkgFound) {
		const rootProjectForInternalPkg = path.join(currentWorkspace, pkgPath.substr(0, internalPkgFound.index));
		return toDirPath.startsWith(rootProjectForInternalPkg + path.sep) || toDirPath === rootProjectForInternalPkg;
	}
	return true;
}
