#!/usr/bin/env node

// USAGE:
//  oz-docs [-c COMPONENT] [-p PORT] [watch [PATTERNS...]]

const path = require('path');
const fs = require('fs');
const proc = require('child_process');
const crypto = require('crypto');
const yaml = require('js-yaml');
const findUp = require('find-up');
const chokidar = require('chokidar');
const chalk = require('chalk');
const isPortReachable = require('is-port-reachable');
const startCase = require('lodash.startcase');

const paths = require('env-paths')('openzeppelin-docs-preview', { suffix: '' });;

const {
  c: componentDir = '.',
  p: port = '8080',
  _: [ command = 'build', ...args ],
} = require('minimist')(process.argv.slice(2));

// Clone docs repo

if (command === 'init') {
  fs.mkdirSync('docs/modules/ROOT/pages', { recursive: true });
  const name = path.basename(process.cwd());
  const title = startCase(name);
  const version = getDocsVersion();

  fs.writeFileSync('docs/antora.yml',
`\
name: ${name}
title: ${title}
version: ${version}
nav:
  - modules/ROOT/nav.adoc
`
  );

  fs.writeFileSync('docs/modules/ROOT/nav.adoc', `* xref:index.adoc[Overview]\n`);
  fs.writeFileSync('docs/modules/ROOT/pages/index.adoc', `= ${title}\n`);

} else {
  const docsDir = getDocsDir();

  setupDocsDir(docsDir);

  const playbook = makePlaybook(docsDir);

  if (command === 'build') {
    build(docsDir, playbook);
    console.error('The site is available at ./build/site');

  } else if (command === 'watch') {
    startServer(port);

    // We will manually run prepare-docs on changes.
    process.env.DISABLE_PREPARE_DOCS = 'true';

    chokidar.watch(args).on('all', debounce(() => {
      console.error(chalk.blue(`Detected source changes, rebuilding docs...`));
      proc.spawnSync('npm', ['run', 'prepare-docs'], {
        stdio: 'inherit',
      });
    }, 500));

    chokidar.watch(['**/*.yml', '**/*.adoc'], {
      cwd: componentDir,
    }).on('all', debounce(() => {
      console.error(chalk.blue(`Detected docs changes, rebuilding site...`));
      build(docsDir, playbook);
      console.error(chalk.green(`The site is available at http://localhost:${port}`));
    }, 500));

  } else {
    console.error(`Unknown command ${command}`);
    process.exit(1);
  }
}

function makePlaybook(docsDir) {
  const component = yaml.safeLoad(fs.readFileSync(path.join(componentDir, 'antora.yml')));

  const playbook = yaml.safeLoad(fs.readFileSync(path.join(docsDir, 'playbook.yml')));
  playbook.content.sources = [ getSource() ];
  playbook.site.start_page = `${component.name}::${component.start_page || 'index.adoc'}`;

  const localPlaybookFile = path.resolve(docsDir, 'local-playbook.yml');
  fs.writeFileSync(localPlaybookFile, yaml.safeDump(playbook));
  return localPlaybookFile;
}

function getSource() {
  const gitDir = findUp.sync('.git', { type: 'directory' });

  if (gitDir === undefined) {
    throw new Error('Must be inside a git repository');
  }

  const repoDir = path.dirname(gitDir);
  const startPath = path.relative(repoDir, componentDir);

  return {
    url: repoDir,
    start_path: startPath,
    branches: 'HEAD',
  };
}

function getDocsDir() {
  const hash = crypto.createHash('sha1')
    .update(process.cwd())
    .digest('hex');
  return path.join(paths.cache, hash);
}

function getDocsRevision(docsDir) {
  return proc.execFileSync('git', [ 'rev-parse', 'HEAD' ], {
    cwd: docsDir,
    encoding: 'utf8',
  });
}

function debounce(fn, delay) {
  let timeout;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn.apply(this);
    }, delay);;
  }
}

function build(docsDir, playbook) {
  proc.spawnSync('npm', ['run', 'build:custom', playbook], {
    cwd: docsDir,
    stdio: 'inherit',
  });
}

async function startServer(port) {
  function error(msg = '') {
    console.error(chalk.red(`There has been an error in the server process.\n${msg}`));
    process.exit(1);
  }

  const portBusy = await isPortReachable(port, { timeout: 100 });

  if (portBusy) {
    error(`Is port ${port} available? Consider using a different port with '-p PORT'.`);
  } else {
    const server = proc.spawn(
      require.resolve('live-server/live-server'),
      [ `--port=${port}`, '--no-browser', 'build/site' ],
    );

    server.on('exit', code => {
      if (code !== 0) {
        error();
      }
    });

    process.on('exit', () => server.kill());
  }
}

function setupDocsDir(docsDir) {
  if (fs.existsSync(docsDir)) {
    const rev1 = getDocsRevision(docsDir);

    proc.spawnSync('git', [ 'pull' ], {
      stdio: 'inherit',
      cwd: docsDir,
    });

    const rev2 = getDocsRevision(docsDir);

    if (rev1 !== rev2) {
      proc.spawnSync('npx', ['yarn'], {
        cwd: docsDir,
        stdio: 'inherit',
      });
    }
  } else {
    proc.spawnSync('git', [
      'clone',
      'https://github.com/OpenZeppelin/docs.openzeppelin.com.git',
      '--depth=1',
      docsDir,
    ], {
      stdio: 'inherit',
    });

    proc.spawnSync('npx', ['yarn'], {
      cwd: docsDir,
      stdio: 'inherit',
    });

    // We create a build directory in cwd and a symlink from the docs dir to it,
    // so that the built docs are placed here.
    fs.mkdirSync('build', { recursive: true });
    fs.symlinkSync(path.resolve('build'), path.join(docsDir, 'build'));
  }
}

function getDocsVersion() {
  const version = require('./package.json').version;

  const [x, y, z] = version.split('.');

  if (x === '0') {
    return `${x}.${y}`;
  } else {
    return `${x}.x`;
  }
}
