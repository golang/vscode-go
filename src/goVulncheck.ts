/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import path = require('path');
import vscode = require('vscode');
import { URI } from 'vscode-uri';
import { getGoConfig } from './config';

function moduleVersion(mod: string, ver: string | undefined) {
	if (!ver) {
		return 'N/A';
	}
	if (mod === 'stdlib') {
		return `go${ver.replace(/^(v|go)/, '')}`;
	}
	return `${mod}@${ver}`;
}

// writeVulns generates human-readable vulnerability report from the VulncheckReport
// and write to the outputChannel.
export function writeVulns(
	res: VulncheckReport | undefined | null,
	outputChannel: { appendLine(value: string): void }
) {
	outputChannel.appendLine('');

	if (!res) {
		outputChannel.appendLine('Error - invalid vulncheck result.'); // TODO(hyangah): ask to open an issue.
		return;
	}
	if (!res.Vulns || res.Vulns.length === 0) {
		outputChannel.appendLine('No vulnerability found.');
		return;
	}

	const affecting = res.Vulns.filter((v) => {
		return v.Modules?.some((m) => {
			return m.Packages?.some((p) => {
				return p.CallStacks?.some((cs) => {
					return cs.Frames && cs.Frames.length > 0;
				});
			});
		});
	});
	const unaffecting = res.Vulns.filter((v) => !affecting.includes(v));

	switch (affecting.length) {
		case 0:
			outputChannel.appendLine('No vulnerability found.');
			break;
		case 1:
			outputChannel.appendLine(`Found ${affecting.length} affecting vulnerability.`);
			outputChannel.appendLine('-'.repeat(80));
			break;
		default:
			outputChannel.appendLine(`Found ${affecting.length} affecting vulnerabilities.`);
			outputChannel.appendLine('-'.repeat(80));
			break;
	}

	affecting.forEach((vuln) => {
		outputChannel.appendLine(`⚠ ${vuln.OSV.id} (https://pkg.go.dev/vuln/${vuln.OSV.id})`);
		const desc = (vuln.OSV.details || '').trimRight();
		const aliases = vuln.OSV.aliases?.length ? ` (${vuln.OSV.aliases.join(', ')})` : '';
		outputChannel.appendLine(`\n${desc}${aliases}\n`);
		vuln.Modules?.forEach((mod) => {
			outputChannel.appendLine(`Found Version: ${moduleVersion(mod.Path, mod.FoundVersion)}`);
			outputChannel.appendLine(`Fixed Version: ${moduleVersion(mod.Path, mod.FixedVersion)}`);
			mod.Packages?.forEach((pkg) => {
				outputChannel.appendLine('');
				pkg.CallStacks?.forEach((cs, index) => {
					// TODO: the position info embedded in the cs.Summary is relative to
					// the directory gopls ran the vulnchek.
					// Instead replace with workspace-relative paths.
					outputChannel.appendLine(`- ${cs.Summary}`);
					// Print the first trace (index === 0) as an example.
					// TODO(hyangah): allow users to see example traces for all detected vulnerable symbols.
					if (index === 0 && cs.Frames) {
						const last = cs.Frames.length - 1;
						cs.Frames?.forEach((f, index) => {
							// Skip the last frame that just carries the vulnerable symbol.
							// This info is already included in cs.Summary.
							if (last === index) return;
							const line = f.Position?.Line || 1;
							// TODO: shorten f.Position.Filename (e.g. workspace relative path, and home directory ~ relative path)
							const pos = f.Position?.Filename ? `${f.Position.Filename}:${line}` : ' - ';
							const name = f.RecvType ? `${f.RecvType}.${f.FuncName}` : `${f.PkgPath}.${f.FuncName}`;
							outputChannel.appendLine(`\t${name}\n\t\t(${pos})`);
						});
					}
				});
			});
		});
		outputChannel.appendLine('-'.repeat(80));
	});

	if (unaffecting.length) {
		outputChannel.appendLine(`
# The vulnerabilities below are in packages that you import, but your code does
# not appear to call any vulnerable functions. You may not need to take any
# action. See https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck for details.
`);

		switch (unaffecting.length) {
			case 1:
				outputChannel.appendLine(`Found ${unaffecting.length} unused vulnerability.`);
				break;
			default:
				outputChannel.appendLine(`Found ${unaffecting.length} unused vulnerabilities.`);
				break;
		}
		outputChannel.appendLine('-'.repeat(80));
	}

	unaffecting.forEach((vuln) => {
		outputChannel.appendLine(`ⓘ ${vuln.OSV.id} (https://pkg.go.dev/vuln/${vuln.OSV.id})`);
		const desc = (vuln.OSV.details || '').trimRight();
		const aliases = vuln.OSV.aliases?.length ? ` (${vuln.OSV.aliases.join(', ')})` : '';
		outputChannel.appendLine(`\n${desc}${aliases}\n`);
		vuln.Modules?.forEach((mod) => {
			outputChannel.appendLine(`Found Version: ${moduleVersion(mod.Path, mod.FoundVersion)}`);
			outputChannel.appendLine(`Fixed Version: ${moduleVersion(mod.Path, mod.FixedVersion)}`);
			mod.Packages?.forEach((pkg) => {
				outputChannel.appendLine(`Package: ${pkg.Path}`);
			});
		});
		outputChannel.appendLine('-'.repeat(80));
	});
}

// VulncheckReport is the JSON data type of gopls's vulncheck result.
export interface VulncheckReport {
	// Vulns populated by gopls vulncheck run.
	Vulns?: Vuln[];

	Mode?: 'govulncheck' | 'imports';
}

// Vuln represents a single OSV entry.
interface Vuln {
	// OSV contains all data from the OSV entry for this vulnerability.
	OSV: OSVEntry;

	// Modules contains all of the modules in the OSV entry where a
	// vulnerable package is imported by the target source code or binary.
	//
	// For example, a module M with two packages M/p1 and M/p2, where only p1
	// is vulnerable, will appear in this list if and only if p1 is imported by
	// the target source code or binary.
	Modules: Module[];

	AffectedPackages?: string[];
}

interface OSVEntry {
	id: string;
	published?: string;
	aliases?: string[];
	details?: string;
	affected?: Affected[];
}

interface Affected {
	package: Package;
	ecosystem_specific?: EcosystemSpecific;
}

interface EcosystemSpecificImport {
	path: string;
	goos?: string[];
	goarch?: string[];
	symbols?: string[];
}

interface EcosystemSpecific {
	imports?: EcosystemSpecificImport[];
}

interface Package {
	name: string;
}

interface Module {
	// Path is the module path of the module containing the vulnerability.
	//
	// Importable packages in the standard library will have the path "stdlib".
	Path: string;

	// FoundVersion is the module version where the vulnerability was found.
	FoundVersion?: string;

	// FixedVersion is the module version where the vulnerability was
	// fixed. If there are multiple fixed versions in the OSV report, this will
	// be the latest fixed version.
	//
	// This is empty if a fix is not available.
	FixedVersion?: string;

	// Packages contains all the vulnerable packages in OSV entry that are
	// imported by the target source code or binary.
	//
	// For example, given a module M with two packages M/p1 and M/p2, where
	// both p1 and p2 are vulnerable, p1 and p2 will each only appear in this
	// list they are individually imported by the target source code or binary.
	Packages?: Package[];
}

interface Package {
	// Path is the import path of the package containing the vulnerability.
	Path: string;

	// CallStacks contains a representative call stack for each
	// vulnerable symbol that is called.
	//
	// For vulnerabilities found from binary analysis, only CallStack.Symbol
	// will be provided.
	//
	// For non-affecting vulnerabilities reported from the source mode
	// analysis, this will be empty.
	CallStacks?: CallStack[];
}

interface CallStack {
	// Symbol is the name of the detected vulnerable function
	// or method.
	//
	// This follows the naming convention in the OSV report.
	Symbol?: string;

	// Summary is a one-line description of the callstack, used by the
	// default govulncheck mode.
	//
	// Example: module3.main calls github.com/shiyanhui/dht.DHT.Run
	Summary?: string;

	// Frames contains an entry for each stack in the call stack.
	//
	// Frames are sorted starting from the entry point to the
	// imported vulnerable symbol. The last frame in Frames should match
	// Symbol.
	Frames?: StackFrame[];
}

interface StackFrame {
	// PackagePath is the import path.
	PkgPath: string;

	// FuncName is the function name.
	FuncName?: string;

	// RecvType is the fully qualified receiver type,
	// if the called symbol is a method.
	//
	// The client can create the final symbol name by
	// prepending RecvType to FuncName.
	RecvType?: string;

	// Position describes an arbitrary source position
	// including the file, line, and column location.
	// A Position is valid if the line number is > 0.
	Position?: Position;
}

interface Position {
	Filename?: string; // filename, if any
	Offset?: number; // offset, starting at 0
	Line?: number; // line number, starting at 1
	Column?: number; // column number, starting at 1 (byte count)
}

// VulncheckOutputLinkProvider linkifies govulncheck output.
export class VulncheckOutputLinkProvider implements vscode.DocumentLinkProvider {
	static activate(ctx: Pick<vscode.ExtensionContext, 'subscriptions'>) {
		ctx.subscriptions.push(
			vscode.languages.registerDocumentLinkProvider(
				{ language: 'govulncheck' },
				new VulncheckOutputLinkProvider()
			)
		);
	}

	provideDocumentLinks(
		document: vscode.TextDocument,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentLink[]> {
		try {
			return this.unsafeProvideDocumentLinks(document);
		} catch (e) {
			console.log(`failed to linkify govulncheck output result: ${e}`);
		}
		return [];
	}

	unsafeProvideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
		const ret = [] as vscode.DocumentLink[];
		let cwd = '';
		for (let i = 0; i < document.lineCount; i++) {
			const readLine = document.lineAt(i);

			// govulncheck ./... for file:///foo/go.mod.
			const cmdPattern = readLine.text.match(/^govulncheck\s+\S+\s+for\s+(file:.*\.mod)/);
			if (cmdPattern && cmdPattern[1]) {
				cwd = path.dirname(vscode.Uri.parse(cmdPattern[1]).fsPath);
				continue;
			}

			// Found Version: and Fixed Version:
			const foundOrFixedVersionPattern = readLine.text.match(/^(?:Found|Fixed) Version:\s+(\S+@\S+)$/);
			if (foundOrFixedVersionPattern && foundOrFixedVersionPattern[1]) {
				const modVersion = foundOrFixedVersionPattern[1];
				const start = readLine.text.indexOf(modVersion);
				const end = start + modVersion.length;
				const link = new vscode.DocumentLink(
					new vscode.Range(i, start, i, end),
					vscode.Uri.parse(`https://pkg.go.dev/${modVersion}`)
				);
				link.tooltip = `https://pkg.go.dev/${modVersion}`;
				ret.push(link);
				continue;
			}

			// Position at file (e.g. file.go:1:2)
			const filePosPattern = readLine.text.match(/(?:-\s+|\s+\()(\S+\.go):(\d+)(?::(\d+)){0,1}/);
			if (filePosPattern && filePosPattern[1]) {
				let fname = filePosPattern[1];
				if (!path.isAbsolute(fname)) {
					fname = path.join(cwd, fname);
				}
				if (path.isAbsolute(fname)) {
					const line = filePosPattern[2];
					const col = filePosPattern[3];
					const fragment = col ? { fragment: `L${line},${col}` } : { fragment: `L${line}` };
					const uri = URI.file(fname).with(fragment);
					const start = readLine.text.indexOf(filePosPattern[1]);
					const end = readLine.text.indexOf(filePosPattern[0]) + filePosPattern[0].length;
					const link = new vscode.DocumentLink(new vscode.Range(i, start, i, end), uri);
					ret.push(link);
				}
				continue;
			}
		}
		return ret;
	}
}

export const toggleVulncheckCommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const documentUri = editor?.document.uri;
	toggleVulncheckCommand(documentUri);
};

function toggleVulncheckCommand(uri?: URI) {
	const goCfgName = 'diagnostic.vulncheck';
	const cfg = getGoConfig(uri);
	const { globalValue, workspaceValue, workspaceFolderValue } = cfg.inspect(goCfgName) || {};
	if (workspaceFolderValue) {
		const newValue = workspaceFolderValue === 'Imports' ? 'Off' : 'Imports';
		cfg.update(goCfgName, newValue);
		return;
	}
	if (workspaceValue) {
		const newValue = workspaceValue === 'Imports' ? 'Off' : 'Imports';
		cfg.update(goCfgName, newValue, false);
		return;
	}
	if (globalValue) {
		const newValue = globalValue === 'Imports' ? 'Off' : 'Imports';
		cfg.update(goCfgName, newValue, true);
		return;
	}
	cfg.update(goCfgName, 'Imports');
}
