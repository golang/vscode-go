// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// Command generate is used to update package.json based on
// the gopls's API and generate documentation from it.
//
// To update documentation based on the current package.json:
//    go run tools/generate.go
//
// To update package.json and generate documentation.
//    go run tools/generate.go -gopls
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/golang/vscode-go/tools/goplssetting"
)

var (
	writeFlag                    = flag.Bool("w", true, "Write new file contents to disk.")
	updateGoplsSettingsFlag      = flag.Bool("gopls", false, "Update gopls settings in package.json. This is disabled by default because 'jq' tool is needed for generation.")
	updateLatestToolVersionsFlag = flag.Bool("tools", false, "Update the latest versions of tools in src/src/goToolsInformation.ts. This is disabled by default because the latest versions may change frequently and should not block a release.")

	debugFlag = flag.Bool("debug", false, "If true, enable extra logging and skip deletion of intermediate files.")
)

func checkAndWrite(filename string, oldContent, newContent []byte) {
	// Return early if the contents are unchanged.
	if bytes.Equal(oldContent, newContent) {
		return
	}

	// Either write out new contents or report an error (if in CI).
	if *writeFlag {
		if err := ioutil.WriteFile(filename, newContent, 0644); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("updated %s\n", filename)
	} else {
		base := filepath.Join("docs", filepath.Base(filename))
		fmt.Printf(`%s have changed in the package.json, but documentation in %s was not updated.
To update the settings, run "go run tools/generate.go -w".
`, strings.TrimSuffix(base, ".md"), base)
		os.Exit(1) // causes CI to break.
	}
}

type PackageJSON struct {
	Contributes struct {
		Commands      []Command `json:"commands,omitempty"`
		Configuration struct {
			Properties map[string]*Property `json:"properties,omitempty"`
		} `json:"configuration,omitempty"`
		Debuggers []Debugger `json:"debuggers,omitempty"`
	} `json:"contributes,omitempty"`
}

type Command struct {
	Command     string `json:"command,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

type Property struct {
	name string `json:"name,omitempty"` // Set by us.

	// Below are defined in package.json
	Properties                 map[string]*Property `json:"properties,omitempty"`
	AnyOf                      []Property           `json:"anyOf,omitempty"`
	Default                    interface{}          `json:"default,omitempty"`
	MarkdownDescription        string               `json:"markdownDescription,omitempty"`
	Description                string               `json:"description,omitempty"`
	MarkdownDeprecationMessage string               `json:"markdownDeprecationMessage,omitempty"`
	DeprecationMessage         string               `json:"deprecationMessage,omitempty"`
	Type                       interface{}          `json:"type,omitempty"`
	Enum                       []interface{}        `json:"enum,omitempty"`
	EnumDescriptions           []string             `json:"enumDescriptions,omitempty"`
	MarkdownEnumDescriptions   []string             `json:"markdownEnumDescriptions,omitempty"`
	Items                      *Property            `json:"items,omitempty"`
}

type Debugger struct {
	Type                    string `json:"type,omitempty"`
	Label                   string `json:"label,omitempty"`
	ConfigurationAttributes struct {
		Launch Configuration
		Attach Configuration
	} `json:"configurationAttributes,omitempty"`
}

type Configuration struct {
	Properties map[string]*Property `json:"properties,omitempty"`
}

type moduleVersion struct {
	Path     string   `json:",omitempty"`
	Version  string   `json:",omitempty"`
	Time     string   `json:",omitempty"`
	Versions []string `json:",omitempty"`
}

func main() {
	flag.Parse()

	// Assume this is running from the vscode-go directory.
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}

	packageJSONFile := filepath.Join(dir, "package.json")

	// Find the package.json file.
	data, err := ioutil.ReadFile(packageJSONFile)
	if err != nil {
		log.Fatal(err)
	}

	if *updateGoplsSettingsFlag {
		newData, err := updateGoplsSettings(data, packageJSONFile, *debugFlag)
		if err != nil {
			log.Fatal(err)
		}
		data = newData
	}

	pkgJSON := &PackageJSON{}
	if err := json.Unmarshal(data, pkgJSON); err != nil {
		log.Fatal(err)
	}

	rewrite := func(filename string, toAdd []byte) {
		oldContent, err := ioutil.ReadFile(filename)
		if err != nil {
			log.Fatal(err)
		}
		gen := []byte(`<!-- Everything below this line is generated. DO NOT EDIT. -->`)
		split := bytes.Split(oldContent, gen)
		if len(split) == 1 {
			log.Fatalf("expected to find %q in %s, not found", gen, filename)
		}
		var s []byte
		if strings.HasSuffix(filename, ".ts") {
			s = bytes.Join([][]byte{
				split[0],
				gen,
				[]byte("\n\n"),
				toAdd,
			}, []byte{})
		} else {
			s = bytes.Join([][]byte{
				bytes.TrimSpace(split[0]),
				gen,
				toAdd,
			}, []byte("\n\n"))
		}
		newContent := append(s, '\n')
		checkAndWrite(filename, oldContent, newContent)
	}

	b := &bytes.Buffer{}
	for i, c := range pkgJSON.Contributes.Commands {
		fmt.Fprintf(b, "### `%s`\n\n%s", c.Title, c.Description)
		if i != len(pkgJSON.Contributes.Commands)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "docs", "commands.md"), b.Bytes())

	// Clear so that we can rewrite settings.md.
	b.Reset()

	var properties []*Property
	var goplsProperty *Property
	for name, p := range pkgJSON.Contributes.Configuration.Properties {
		p.name = name
		if name == "gopls" {
			goplsProperty = p
		}
		properties = append(properties, p)
	}

	sort.Slice(properties, func(i, j int) bool {
		return properties[i].name < properties[j].name
	})

	for _, p := range properties {
		if p.name == "gopls" {
			desc := "Customize `gopls` behavior by specifying the gopls' settings in this section. " +
				"For example, \n```\n\"gopls\" : {\n\t\"build.directoryFilters\": [\"-node_modules\"]\n\t...\n}\n```\n" +
				"This section is directly read by `gopls`. See the [`gopls` section](#settings-for-gopls) section " +
				"for the full list of `gopls` settings."
			fmt.Fprintf(b, "### `%s`\n\n%s", p.name, desc)
			b.WriteString("\n\n")
			continue
		}

		writeProperty(b, "###", p)
		b.WriteString("\n")
	}

	// Write gopls section.
	b.WriteString("## Settings for `gopls`\n\n")
	writeGoplsSettingsSection(b, goplsProperty)

	rewrite(filepath.Join(dir, "docs", "settings.md"), b.Bytes())

	b.Reset()
	generateDebugConfigTable(b, pkgJSON)
	rewriteDebugDoc(filepath.Join(dir, "docs", "debugging.md"), b.Bytes())

	// Only update the latest tool versions if the flag is set.
	if !*updateLatestToolVersionsFlag {
		return
	}

	// Clear so that we can rewrite src/goToolsInformation.ts.
	b.Reset()

	// Check for the latest gopls version.
	versions, err := listAllModuleVersions("golang.org/x/tools/gopls")
	if err != nil {
		log.Fatal(err)
	}
	latestIndex := len(versions.Versions) - 1
	latestPre := versions.Versions[latestIndex]
	// We need to find the last version that was not a pre-release.
	var latest string
	for ; latestIndex >= 0; latestIndex-- {
		latest = versions.Versions[latestIndex]
		if !strings.Contains(latest, "pre") {
			break
		}
	}

	goplsVersion, err := listModuleVersion(fmt.Sprintf("golang.org/x/tools/gopls@%s", latest))
	if err != nil {
		log.Fatal(err)
	}
	goplsVersionPre, err := listModuleVersion(fmt.Sprintf("golang.org/x/tools/gopls@%s", latestPre))
	if err != nil {
		log.Fatal(err)
	}

	allToolsFile := filepath.Join(dir, "tools", "allTools.ts.in")

	// Find the package.json file.
	data, err = ioutil.ReadFile(allToolsFile)
	if err != nil {
		log.Fatal(err)
	}

	// TODO(suzmue): change input to json and avoid magic string printing.
	toolsString := fmt.Sprintf(string(data), goplsVersion.Version, goplsVersion.Time[:len("YYYY-MM-DD")], goplsVersionPre.Version, goplsVersionPre.Time[:len("YYYY-MM-DD")])

	// Write tools section.
	b.WriteString(toolsString)
	rewrite(filepath.Join(dir, "src", "goToolsInformation.ts"), b.Bytes())
}

func listModuleVersion(path string) (moduleVersion, error) {
	output, err := exec.Command("go", "list", "-m", "-json", path).Output()
	if err != nil {
		return moduleVersion{}, err
	}
	var version moduleVersion
	err = json.Unmarshal(output, &version)
	if err != nil {
		return moduleVersion{}, err
	}
	return version, nil
}

func listAllModuleVersions(path string) (moduleVersion, error) {
	output, err := exec.Command("go", "list", "-m", "-json", "-versions", path).Output()
	if err != nil {
		return moduleVersion{}, err
	}
	var version moduleVersion
	err = json.Unmarshal(output, &version)
	if err != nil {
		return moduleVersion{}, err
	}
	return version, nil
}

func writeProperty(b *bytes.Buffer, heading string, p *Property) {
	desc := p.Description
	if p.MarkdownDescription != "" {
		desc = p.MarkdownDescription
	}
	deprecation := p.DeprecationMessage
	if p.MarkdownDeprecationMessage != "" {
		deprecation = p.MarkdownDeprecationMessage
	}

	name := p.name
	if deprecation != "" {
		name += " (deprecated)"
		desc = deprecation + "\n" + desc
	}

	fmt.Fprintf(b, "%s `%s`\n\n%s", heading, name, desc)

	if enums := enumDescriptionsSnippet(p); enums != "" {
		fmt.Fprintf(b, "<br/>\n%s", enums)
	}

	if p.Type == "object" {
		writeSettingsObjectProperties(b, p.Properties)
	}

	if defaults := defaultDescriptionSnippet(p); defaults != "" {
		b.WriteString("\n\n")
		if p.Type == "object" {
			fmt.Fprintf(b, "Default:\n```\n%v\n```", defaults)
		} else {
			fmt.Fprintf(b, "Default: `%v`", defaults)
		}
	}
}

func defaultDescriptionSnippet(p *Property) string {
	if p.Default == nil {
		return ""
	}
	b := &bytes.Buffer{}
	switch p.Type {
	case "object":
		x, ok := p.Default.(map[string]interface{})
		if !ok {
			panic(fmt.Sprintf("unexpected type of object: %v", *p))
		} else if len(x) > 0 {
			// do nothing if it is nil
			writeMapObject(b, "", x)
		}
	case "string":
		fmt.Fprintf(b, "%q", p.Default)
	case "boolean", "number":
		fmt.Fprintf(b, "%v", p.Default)
	case "array":
		x, ok := p.Default.([]interface{})
		if !ok {
			panic(fmt.Sprintf("unexpected type for array: %v", *p))
		} else if len(x) > 0 {
			fmt.Fprintf(b, "[")
			for i, v := range x {
				if i > 0 {
					fmt.Fprintf(b, ", ")
				}
				fmt.Fprintf(b, "%q", v)
			}
			fmt.Fprintf(b, "]")
		}
	default:
		fmt.Fprintf(b, "%v", p.Default)
	}
	return b.String()
}

func writeMapObject(b *bytes.Buffer, indent string, obj map[string]interface{}) {
	keys := []string{}
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Fprintf(b, "%v{\n", indent)
	for _, k := range keys {
		fmt.Fprintf(b, "%v%q :\t", indent+"\t", k)

		v := obj[k]
		switch v := v.(type) {
		case string:
			fmt.Fprintf(b, "%q", v)
		case map[string]interface{}:
			writeMapObject(b, indent+"\t", v)
		default:
			fmt.Fprintf(b, "%v", v)
		}
		fmt.Fprint(b, ",\n")
	}
	fmt.Fprintf(b, "%v}", indent)
}

func writeGoplsSettingsSection(b *bytes.Buffer, goplsProperty *Property) {
	desc := goplsProperty.MarkdownDescription
	b.WriteString(desc)
	b.WriteString("\n\n")

	properties := goplsProperty.Properties
	var names []string
	for name := range properties {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		p := properties[name]
		p.name = name
		writeProperty(b, "###", p)
		b.WriteString("\n")
	}
}

func writeSettingsObjectProperties(b *bytes.Buffer, properties map[string]*Property) {
	if len(properties) == 0 {
		return
	}

	var names []string
	for name := range properties {
		names = append(names, name)
	}
	sort.Strings(names)
	b.WriteString("\n")
	b.WriteString("| Properties | Description |\n")
	b.WriteString("| --- | --- |\n")
	ending := "\n"
	for i, name := range names {
		if i == len(names)-1 {
			ending = ""
		}
		p := properties[name]
		p.name = name

		desc := p.Description
		if p.MarkdownDescription != "" {
			desc = p.MarkdownDescription
		}
		deprecation := p.DeprecationMessage
		if p.MarkdownDeprecationMessage != "" {
			deprecation = p.MarkdownDeprecationMessage
		}
		if deprecation != "" {
			name += " (deprecated)"
			desc = deprecation + "\n" + desc
		}

		if enum := enumDescriptionsSnippet(p); enum != "" {
			desc += "\n\n" + enum
		}

		if defaults := defaultDescriptionSnippet(p); defaults != "" {
			desc += "\n\n"
			if p.Type == "object" {
				desc += fmt.Sprintf("Default:\n```\n%v\n```", defaults)
			} else {
				desc += fmt.Sprintf("Default: `%v`", defaults)
			}
		}
		desc = gocommentToMarkdown(desc)
		fmt.Fprintf(b, "| `%s` | %s |%v", name, desc, ending)
	}
}

// enumDescriptionsSnippet returns the snippet for the allowed values.
func enumDescriptionsSnippet(p *Property) string {
	b := &bytes.Buffer{}
	if len(p.Enum) == 0 {
		return ""
	}
	desc := p.EnumDescriptions
	if len(p.MarkdownEnumDescriptions) != 0 {
		desc = p.MarkdownEnumDescriptions
	}

	hasDesc := false
	for _, d := range desc {
		if d != "" {
			hasDesc = true
			break
		}
	}
	b.WriteString("Allowed Options:")

	if hasDesc && len(desc) == len(p.Enum) {
		b.WriteString("\n\n")
		for i, e := range p.Enum {
			fmt.Fprintf(b, "* `%v`", e)
			if d := desc[i]; d != "" {
				fmt.Fprintf(b, ": %v", strings.TrimRight(strings.ReplaceAll(d, "\n\n", "<br/>"), "\n"))
			}
			b.WriteString("\n")
		}
	} else {
		for i, e := range p.Enum {
			fmt.Fprintf(b, " `%v`", e)
			if i < len(p.Enum)-1 {
				b.WriteString(",")
			}
		}
	}
	return b.String()
}

// gocommentToMarkdown converts the description string generated based on go comments
// to more markdown-friendly style.
//   - treat indented lines as pre-formatted blocks (e.g. code snippets) like in go doc
//   - replace new lines with <br/>'s, so the new lines mess up formatting when embedded in tables
//   - preserve new lines inside preformatted sections, but replace them with <br/>'s
//   - skip unneeded new lines
func gocommentToMarkdown(s string) string {
	lines := strings.Split(s, "\n")
	inPre := false
	b := &bytes.Buffer{}
	for i, l := range lines {
		if strings.HasPrefix(l, "\t") { // indented
			if !inPre { // beginning of the block
				inPre = true
				b.WriteString("<pre>")
			} else { // preserve new lines in pre-formatted block
				b.WriteString("<br/>")
			}
			l = l[1:] // remove one leading \t, in favor of <pre></pre> formatting.
		} else { // not indented
			if inPre {
				inPre = false
				b.WriteString("</pre>")
			}
		}
		if l == "" && i != len(lines)-1 {
			b.WriteString("<br/>") // add a new line.
		} else {
			b.WriteString(l) // just print l, no new line.
		}
		if i != len(lines)-1 {
			if !inPre {
				b.WriteString(" ")
			}
		}
	}
	return b.String()
}

func updateGoplsSettings(oldData []byte, packageJSONFile string, debug bool) (newData []byte, _ error) {
	newData, err := goplssetting.Generate(packageJSONFile, debug)
	if err != nil { // failed to compute up-to-date gopls settings.
		return nil, err
	}

	if bytes.Equal(oldData, newData) {
		return oldData, nil
	}

	if !*writeFlag {
		fmt.Println(`gopls settings section in package.json needs update. To update the settings, run "go run tools/generate.go -w -gopls".`)
		os.Exit(1) // causes CI to break.
	}

	if err := ioutil.WriteFile(packageJSONFile, newData, 0644); err != nil {
		return nil, err
	}
	return newData, nil
}

func rewriteDebugDoc(filename string, toAdd []byte) {
	oldContent, err := ioutil.ReadFile(filename)
	if err != nil {
		log.Fatal(err)
	}
	startSep := []byte(`<!-- SETTINGS BEGIN -->`)
	endSep := []byte(`<!-- SETTINGS END -->`)
	startIdx := bytes.Index(oldContent, startSep)
	endIdx := bytes.Index(oldContent, endSep)
	if startIdx <= 0 || endIdx <= startIdx {
		log.Fatalf("Missing valid SETTINGS BEGIN/END markers in %v", filename)
	}
	part1 := oldContent[:startIdx+len(startSep)+1]
	part3 := oldContent[endIdx:]

	newContent := bytes.Join([][]byte{
		part1,
		toAdd,
		part3,
	}, []byte{})
	checkAndWrite(filename, oldContent, newContent)
}

func generateDebugConfigTable(w io.Writer, pkgJSON *PackageJSON) {
	for _, d := range pkgJSON.Contributes.Debuggers {
		table := map[string]bool{}

		for k := range d.ConfigurationAttributes.Attach.Properties {
			table[k] = true
		}
		for k := range d.ConfigurationAttributes.Launch.Properties {
			table[k] = true
		}

		keys := make([]string, 0, len(table))
		for k := range table {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		fmt.Fprintln(w, "| Property | Launch | Attach |")
		fmt.Fprintln(w, "| --- | --- | --- |")

		for _, k := range keys {
			launch := describeDebugProperty(d.ConfigurationAttributes.Launch.Properties[k])
			attach := describeDebugProperty(d.ConfigurationAttributes.Attach.Properties[k])

			if launch != "" && attach != "" {
				if launch != attach {
					fmt.Fprintf(w, "| `%v` | %v | %v |\n", k, launch, attach)
				} else {
					fmt.Fprintf(w, "| `%v` | %v | <center>_same as Launch_</center>|\n", k, launch)
				}
			} else if launch != "" {
				fmt.Fprintf(w, "| `%v` | %v | <center>_n/a_</center> |\n", k, launch)
			} else if attach != "" {
				fmt.Fprintf(w, "| `%v` | <center>_n/a_</center> | %v |\n", k, attach)
			}
		}
	}
}

func describeDebugProperty(p *Property) string {
	if p == nil {
		return ""
	}
	b := &bytes.Buffer{}

	desc := p.Description
	if p.MarkdownDescription != "" {
		desc = p.MarkdownDescription
	}
	if p == nil || strings.Contains(desc, "Not applicable when using `dlv-dap` mode.") {
		return ""
	}

	deprecation := p.DeprecationMessage
	if p.MarkdownDeprecationMessage != "" {
		deprecation = p.MarkdownDeprecationMessage
	}

	if deprecation != "" {
		fmt.Fprintf(b, "(Deprecated) *%v*<br/>", deprecation)
	}
	fmt.Fprintf(b, "%v<br/>", desc)

	if len(p.AnyOf) > 0 {
		for i, a := range p.AnyOf {
			fmt.Fprintf(b, "<p><b>Option %d:</b> %v<br/>", i+1, describeDebugProperty(&a))
		}
	}

	if len(p.Enum) > 0 {
		var enums []string
		for _, i := range p.Enum {
			enums = append(enums, fmt.Sprintf("`%#v`", i))
		}
		fmt.Fprintf(b, "<p>Allowed Values: %v<br/>", strings.Join(enums, ", "))
	}

	if p.Type == "object" && len(p.Properties) > 0 {

		var keys []string
		for k := range p.Properties {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		fmt.Fprintf(b, "<ul>")

		for _, k := range keys {
			v := p.Properties[k]
			fmt.Fprintf(b, "<li>`%q`: %v</li>", k, describeDebugProperty(v))
		}
		fmt.Fprintf(b, "</ul>")
	}

	if p.Type == "array" && p.Items != nil && p.Items.Type == "object" {
		fmt.Fprintf(b, "<p>%v<br/>", describeDebugProperty(p.Items))
	}

	// Default
	if d := defaultDescriptionSnippet(p); d != "" {
		fmt.Fprintf(b, "(Default: `%v`)<br/>", d)
	}
	return b.String()
}
