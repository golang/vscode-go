// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// Command generate is used to generate documentation from the package.json.
// To run:
// go run tools/generate.go -w
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

var (
	writeFlag = flag.Bool("w", true, "Write new file contents to disk.")
)

type PackageJSON struct {
	Contributes struct {
		Commands      []Command `json:"commands,omitempty"`
		Configuration struct {
			Properties map[string]Property `json:"properties,omitempty"`
		} `json:"configuration,omitempty"`
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
	Properties                 map[string]interface{} `json:"properties,omitempty"`
	Default                    interface{}            `json:"default,omitempty"`
	MarkdownDescription        string                 `json:"markdownDescription,omitempty"`
	Description                string                 `json:"description,omitempty"`
	MarkdownDeprecationMessage string                 `json:"markdownDeprecationMessage,omitempty"`
	DeprecationMessage         string                 `json:"deprecationMessage,omitempty"`
	Type                       interface{}            `json:"type,omitempty"`
	Enum                       []interface{}          `json:"enum,omitempty"`
	EnumDescriptions           []string               `json:"enum,omitempty"`
	MarkdownEnumDescriptions   []string               `json:"enum,omitempty"`
}

func main() {
	flag.Parse()

	// Assume this is running from the vscode-go directory.
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	// Find the package.json file.
	data, err := ioutil.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		log.Fatal(err)
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
		s := bytes.Join([][]byte{
			bytes.TrimSpace(split[0]),
			gen,
			toAdd,
		}, []byte("\n\n"))
		newContent := append(s, '\n')

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

	var properties []Property
	var goplsProperty Property
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
}

func writeProperty(b *bytes.Buffer, heading string, p Property) {
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

func defaultDescriptionSnippet(p Property) string {
	if p.Default == nil {
		return ""
	}
	b := &bytes.Buffer{}
	switch p.Type {
	case "object":
		x, ok := p.Default.(map[string]interface{})
		// do nothing if it is nil
		if ok && len(x) > 0 {
			writeMapObject(b, "", x)
		}
	case "string":
		fmt.Fprintf(b, "%q", p.Default)
	case "boolean", "number":
		fmt.Fprintf(b, "%v", p.Default)
	case "array":
		if x, ok := p.Default.([]interface{}); ok && len(x) > 0 {
			fmt.Fprintf(b, "%v", p.Default)
		}
	default:
		if _, ok := p.Type.([]interface{}); ok {
			fmt.Fprintf(b, "%v", p.Default)
			break
		}
		log.Fatalf("implement default when p.Type is %q in %#v %T", p.Type, p, p.Default)
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

func writeGoplsSettingsSection(b *bytes.Buffer, goplsProperty Property) {
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
		pdata, ok := properties[name].(map[string]interface{})
		if !ok {
			fmt.Fprintf(b, "### `%s`\n", name)
			continue
		}
		p := mapToProperty(name, pdata)
		writeProperty(b, "###", p)
		b.WriteString("\n")
	}
}

func mapToProperty(name string, pdata map[string]interface{}) Property {
	p := Property{name: name}

	if v, ok := pdata["properties"].(map[string]interface{}); ok {
		p.Properties = v
	}
	if v, ok := pdata["markdownDescription"].(string); ok {
		p.MarkdownDescription = v
	}
	if v, ok := pdata["description"].(string); ok {
		p.Description = v
	}
	if v, ok := pdata["markdownDeprecationMessage"].(string); ok {
		p.MarkdownDescription = v
	}
	if v, ok := pdata["deprecationMessage"].(string); ok {
		p.DeprecationMessage = v
	}
	if v, ok := pdata["type"].(string); ok {
		p.Type = v
	}
	if v, ok := pdata["enum"].([]interface{}); ok {
		p.Enum = v
	}
	if v, ok := pdata["enumDescriptions"].([]interface{}); ok {
		for _, d := range v {
			p.EnumDescriptions = append(p.EnumDescriptions, d.(string))
		}
	}
	if v, ok := pdata["markdownEnumDescriptions"].([]interface{}); ok {
		for _, d := range v {
			p.MarkdownEnumDescriptions = append(p.MarkdownEnumDescriptions, d.(string))
		}
	}
	if v, ok := pdata["default"]; ok {
		p.Default = v
	}
	return p
}

func writeSettingsObjectProperties(b *bytes.Buffer, properties map[string]interface{}) {
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
		pdata, ok := properties[name].(map[string]interface{})
		if !ok {
			fmt.Fprintf(b, "| `%s` |   |%v", name, ending)
			continue
		}
		p := mapToProperty(name, pdata)

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
func enumDescriptionsSnippet(p Property) string {
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
