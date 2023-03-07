// <!-- Everything below this line is generated. DO NOT EDIT. -->

import moment = require('moment');
import semver = require('semver');
import { gocodeClose, Tool } from './goTools';

export const allToolsInformation: { [key: string]: Tool } = {
	'gocode': {
		name: 'gocode',
		importPath: 'github.com/mdempsky/gocode',
		modulePath: 'github.com/mdempsky/gocode',
		isImportant: true,
		replacedByGopls: true,
		description: 'Auto-completion, does not work with modules',
		close: gocodeClose,
		defaultVersion: 'v0.0.0-20200405233807-4acdcbdea79d'
	},
	'gocode-gomod': {
		name: 'gocode-gomod',
		importPath: 'github.com/stamblerre/gocode',
		modulePath: 'github.com/stamblerre/gocode',
		isImportant: true,
		replacedByGopls: true,
		description: 'Auto-completion, works with modules',
		minimumGoVersion: semver.coerce('1.11'),
		defaultVersion: 'v1.0.0'
	},
	'go-outline': {
		name: 'go-outline',
		importPath: 'github.com/ramya-rao-a/go-outline',
		modulePath: 'github.com/ramya-rao-a/go-outline',
		replacedByGopls: true,
		isImportant: true,
		description: 'Go to symbol in file', // GoDocumentSymbolProvider, used by 'run test' codelens
		defaultVersion: 'v0.0.0-20210608161538-9736a4bde949'
	},
	'go-symbols': {
		name: 'go-symbols',
		importPath: 'github.com/acroca/go-symbols',
		modulePath: 'github.com/acroca/go-symbols',
		replacedByGopls: true,
		isImportant: false,
		description: 'Go to symbol in workspace',
		defaultVersion: 'v0.1.1'
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
		description: 'Modify tags on structs',
		defaultVersion: 'v1.16.0'
	},
	'goplay': {
		name: 'goplay',
		importPath: 'github.com/haya14busa/goplay/cmd/goplay',
		modulePath: 'github.com/haya14busa/goplay',
		replacedByGopls: false,
		isImportant: false,
		description: 'The Go playground',
		defaultVersion: 'v1.0.0'
	},
	'impl': {
		name: 'impl',
		importPath: 'github.com/josharian/impl',
		modulePath: 'github.com/josharian/impl',
		replacedByGopls: false,
		isImportant: false,
		description: 'Stubs for interfaces',
		defaultVersion: 'v1.1.0'
	},
	'gotype-live': {
		name: 'gotype-live',
		importPath: 'github.com/tylerb/gotype-live',
		modulePath: 'github.com/tylerb/gotype-live',
		replacedByGopls: true, // TODO(github.com/golang/vscode-go/issues/1021): recommend users to turn off.
		isImportant: false,
		description: 'Show errors as you type',
		defaultVersion: 'v0.0.0-20200426224044-fc0b594a8b09'
	},
	'godef': {
		name: 'godef',
		importPath: 'github.com/rogpeppe/godef',
		modulePath: 'github.com/rogpeppe/godef',
		replacedByGopls: true,
		isImportant: true,
		description: 'Go to definition',
		defaultVersion: 'v1.1.2'
	},
	'gogetdoc': {
		name: 'gogetdoc',
		importPath: 'github.com/zmb3/gogetdoc',
		modulePath: 'github.com/zmb3/gogetdoc',
		replacedByGopls: true,
		isImportant: true,
		description: 'Go to definition & text shown on hover',
		defaultVersion: 'v0.0.0-20190228002656-b37376c5da6a'
	},
	'gofumports': {
		name: 'gofumports',
		importPath: 'mvdan.cc/gofumpt/gofumports',
		modulePath: 'mvdan.cc/gofumpt',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter',
		defaultVersion: 'v0.1.1'
	},
	'gofumpt': {
		name: 'gofumpt',
		importPath: 'mvdan.cc/gofumpt',
		modulePath: 'mvdan.cc/gofumpt',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter',
		defaultVersion: 'v0.4.0'
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
		description: 'Formatter',
		defaultVersion: 'v0.0.0-20181028201513-538ac6014518'
	},
	'goformat': {
		name: 'goformat',
		importPath: 'winterdrache.de/goformat/goformat',
		modulePath: 'winterdrache.de/goformat/goformat',
		replacedByGopls: true,
		isImportant: false,
		description: 'Formatter',
		defaultVersion: 'v0.0.0-20180512004123-256ef38c4271'
	},
	'gotests': {
		name: 'gotests',
		importPath: 'github.com/cweill/gotests/gotests',
		modulePath: 'github.com/cweill/gotests',
		replacedByGopls: false,
		isImportant: false,
		description: 'Generate unit tests',
		minimumGoVersion: semver.coerce('1.9'),
		defaultVersion: 'v1.6.0'
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
		description: 'Linter',
		defaultVersion: 'v1.51.2'
	},
	'revive': {
		name: 'revive',
		importPath: 'github.com/mgechev/revive',
		modulePath: 'github.com/mgechev/revive',
		isImportant: true,
		description: 'Linter',
		defaultVersion: 'v1.2.3'
	},
	'gopls': {
		name: 'gopls',
		importPath: 'golang.org/x/tools/gopls',
		modulePath: 'golang.org/x/tools/gopls',
		replacedByGopls: false, // lol
		isImportant: true,
		description: 'Language Server from Google',
		usePrereleaseInPreviewMode: true,
		minimumGoVersion: semver.coerce('1.13'),
		latestVersion: semver.parse('v0.11.0'),
		latestVersionTimestamp: moment('2022-12-13', 'YYYY-MM-DD'),
		latestPrereleaseVersion: semver.parse('v0.11.0'),
		latestPrereleaseVersionTimestamp: moment('2022-12-13', 'YYYY-MM-DD')
	},
	'dlv': {
		name: 'dlv',
		importPath: 'github.com/go-delve/delve/cmd/dlv',
		modulePath: 'github.com/go-delve/delve',
		replacedByGopls: false,
		isImportant: true,
		description: 'Go debugger (Delve)',
		latestVersion: semver.parse('v1.6.1'), // minimum version that supports DAP
		latestVersionTimestamp: moment('2021-05-19', 'YYYY-MM-DD'),
		minimumGoVersion: semver.coerce('1.12') // dlv requires 1.12+ for build
	},
	'fillstruct': {
		name: 'fillstruct',
		importPath: 'github.com/davidrjenni/reftools/cmd/fillstruct',
		modulePath: 'github.com/davidrjenni/reftools',
		replacedByGopls: true,
		isImportant: false,
		description: 'Fill structs with defaults',
		defaultVersion: 'v0.0.0-20210213085015-40322ffdc2e4'
	},
	'godoctor': {
		name: 'godoctor',
		importPath: 'github.com/godoctor/godoctor',
		modulePath: 'github.com/godoctor/godoctor',
		replacedByGopls: true,
		isImportant: false,
		description: 'Extract to functions and variables',
		defaultVersion: 'v0.0.0-20220520165350-b665b8ff3f35'
	}
};
