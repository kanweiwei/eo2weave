#!/usr/bin/env node

import { $ } from 'zx';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const extensionPackagePath = path.join(projectRoot, 'browser-extension/package.json');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`Release aborted: ${message}`);
  process.exit(1);
}

function parseVersion(version) {
  const match = version.match(versionPattern);
  if (!match) {
    fail('version must use the stable SemVer form X.Y.Z (for example, 1.1.7).');
  }

  return match.slice(1).map(Number);
}

function isNewerVersion(currentVersion, nextVersion) {
  const currentParts = parseVersion(currentVersion);
  const nextParts = parseVersion(nextVersion);

  for (let index = 0; index < currentParts.length; index += 1) {
    if (nextParts[index] !== currentParts[index]) {
      return nextParts[index] > currentParts[index];
    }
  }

  return false;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const dryRun = arguments_.includes('--dry-run');
  const versionArguments = arguments_.filter((argument) => argument !== '--dry-run');

  if (versionArguments.length !== 1) {
    fail('usage: pnpm release <version> [--dry-run]');
  }

  const nextVersion = versionArguments[0];
  parseVersion(nextVersion);

  process.chdir(projectRoot);

  const extensionPackageContent = await readFile(extensionPackagePath, 'utf8');
  const extensionPackage = JSON.parse(extensionPackageContent);
  const currentVersion = extensionPackage.version;

  if (!isNewerVersion(currentVersion, nextVersion)) {
    fail(`version ${nextVersion} must be newer than the current version ${currentVersion}.`);
  }

  const tag = `v${nextVersion}`;
  const existingTag = await $({ nothrow: true })`git tag --list ${tag}`;
  if (existingTag.stdout.trim()) {
    fail(`tag ${tag} already exists.`);
  }

  console.log(`Preparing release ${tag} from browser-extension ${currentVersion}.`);

  if (dryRun) {
    console.log('Dry run passed. The script would:');
    console.log(`  1. Set browser-extension/package.json to ${nextVersion}`);
    console.log(`  2. Generate CHANGELOG.md with git-cliff for ${tag}`);
    console.log(`  3. Commit the release as "chore(release): ${tag}"`);
    console.log(`  4. Create annotated tag ${tag}`);
    return;
  }

  const status = await $`git status --porcelain`;
  if (status.stdout.trim()) {
    fail('the working tree must be clean before creating a release.');
  }

  const updatedExtensionPackageContent = extensionPackageContent.replace(
    `"version": "${currentVersion}"`,
    `"version": "${nextVersion}"`,
  );

  if (updatedExtensionPackageContent === extensionPackageContent) {
    fail('could not update browser-extension/package.json version.');
  }

  await writeFile(extensionPackagePath, updatedExtensionPackageContent);
  await $`pnpm dlx git-cliff --tag ${tag} -o ${changelogPath}`;
  await $`git add -- browser-extension/package.json CHANGELOG.md`;
  await $`git commit -m ${`chore(release): ${tag}`}`;
  await $`git tag -a ${tag} -m ${tag}`;

  console.log(`Release ${tag} is ready. Push it with:`);
  console.log('  git push');
  console.log(`  git push origin ${tag}`);
}

await main();
