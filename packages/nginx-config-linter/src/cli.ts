#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { parseNginxConfig } from "./parser.js";
import { NginxParseError } from "./errors.js";
import { runAllRules } from "./rules/index.js";
import { formatJson, formatText } from "./format.js";

interface CliOptions {
  json?: boolean;
}

const program = new Command();

program
  .name("nginx-config-linter")
  .description(
    "Lint nginx configuration files for common security and correctness issues"
  )
  .argument("<configFile>", "path to the nginx config file to lint")
  .option("--json", "output findings as JSON instead of human-readable text")
  .action((configFile: string, options: CliOptions) => {
    let source: string;
    try {
      source = readFileSync(configFile, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to read '${configFile}': ${message}`);
      process.exitCode = 1;
      return;
    }

    let ast;
    try {
      ast = parseNginxConfig(source);
    } catch (err) {
      if (err instanceof NginxParseError) {
        console.error(`Parse error in ${configFile}: ${err.message}`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Unexpected error parsing ${configFile}: ${message}`);
      }
      process.exitCode = 1;
      return;
    }

    const findings = runAllRules(ast);
    const output = options.json
      ? formatJson(findings)
      : formatText(findings, configFile);
    console.log(output);

    const hasSecurityFinding = findings.some((f) => f.severity === "security");
    process.exitCode = hasSecurityFinding ? 1 : 0;
  });

program.parse();
