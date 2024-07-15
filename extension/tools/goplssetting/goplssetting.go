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
	"os"
	"os/exec"
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
	b, err := asVSCodeSettings(options)
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
func readGoplsAPI() (*APIJSON, error) {
	version, err := exec.Command("gopls", "-v", "version").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to check gopls version: %v", err)
	}
	log.Printf("Reading settings of gopls....\nversion:\n%s\n", version)

	out, err := exec.Command("gopls", "api-json").Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run gopls: %v", err)
	}

	api := &APIJSON{}
	if err := json.Unmarshal(out, api); err != nil {
		return nil, fmt.Errorf("failed to unmarshal: %v", err)
	}
	return api, nil
}

// extractOptions extracts the options from APIJSON.
// It may rearrange the ordering and documentation for better presentation.
func extractOptions(api *APIJSON) ([]*OptionJSON, error) {
	type sortableOptionJSON struct {
		*OptionJSON
		section string
	}
	options := []sortableOptionJSON{}
	for k, v := range api.Options {
		for _, o := range v {
			options = append(options, sortableOptionJSON{OptionJSON: o, section: k})
		}
	}
	sort.SliceStable(options, func(i, j int) bool {
		pi := priority(options[i].OptionJSON)
		pj := priority(options[j].OptionJSON)
		if pi == pj {
			return options[i].Name < options[j].Name
		}
		return pi < pj
	})

	opts := []*OptionJSON{}
	for _, v := range options {
		if name := statusName(v.OptionJSON); name != "" {
			v.OptionJSON.Doc = name + " " + v.OptionJSON.Doc
		}
		opts = append(opts, v.OptionJSON)
	}
	return opts, nil
}

func priority(opt *OptionJSON) int {
	switch toStatus(opt.Status) {
	case Experimental:
		return 10
	case Debug:
		return 100
	}
	return 1000
}

func statusName(opt *OptionJSON) string {
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

// asVSCodeSettings converts the given options to match the VS Code settings
// format.
func asVSCodeSettings(options []*OptionJSON) ([]byte, error) {
	seen := map[string][]*OptionJSON{}
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
	return json.Marshal(goProperties)
}

func collectProperties(m map[string][]*OptionJSON) (goplsProperties, goProperties map[string]*Object, err error) {
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

func toObject(opt *OptionJSON) (*Object, error) {
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
		// TODO: deprecation attribute
	}
	// Handle any enum types.
	if opt.Type == "enum" {
		for _, v := range opt.EnumValues {
			unquotedName, err := strconv.Unquote(v.Value)
			if err != nil {
				return nil, err
			}
			obj.Enum = append(obj.Enum, unquotedName)
			obj.MarkdownEnumDescriptions = append(obj.MarkdownEnumDescriptions, v.Doc)
		}
	}
	// Handle any objects whose keys are enums.
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
	obj.Type = propertyType(opt.Type)
	obj.Default = formatOptionDefault(opt)

	return obj, nil
}

func formatOptionDefault(opt *OptionJSON) interface{} {
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

func propertyType(t string) string {
	switch t {
	case "string":
		return "string"
	case "bool":
		return "boolean"
	case "enum":
		return "string"
	case "time.Duration":
		return "string"
	case "[]string":
		return "array"
	case "map[string]string", "map[string]bool", "map[enum]string", "map[enum]bool":
		return "object"
	case "any":
		return "boolean" // TODO(hyangah): change to "" after https://go.dev/cl/593656 is released.
	}
	log.Fatalf("unknown type %q", t)
	return ""
}

func check(err error) {
	if err == nil {
		return
	}

	log.Output(1, err.Error())
	os.Exit(1)
}

// Object represents a VS Code settings object.
type Object struct {
	Type                     string             `json:"type,omitempty"`
	MarkdownDescription      string             `json:"markdownDescription,omitempty"`
	AdditionalProperties     bool               `json:"additionalProperties,omitempty"`
	Enum                     []string           `json:"enum,omitempty"`
	MarkdownEnumDescriptions []string           `json:"markdownEnumDescriptions,omitempty"`
	Default                  interface{}        `json:"default,omitempty"`
	Scope                    string             `json:"scope,omitempty"`
	Properties               map[string]*Object `json:"properties,omitempty"`
}

type Status int

const (
	Experimental = Status(iota)
	Debug
	Advanced
	None
)

// APIJSON is the output json type of `gopls api-json`.
// Types copied from golang.org/x/tools/internal/lsp/source/options.go.
type APIJSON struct {
	Options   map[string][]*OptionJSON
	Commands  []*CommandJSON
	Lenses    []*LensJSON
	Analyzers []*AnalyzerJSON
}

type OptionJSON struct {
	Name       string
	Type       string
	Doc        string
	EnumKeys   EnumKeys
	EnumValues []EnumValue
	Default    string
	Status     string
	Hierarchy  string
}

type EnumKeys struct {
	ValueType string
	Keys      []EnumKey
}

type EnumKey struct {
	Name    string
	Doc     string
	Default string
}

type EnumValue struct {
	Value string
	Doc   string
}

type CommandJSON struct {
	Command string
	Title   string
	Doc     string
}

type LensJSON struct {
	Lens  string
	Title string
	Doc   string
}

type AnalyzerJSON struct {
	Name    string
	Doc     string
	Default bool
}
