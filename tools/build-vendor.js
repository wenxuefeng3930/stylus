'use strict';

const fetch = require('node-fetch-commonjs');
const fs = require('fs');
const fse = require('fs-extra');
const glob = require('glob').sync;
const path = require('path');

const KEEP_DIRECTORIES = null;

const files = {
  'codemirror': [
    KEEP_DIRECTORIES,
    'addon/comment/comment.js',
    'addon/dialog',
    'addon/edit/closebrackets.js',
    'addon/edit/matchbrackets.js',
    'addon/fold/brace-fold.js',
    'addon/fold/comment-fold.js',
    'addon/fold/foldcode.js',
    'addon/fold/foldgutter.*',
    'addon/fold/indent-fold.js',
    'addon/hint/anyword-hint.js',
    'addon/hint/css-hint.js',
    'addon/hint/show-hint.*',
    'addon/lint/css-lint.js',
    'addon/lint/json-lint.js',
    'addon/lint/lint.*',
    'addon/scroll/annotatescrollbar.js',
    'addon/search/matchesonscrollbar.*',
    'addon/search/searchcursor.js',
    'addon/selection/active-line.js',
    'keymap/*',
    'lib/*',
    'mode/css',
    'mode/javascript',
    'mode/stylus',
  ],
  'jsonlint': [
    'lib/jsonlint.js',
    'README.md -> LICENSE',
  ],
  'less': [
    'dist/less.min.js',
  ],
  'lz-string-unsafe': [
    'lz-string-unsafe.min.js',
  ],
  'stylelint-bundle': [
    'dist/stylelint-bundle.min.js',
  ],
  'stylus-lang-bundle': [
    'dist/stylus-renderer.min.js',
  ],
  'usercss-meta': [
    'dist/usercss-meta.js',
  ],
  'db-to-cloud': [
    'dist/db-to-cloud.js',
  ],
  'webext-launch-web-auth-flow': [
    'dist/webext-launch-web-auth-flow.js',
  ],
  '@eight04/draggable-list': [
    'dist/draggable-list.iife.js',
  ],
};

main().catch(console.error);

async function main() {
  fse.emptyDirSync('vendor');
  await Promise.all(Object.keys(files).map(async pkg => {
    console.log(`Building ${pkg}...`);
    const pkgName = getFileName(pkg);
    const flatPkg = pkg === pkgName || files[pkgName]
      ? pkg.replace(/\//g, '-')
      : pkgName;
    const res = await buildFiles(pkg, flatPkg, files[pkg]);
    buildLicense(pkg, flatPkg);
    buildReadme(pkg, flatPkg, res);
  }));
  console.log('Building CodeMirror theme list...');
  buildThemeList();
}

async function buildFiles(pkg, flatPkg, patterns) {
  const keepDirs = patterns.includes(KEEP_DIRECTORIES);
  let fetched = '';
  let copied = '';
  for (let pattern of patterns) {
    if (pattern === KEEP_DIRECTORIES) continue;
    pattern = pattern.replace('{VERSION}', require(`${pkg}/package.json`).version);
    const [src, dest = !keepDirs && getFileName(src)] = pattern.split(/\s*->\s*/);
    if (/^https?:/.test(src)) {
      const req = await fetch(src);
      if (req.status >= 400) throw new Error(`Network error ${req.status} for ${src}`);
      fse.outputFileSync(`vendor/${flatPkg}/${dest}`, await req.text());
      fetched += `* ${dest}: ${src}\n`;
    } else {
      const files = glob(`node_modules/${pkg}/${src}`);
      if (!files.length) {
        throw new Error(`Pattern ${src} matches no files`);
      }
      for (const file of files) {
        const destPath = dest
          ? `vendor/${flatPkg}/${dest}`
          : `vendor/${path.relative('node_modules', file).replace(pkg + '/', flatPkg + '/')}`;
        const txt = file.endsWith('.js') && fs.readFileSync(file, 'utf8');
        const txt2 = txt && txt.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n');
        const hasSM = txt && txt !== txt2;
        if (hasSM) {
          fse.outputFileSync(destPath, txt2);
        } else {
          fse.copySync(file, destPath);
        }
        copied += `* ${reportFile(pkg, file, dest)}${hasSM ? ' (removed sourceMappingURL)' : ''}\n`;
      }
    }
  }
  return {fetched, copied};
}

function buildLicense(pkg, flatPkg) {
  const LICENSE = `vendor/${flatPkg}/LICENSE`;
  if (!fs.existsSync(LICENSE)) {
    const [src] = glob(`node_modules/${pkg}/LICEN[SC]E*`);
    if (!src) throw new Error(`Cannot find license file for ${pkg}`);
    fse.copySync(src, LICENSE);
  }
}

function buildReadme(pkg, flatPkg, {fetched, copied}) {
  const {name, version} = require(`${pkg}/package.json`);
  fse.outputFileSync(`vendor/${flatPkg}/README.md`, [
    `## ${name} v${version}`,
    fetched && `Files downloaded from URL:\n${fetched}`,
    copied && `Files copied from NPM (node_modules):\n${copied}`,
  ].filter(Boolean).join('\n\n'));
}

function buildThemeList() {
  fse.outputFileSync('edit/codemirror-themes.js', deindent(`\
    /* Do not edit. This file is auto-generated by build-vendor.js */
    /* eslint-disable max-len, quotes */
    'use strict';

    window.CODEMIRROR_THEMES = {
    ${
      glob('node_modules/codemirror/theme/*.css')
        .sort()
        .map(f =>
        `  '${
          f.match(/([^/\\.]+)\.css$/i)[1].replace(/'/g, '\\&$')
        }': ${
          JSON.stringify(fs.readFileSync(f, 'utf8'))
        },`)
        .join('\n')
    }
    };
    `));
}

function deindent(str) {
  const indent = str.match(/^\s*/)[0];
  return indent
    ? str.replace(new RegExp('^' + indent, 'gm'), '')
    : str;
}

function getFileName(path) {
  return path.split('/').pop();
}

function reportFile(pkg, file, dest) {
  file = path.relative(`node_modules/${pkg}`, file).replace(/\\/g, '/');
  if (!dest || dest === file) {
    return file;
  }
  if (file.includes('/') && getFileName(dest) === getFileName(file)) {
    file = file.replace(/[^/]+$/, '*');
  }
  return `${dest}: ${file}`;
}
