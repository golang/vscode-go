/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import vscode = require('vscode');
import cp = require('child_process');
import { URI } from 'vscode-uri';
import { getGoConfig } from './config';
import { getWorkspaceFolderPath } from './util';

export interface IVulncheckTerminal {
	appendLine: (str: string) => void;
	show: (preserveFocus?: boolean) => void;
	exit: () => void;
}
export class VulncheckTerminal implements IVulncheckTerminal {
	private term: vscode.Terminal;
	private writeEmitter = new vscode.EventEmitter<string>();

	// Buffer messages emitted before vscode is ready.  VSC calls pty.open when it is ready.
	private ptyReady = false;
	private buf: string[] = [];

	// Constructor function to stub during test.
	static Open(): IVulncheckTerminal {
		return new VulncheckTerminal();
	}

	private constructor() {
		const pty: vscode.Pseudoterminal = {
			onDidWrite: this.writeEmitter.event,
			handleInput: () => this.exit(),
			open: () => {
				this.ptyReady = true;
				this.buf.forEach((l) => this.writeEmitter.fire(l));
				this.buf = [];
			},
			close: () => {}
		};
		this.term = vscode.window.createTerminal({ name: 'govulncheck', pty }); // TODO: iconPath
	}

	appendLine(str: string) {
		if (!str.endsWith('\n')) {
			str += '\n';
		}
		str = str.replace(/\n/g, '\n\r'); // replaceAll('\n', '\n\r').
		if (!this.ptyReady) {
			this.buf.push(str); // print when `open` is called.
		} else {
			this.writeEmitter.fire(str);
		}
	}

	show(preserveFocus?: boolean) {
		this.term.show(preserveFocus);
	}

	exit() {}
}

// VulncheckReport is the JSON data type of gopls's vulncheck result.
export interface VulncheckReport {
	Entries?: { [key: string]: unknown }; // map: osv.ID -> osv.Entry (we don't need to know the Entry shape)
	Findings?: unknown[]; // []Finding. We don't need to know the exact Fingings shape either.

	Mode?: 'govulncheck' | 'imports';

	// Legacy: Vulns populated by gopls vulncheck run.
	Vulns?: unknown;
}

export async function writeVulns(
	res: VulncheckReport,
	term: IVulncheckTerminal | undefined,
	goplsBinPath: string
): Promise<void> {
	if (term === undefined) {
		return;
	}
	term.appendLine('');
	let combined = '';
	const pr = new Promise<number | null>((resolve) => {
		const p = cp.spawn(goplsBinPath, ['vulncheck', '--', '-mode=convert', '-show=color'], {
			cwd: getWorkspaceFolderPath()
		});
		p.stdout.on('data', (data) => {
			combined += data;
		});
		p.stderr.on('data', (data) => {
			combined += data;
		});
		p.on('exit', (exitCode) => {
			// When vulnerabilities are found, vulncheck -mode=convert returns a non-zero exit code.
			// TODO: can we use the exitCode to set the status of terminal?
			resolve(exitCode);
		});

		// vulncheck -mode=convert expects a stream of osv.Entry and govulncheck Finding json objects.
		if (res.Entries) {
			Object.values(res.Entries).forEach((osv) => {
				const we = { osv: osv };
				p.stdin.write(`${JSON.stringify(we)}`);
			});
		}
		if (res.Findings) {
			Object.values(res.Findings).forEach((finding) => {
				const we = { finding: finding };
				p.stdin.write(`${JSON.stringify(we)}`);
			});
		}
		p.stdin.end();
	});
	try {
		await pr;
	} finally {
		combined.split('\n').forEach((l) => term.appendLine(l));
	}
	return;
}

export const toggleVulncheckCommandFactory = () => () => {
	const editor = vscode.window.activeTextEditor;
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
