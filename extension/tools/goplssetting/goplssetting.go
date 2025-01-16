// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

package goplssetting

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"maps"
	"os"
	"os/exec"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// Generate reads package.json and updates the gopls settings section
// based on `gopls api-json` output. This function requires `jq` to
// manipulate package.json.
func Generate(inputFile string, skipCleanup bool) ([]byte, error) {
	if _, err := os.Stat(inputFile); err != nil {
		return nil, err
	}

	if _, err := exec.LookPath("jq"); err != nil {
		return nil, fmt.Errorf("missing `jq`: %w", err)
	}

	workDir, err := ioutil.TempDir("", "goplssettings")
	if err != nil {
		return nil, err
	}
	log.Printf("WORK=%v", workDir)

	if !skipCleanup {
		defer os.RemoveAll(workDir)
	}

	api, err := readGoplsAPI()
	if err != nil {
		return nil, err
	}
	options, err := extractOptions(api)
	if err != nil {
		return nil, err
	}
	b, err := asVSCodeSettingsJSON(options)
	if err != nil {
		return nil, err
	}
	f, err := ioutil.TempFile(workDir, "gopls.settings")
	if err != nil {
		return nil, err
	}
	if _, err := f.Write(b); err != nil {
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}

	return rewritePackageJSON(f.Name(), inputFile)
}

// readGoplsAPI returns the output of `gopls api-json`.
func readGoplsAPI() (*API, error) {
	version, err := exec.Command("gopls", "-v", "version").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to check gopls version: %v", err)
	}
	log.Printf("Reading settings of gopls....\nversion:\n%s\n", version)

	out, err := exec.Command("gopls", "api-json").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run gopls: %v", err)
	}

	api := &API{}
	if err := json.Unmarshal(out, api); err != nil {
		return nil, fmt.Errorf("failed to unmarshal: %v", err)
	}
	return api, nil
}

// extractOptions extracts the options from APIJSON.
// It may rearrange the ordering and documentation for better presentation.
func extractOptions(api *API) ([]*Option, error) {
	type sortableOptionJSON struct {
		*Option
		section string
	}
	options := []sortableOptionJSON{}
	for k, v := range api.Options {
		for _, o := range v {
			options = append(options, sortableOptionJSON{Option: o, section: k})
		}
	}
	sort.SliceStable(options, func(i, j int) bool {
		pi := priority(options[i].Option)
		pj := priority(options[j].Option)
		if pi == pj {
			return options[i].Name < options[j].Name
		}
		return pi < pj
	})

	opts := []*Option{}
	for _, v := range options {
		if name := statusName(v.Option); name != "" {
			v.Option.Doc = name + " " + v.Option.Doc
		}
		opts = append(opts, v.Option)
	}
	return opts, nil
}

func priority(opt *Option) int {
	switch toStatus(opt.Status) {
	case Experimental:
		return 10
	case Debug:
		return 100
	}
	return 1000
}

func statusName(opt *Option) string {
	switch toStatus(opt.Status) {
	case Experimental:
		return "(Experimental)"
	case Advanced:
		return "(Advanced)"
	case Debug:
		return "(For Debugging)"
	}
	return ""
}

func toStatus(s string) Status {
	switch s {
	case "experimental":
		return Experimental
	case "debug":
		return Debug
	case "advanced":
		return Advanced
	case "":
		return None
	default:
		panic(fmt.Sprintf("unexpected status: %s", s))
	}
}

// rewritePackageJSON rewrites the input package.json by running `jq`
// to update all existing gopls settings with the ones from the newSettings
// file.
func rewritePackageJSON(newSettings, inFile string) ([]byte, error) {
	prog := `.contributes.configuration.properties+=$GOPLS_SETTINGS[0]`
	cmd := exec.Command("jq", "--slurpfile", "GOPLS_SETTINGS", newSettings, prog, inFile)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("jq run failed (%v): %s", err, &stderr)
	}
	return bytes.TrimSpace(stdout.Bytes()), nil
}

// asVSCodeSettingsJSON converts the given options to match the VS Code settings
// format.
func asVSCodeSettingsJSON(options []*Option) ([]byte, error) {
	obj, err := asVSCodeSettings(options)
	if err != nil {
		return nil, err
	}
	return json.Marshal(obj)
}

func asVSCodeSettings(options []*Option) (map[string]*Object, error) {
	seen := map[string][]*Option{}
	for _, opt := range options {
		seen[opt.Hierarchy] = append(seen[opt.Hierarchy], opt)
	}
	for _, v := range seen {
		sort.Slice(v, func(i, j int) bool {
			return v[i].Name < v[j].Name
		})
	}
	goplsProperties, goProperties, err := collectProperties(seen)
	if err != nil {
		return nil, err
	}
	goProperties["gopls"] = &Object{
		Type:                 "object",
		MarkdownDescription:  "Configure the default Go language server ('gopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md) for all available settings.",
		Scope:                "resource",
		AdditionalProperties: false,
		Properties:           goplsProperties,
	}
	return goProperties, nil
}

func collectProperties(m map[string][]*Option) (goplsProperties, goProperties map[string]*Object, err error) {
	var sorted []string
	var containsEmpty bool
	for k := range m {
		if k == "" {
			containsEmpty = true
			continue
		}
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)
	if containsEmpty {
		sorted = append(sorted, "")
	}
	goplsProperties, goProperties = map[string]*Object{}, map[string]*Object{}
	for _, hierarchy := range sorted {
		if hierarchy == "ui.inlayhint" {
			for _, opt := range m[hierarchy] {
				for _, k := range opt.EnumKeys.Keys {
					unquotedName, err := strconv.Unquote(k.Name)
					if err != nil {
						return nil, nil, err
					}
					key := "go.inlayHints." + unquotedName
					goProperties[key] = &Object{
						MarkdownDescription: k.Doc,
						Type:                "boolean",
						Default:             formatDefault(k.Default, "boolean"),
					}
				}
			}
			continue
		}
		for _, opt := range m[hierarchy] {
			obj, err := toObject(opt)
			if err != nil {
				return nil, nil, err
			}
			// TODO(hyangah): move diagnostic to all go.diagnostic.
			if hierarchy == "ui.diagnostic" && opt.Name == "vulncheck" {
				goProperties["go.diagnostic.vulncheck"] = obj
				continue
			}
			key := opt.Name
			if hierarchy != "" {
				key = hierarchy + "." + key
			}
			goplsProperties[key] = obj
		}
	}
	return goplsProperties, goProperties, nil
}

func toObject(opt *Option) (*Object, error) {
	doc := opt.Doc
	if mappedTo, ok := associatedToExtensionProperties[opt.Name]; ok {
		doc = fmt.Sprintf("%v\nIf unspecified, values of `%v` will be propagated.\n", doc, strings.Join(mappedTo, ", "))
	}
	obj := &Object{
		MarkdownDescription: doc,
		// TODO: are all gopls settings in the resource scope?
		Scope: "resource",
		// TODO: consider 'additionalProperties' if gopls api-json
		// outputs acceptable properties.
		DeprecationMessage: opt.DeprecationMessage,
	}
	if opt.Type != "enum" {
		obj.Type = propertyType(opt.Type)
	} else { // Map enum type to a sum type.
		// Assume value type is bool | string.
		seenTypes := map[string]bool{}
		for _, v := range opt.EnumValues {
			// EnumValue.Value: string in JSON syntax (quoted)
			var x any
			if err := json.Unmarshal([]byte(v.Value), &x); err != nil {
				return nil, fmt.Errorf("failed to unmarshal %q: %v", v.Value, err)
			}

			switch t := x.(type) {
			case string:
				obj.Enum = append(obj.Enum, t)
				seenTypes["string"] = true
			case bool:
				obj.Enum = append(obj.Enum, t)
				seenTypes["bool"] = true
			default:
				panic(fmt.Sprintf("type %T %+v as enum value type is not supported", t, t))
			}
			obj.MarkdownEnumDescriptions = append(obj.MarkdownEnumDescriptions, v.Doc)
		}
		obj.Type = propertyType(slices.Sorted(maps.Keys(seenTypes))...)
	}
	// Handle objects whose keys are listed in EnumKeys.
	// Gopls uses either enum or string as key types, for example,
	//   map[string]bool: analyses
	//   map[enum]bool: codelenses, annotations
	// Both cases where 'enum' is used as a key type actually use
	// only string type enum. For simplicity, map all to string-keyed objects.
	if len(opt.EnumKeys.Keys) > 0 {
		if obj.Properties == nil {
			obj.Properties = map[string]*Object{}
		}
		for _, k := range opt.EnumKeys.Keys {
			unquotedName, err := strconv.Unquote(k.Name)
			if err != nil {
				return nil, err
			}
			obj.Properties[unquotedName] = &Object{
				Type:                propertyType(opt.EnumKeys.ValueType),
				MarkdownDescription: k.Doc,
				Default:             formatDefault(k.Default, opt.EnumKeys.ValueType),
			}
		}
	}
	obj.Default = formatOptionDefault(opt)

	return obj, nil
}

func formatOptionDefault(opt *Option) interface{} {
	// Each key will have its own default value, instead of one large global
	// one. (Alternatively, we can build the default from the keys.)
	if len(opt.EnumKeys.Keys) > 0 {
		return nil
	}

	return formatDefault(opt.Default, opt.Type)
}

// formatDefault converts a string-based default value to an actual value that
// can be marshaled to JSON. Right now, gopls generates default values as
// strings, but perhaps that will change.
func formatDefault(def, typ string) interface{} {
	switch typ {
	case "enum", "string", "time.Duration":
		unquote, err := strconv.Unquote(def)
		if err == nil {
			def = unquote
		}
	case "[]string":
		var x []string
		if err := json.Unmarshal([]byte(def), &x); err == nil {
			return x
		}
	}
	switch def {
	case "{}", "[]":
		return nil
	case "true":
		return true
	case "false":
		return false
	default:
		return def
	}
}

var associatedToExtensionProperties = map[string][]string{
	"buildFlags": {"go.buildFlags", "go.buildTags"},
}

func propertyType(typs ...string) any /* string or []string */ {
	if len(typs) == 0 {
		panic("unexpected: len(typs) == 0")
	}
	if len(typs) == 1 {
		return mapType(typs[0])
	}

	var ret []string
	for _, t := range typs {
		ret = append(ret, mapType(t))
	}
	return ret
}

func mapType(t string) string {
	switch t {
	case "string":
		return "string"
	case "bool":
		return "boolean"
	case "time.Duration":
		return "string"
	case "[]string":
		return "array"
	case "map[string]string", "map[string]bool", "map[enum]string", "map[enum]bool":
		return "object"
	case "any":
		return "boolean"
	}
	log.Fatalf("unknown type %q", t)
	return ""
}

// Object represents a VS Code settings object.
type Object struct {
	Type                     any                `json:"type,omitempty"` // string | []string
	MarkdownDescription      string             `json:"markdownDescription,omitempty"`
	AdditionalProperties     bool               `json:"additionalProperties,omitempty"`
	Enum                     []any              `json:"enum,omitempty"`
	MarkdownEnumDescriptions []string           `json:"markdownEnumDescriptions,omitempty"`
	Default                  interface{}        `json:"default,omitempty"`
	Scope                    string             `json:"scope,omitempty"`
	Properties               map[string]*Object `json:"properties,omitempty"`
	DeprecationMessage       string             `json:"deprecationMessage,omitempty"`
}

type Status int

const (
	Experimental = Status(iota)
	Debug
	Advanced
	None
)

// API is a JSON-encodable representation of gopls' public interfaces.
//
// Types are copied from golang.org/x/tools/gopls/internal/doc/api.go.
type API struct {
	Options   map[string][]*Option
	Lenses    []*Lens
	Analyzers []*Analyzer
	Hints     []*Hint
}

type Option struct {
	Name               string
	Type               string // T = bool | string | int | enum | any | []T | map[T]T | time.Duration
	Doc                string
	EnumKeys           EnumKeys
	EnumValues         []EnumValue
	Default            string
	Status             string
	Hierarchy          string
	DeprecationMessage string
}

type EnumKeys struct {
	ValueType string
	Keys      []EnumKey
}

type EnumKey struct {
	Name    string // in JSON syntax (quoted)
	Doc     string
	Default string
}

type EnumValue struct {
	Value string // in JSON syntax (quoted)
	Doc   string // doc comment; always starts with `Value`
}

type Lens struct {
	FileType string // e.g. "Go", "go.mod"
	Lens     string
	Title    string
	Doc      string
	Default  bool
}

type Analyzer struct {
	Name    string
	Doc     string // from analysis.Analyzer.Doc ("title: summary\ndescription"; not Markdown)
	URL     string
	Default bool
}

type Hint struct {
	Name    string
	Doc     string
	Default bool
}
