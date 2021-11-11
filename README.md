Utilities for setting up and previewing documentation across OpenZeppelin
projects.

> **This is an internal toool for OpenZeppelin projects.**
>
> If you are looking to generate documentation for your Solidity project, check
> out [`solidity-docgen`](https://github.com/OpenZeppelin/solidity-docgen).

### Initial setup (`oz-docs init`)

The `oz-docs init` command will create the necessary directories and files to
include a repo in the docs site, and to preview it with the steps in the next
section.

### Previewing the site locally (`oz-docs build`, `oz-docs watch`)

Add a dev dependency on this repo.

```
npm install --save-dev github:OpenZeppelin/docs-utils
# or yarn add --dev github:OpenZeppelin/docs-utils
```

Use the `oz-docs` executable in the package's scripts. You need to provide the
`-c` option with a path to the Antora component that you want to render (this
is the directory that contains the `antora.yml` file).

You should add two commands: `docs` and `docs:watch`. The latter should use the
`oz-docs watch [PATTERN...]` command. If some of the docs are generated by a
`prepare-docs` command, e.g., extracting them from Solidity or JavaScript
files, you should specifiy glob patterns that match the source files so that
the docs are regenerated automatically.

```diff
   "scripts": {
+    "docs": "oz-docs -c docs",
+    "docs:watch": "npm run docs watch contracts",
     "prepare-docs": "solidity-docgen -i contracts -o docs"
   },
```

### Setting up docs previews on pull requests

The above should enable local previews of the docs. It's also useful to set up
docs previews on pull requests. This is done using Netlify Deploy Previews.

Create a `netlify.toml` file at the root of the repo with the following contents.
(The command and the path may be slightly different for monorepos or repos using
yarn.)

```toml
[build]
command = "npm run docs"
publish = "build/site"
```

Then create a Netlify site connected to the repository. Deploy Previews for the
`master` branch are enabled by default.

You will want to disable the Netlify's checks on pull requests, since they are
only useful for production sites. In the site settings on Netlify, go to "Build
& Deploy", and at the bottom of the page go to "Deploy notifications". Delete
the three notifications that say "rich details".
