// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// Command generate is used to generate documentation from the package.json.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"sort"
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
	Name string

	Default     interface{} `json:"default,omitempty"`
	Description string      `json:"description,omitempty"`
	Type        interface{} `json:"type,omitempty"`
}

func main() {
	// Assume this is running from the vscode-go directory.
	dir, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	if filepath.Base(dir) != "vscode-go" {
		log.Fatalf("run this script from the vscode-go root directory")
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
		content, err := ioutil.ReadFile(filename)
		if err != nil {
			log.Fatal(err)
		}
		gen := []byte(`<!-- Everything below this line is generated. DO NOT EDIT. -->`)
		split := bytes.Split(content, gen)
		if len(split) == 1 {
			log.Fatalf("expected to find %q in %s, not found", filename, gen)
		}
		s := bytes.Join([][]byte{
			bytes.TrimSpace(split[0]),
			gen,
			toAdd,
		}, []byte("\n\n"))
		if err := ioutil.WriteFile(filename, append(s, '\n'), 0644); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("regenerated %s\n", filename)
	}
	var b bytes.Buffer
	for i, c := range pkgJSON.Contributes.Commands {
		b.WriteString(fmt.Sprintf("### `%s`\n\n%s", c.Title, c.Description))
		if i != len(pkgJSON.Contributes.Commands)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "docs", "commands.md"), b.Bytes())

	// Clear so that we can rewrite settings.md.
	b.Reset()

	var properties []Property
	for name, p := range pkgJSON.Contributes.Configuration.Properties {
		properties = append(properties, Property{
			Name:        name,
			Default:     p.Default,
			Description: p.Description,
			Type:        p.Type,
		})
	}
	sort.Slice(properties, func(i, j int) bool {
		return properties[i].Name < properties[j].Name
	})
	for i, p := range properties {
		b.WriteString(fmt.Sprintf("### `%s`\n\n%s", p.Name, p.Description))
		if i != len(properties)-1 {
			b.WriteString("\n\n")
		}
	}
	rewrite(filepath.Join(dir, "docs", "settings.md"), b.Bytes())
}
