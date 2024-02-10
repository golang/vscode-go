// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The package vscgo is an implementation of
// github.com/golang/vscode-go/vscgo. This is in
// a separate internal package, so
// github.com/golang/vscode-go/extension can import.
package vscgo

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"golang.org/x/telemetry/counter"
)

type command struct {
	usage   string
	short   string
	flags   *flag.FlagSet
	hasArgs bool
	run     func(args []string) error
}

func (c command) name() string {
	name, _, _ := strings.Cut(c.usage, " ")
	return name
}

var allCommands []*command

func init() {
	allCommands = []*command{
		{
			usage: "inc_counters",
			short: "increment telemetry counters",
			run:   runIncCounters,
		},
		{
			usage: "version",
			short: "print version information",
			run:   runVersion,
		},
		{
			usage:   "help <command>",
			short:   "show help for a command",
			hasArgs: true,
			run:     runHelp, // accesses allCommands.
		},
	}

	for _, cmd := range allCommands {
		name := cmd.name()
		if cmd.flags == nil {
			cmd.flags = flag.NewFlagSet(name, flag.ExitOnError)
		}
		cmd.flags.Usage = func() {
			help(name)
		}
	}
}

func Main() {
	counter.Open()
	log.SetFlags(0)
	flag.Usage = usage
	flag.Parse()

	args := flag.Args()
	var cmd *command
	if len(args) > 0 {
		cmd = findCommand(args[0])
	}
	if cmd == nil {
		flag.Usage()
		os.Exit(2)
	}
	cmd.flags.Parse(args[1:]) // will exit on error
	args = cmd.flags.Args()
	if !cmd.hasArgs && len(args) > 0 {
		help(cmd.name())
		failf("\ncommand %q does not accept any arguments.\n", cmd.name())
	}
	if err := cmd.run(args); err != nil {
		failf("%v\n", err)
	}
}

func output(msgs ...interface{}) {
	fmt.Fprintln(flag.CommandLine.Output(), msgs...)
}

func usage() {
	printCommand := func(cmd *command) {
		output(fmt.Sprintf("\t%s\t%s", cmd.name(), cmd.short))
	}
	output("vscgo is a helper tool for the VS Code Go extension, written in Go.")
	output()
	output("Usage:")
	output()
	output("\tvscgo <command> [arguments]")
	output()
	output("The commands are:")
	output()
	for _, cmd := range allCommands {
		printCommand(cmd)
	}
	output()
	output(`Use "vscgo help <command>" for details about any command.`)
	output()
}

func failf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format, args...)
	os.Exit(1)
}

func findCommand(name string) *command {
	for _, cmd := range allCommands {
		if cmd.name() == name {
			return cmd
		}
	}
	return nil
}

func help(name string) {
	cmd := findCommand(name)
	if cmd == nil {
		failf("unknown command %q\n", name)
	}
	output(fmt.Sprintf("Usage: vscgo %s", cmd.usage))
	output()
	output(fmt.Sprintf("%s is used to %s.", cmd.name(), cmd.short))
	anyflags := false
	cmd.flags.VisitAll(func(*flag.Flag) {
		anyflags = true
	})
	if anyflags {
		output()
		output("Flags:")
		output()
		cmd.flags.PrintDefaults()
	}
}

// runIncCounters increments telemetry counters read from stdin.
func runIncCounters(_ []string) error {
	scanner := bufio.NewScanner(os.Stdin)
	if counterFile := os.Getenv("TELEMETRY_COUNTER_FILE"); counterFile != "" {
		return printCounter(counterFile, scanner)
	}
	return runIncCountersImpl(scanner, counter.Add)
}

func printCounter(fname string, scanner *bufio.Scanner) (rerr error) {
	f, err := os.OpenFile(fname, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}
	defer func() {
		if err := f.Close(); rerr == nil {
			rerr = err
		}
	}()
	return runIncCountersImpl(scanner, func(name string, count int64) {
		fmt.Fprintln(f, name, count)
	})
}

const (
	incCountersBadInput = "inc_counters_bad_input"
)

func incCountersInputLength(n int) string {
	const name = "inc_counters_num_input"
	for i := 1; i < 8; i *= 2 {
		if n < i {
			return fmt.Sprintf("%s:<%d", name, i)
		}
	}
	return name + ":>=8"
}

func incCountersDuration(duration time.Duration) string {
	const name = "inc_counters_duration"
	switch {
	case duration < 10*time.Millisecond:
		return name + ":<10ms"
	case duration < 100*time.Millisecond:
		return name + ":<100ms"
	case duration < 1*time.Second:
		return name + ":<1s"
	case duration < 10*time.Second:
		return name + ":<10s"
	}
	return name + ":>=10s"
}

func runIncCountersImpl(scanner *bufio.Scanner, incCounter func(name string, count int64)) error {
	start := time.Now()
	linenum := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var name string
		var count int64
		if _, err := fmt.Sscanf(line, "%s %d", &name, &count); err != nil || count < 0 {
			incCounter(incCountersBadInput, 1)
			return fmt.Errorf("invalid line: %q", line)
		}
		linenum++
		incCounter(name, int64(count))
	}
	incCounter(incCountersInputLength(linenum), 1)
	incCounter(incCountersDuration(time.Since(start)), 1)
	return nil
}

func runVersion(_ []string) error {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		fmt.Println("vscgo: unknown")
		fmt.Println("go: unknown")
		return nil
	}
	fmt.Println("vscgo:", info.Main.Version)
	fmt.Println("go:", info.GoVersion)
	return nil
}

func runHelp(args []string) error {
	switch len(args) {
	case 1:
		help(args[0])
	default:
		flag.Usage()
		failf("too many arguments to \"help\"")
	}
	return nil
}
