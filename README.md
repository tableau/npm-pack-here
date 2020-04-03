# npm-pack-here

![npm-pack-here icon](docs/images/npm-pack-here-256.png)

[![Community Supported](https://img.shields.io/badge/Support%20Level-Community%20Supported-457387.svg)](https://www.tableau.com/support/itsupport)

> An alternative to the Yarn link and NPM link workflows, this tool packs a local NPM project and
> puts the packed contents into the given destination directories.

* [Why npm-pack-here](#why-npm-pack-here)
* [Demo](#demo)
* [Get started](#get-started)
  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
  * [Upgrading](#upgrading)
* [Using npm-pack-here](#using-npm-pack-here)
  * [Specifying Target Directories](#specifying-target-directories)
  * [Specifying Destination Directories](#specifying-destination-directories)
  * [The Demo with Extra Details](#the-demo-with-extra-details)
  * [When Done Testing](#when-done-testing)
  * [Running Continually (Watch Mode)](#running-continually-watch-mode)
  * [CLI Options](#cli-options)
* [Support](#support)
* [Contributions](#contributions)
* [Prior Art](#prior-art)

## Why npm-pack-here

When testing a locally cloned npm project within another locally cloned project it is common to use
[`yarn link`](https://classic.yarnpkg.com/en/docs/cli/link/) or
[`npm link`](https://docs.npmjs.com/cli/link.html) to setup a folder level symlink to the project
under test. This has a two unfortunate side effects,

* The testing project only has the single `node_modules` folder symlinked and non-of the other
  project dependencies are changed. So if the project under test has changed its dependencies, the
  `node_modules` tree is not updated to reflect that. As a result subtle transitive dependency changes
  (due to different versions being "lifted" by npm/yarn) are not seen until after the project under
  test has released a new package version on npm.
* Since a symlink is used, all the dependency resolution is in a single direction, the project under
  test still only knows about its own `node_modules` tree and knows nothing about the testing
  projects `node_modules` tree. This often leads to duplicate dependencies (which should have
  resolved as the same version), which frequently results in issues. We find this to be especially
  true with typescript typings projects. For example if the project under test exports a react
  component (using typings defined in `@types/react`) this almost always breaks the typescript
  compiler as even the exact same version of the types will lead to typescript failing to compile.

To resolve these problems you could attempt to do one of following workflows (let's assume you have
a `projectB` which has a dependency on a `projectA`),

1. Add a 'file' reference to `projectB` that references the local location of `projectA` (after
   running `yarn install`/`npm install` this results in a copy of `projectA` being put into
   `projectB's` `node_modules` directory). There are two problems with this approach. First, it
   takes forever since the `node_modules` directory in `projectA` is also copied. Second, because
   it copies the `node_modules` directory in `projectA`, you end up running into the same issues
   described above. To maybe make it work, the `node_modules` directory in `projectA` has to be deleted,
   which might or might not work depending on if `projectB` has different versions of the same
   dependencies as `projectA`.
2. Run `npm pack` in `projectA` (which collects all of the content that would be published into a
   tarball), then add a file reference to this packaged version of `projectA` in `projectB`. Now
   running `yarn install` or `npm install` will result in the expected `node_modules` tree. Except
   now different issues occur, first is that yarn has a bug where it will inappropriately cache
   'packaged' tarballs in the global yarn cache. This means re-packaging `projectA` won't result in
   the changes being picked up in `projectB` (unless you delete the yarn cache for `projectA`).
   Also any time `projectA` changes you have to re-run the pack command and then the yarn/npm
   install commands. Which is usually pretty slow and and causes most watch scripts to break.
3. Run `npm pack` in `projectA`, then untar the packaged files into a directory in `projectB`.
   Finally, add a file/link reference to this folder in `projectB`. After running `yarn install`
   or `npm install` this will result in the expected `node_modules` tree. This is the most reliable
   way to do testing of local projects and seems to work well with both yarn and npm. It has the
   same speed issues as number 2 above whenever updating `projectA` (have to repack `projectA`, and
   then untar it anytime you want to pull in new content into `projectB`) and will break watch scripts.

This project essentially automates the third workflow above with additional smart file copying to
ensure watch scripts behave as expected. Also has support for performing this workflow for
multi-level local dependency chains (C depends on B which depends on A).

## Demo

Imagine that you have a `projectB` that has a dependency on a `projectA` (in this example we are
assuming yarn is being used as the package management tool).

In the root directory of `projectB`, run the following:

```cmd
npm-pack-here --target [path-to-projectA]
yarn add file:local_modules/[name-of-projectA]
yarn install --check-files
```

Example output:

```cmd
[path-to-projectB]> npm-pack-here -t [path-to-projectA]
Copying packed files from - [path-to-projectA]
  to - [path-to-projectB]/local_modules/[name-of-projectA]
  to - [path-to-projectB]/node_modules/[name-of-projectA]
[success] Done copying packed files from - [path-to-projectA]


Setup target projects as local dependencies with yarn using:
        yarn add file:local_modules/[name-of-projectA]
        yarn install --check-files

To get updated changes from target projects, run this command again.
        npm-pack-here --target [path-to-projectA]
  or watch continually
        npm-pack-here watch --target [path-to-projectA]

[path-to-projectB]> yarn add file:local_modules/[name-of-projectA]
…

[path-to-projectB]> yarn install --check-files
…
```

At this point everything is setup, `projectB` should be using your local version of `projectA`

After a while say you want to make an update to `projectA`, once the update is made just run the
first `npm-pack-here` command again:

```bash
npm-pack-here --target [path-to-projectA]
```

Example output:

```cmd
[path-to-projectB]> npm-pack-here --target [path-to-projectA]
Copying packed files from - [path-to-projectA]
  to - [path-to-projectB]\local_modules\[name-of-projectA]
  to - [path-to-projectB]\node_modules\[name-of-projectA]
[success] Done copying packed files from - [path-to-projectA]
```

## Get started

### Prerequisites

To work with npm-pack-here, you need the following:

* At least the most recent LTS version of node
* Optionally the latest release of yarn (if using it as your package management tool)

### Installation

Install as a global `yarn` or `npm` dependency,

```cmd
npm install -g npm-pack-here
```

The latest version of the script can now be run using the command `npm-pack-here` (should be
immediately available on your path).

### Upgrading

To get the latest version of npm-pack-here, run the install command again

## Using npm-pack-here

At its core npm-pack-here will identify the packaged content of some set of target source projects
and then place them within some set of destination directories. The two core pieces of information
that it needs to run are the set of target directories and the set of destination directories.

### Specifying Target Directories

To specify the target directories simply pass them in via the required [`--target`](#target-required)
parameter.

### Specifying Destination Directories

To specify the destination directories there are a variety of options which will depend on your
required workflow,

> Note: The packaged content is still placed within sub-directories (named using the projects name)
> within the specified destination directories

#### Specify Destination Directories Directly

Using the [`--destinations`](#destinations-optional) argument (defaults to the single directory
`./local_modules`) you can specify the destination directories directly.

#### Specify A Global Destination Directory Location

Using the [`--useGlobalCache`](#useglobalcache-optional) argument you can specify that a global
location should be used as the destination.

> Note: this can only be done instead of specifying the [`--destinations`](#destinations-optional) argument

This is helpful when trying to test a diamond dependency situation. It will force `yarn`/`npm` to
use absolute paths when resolving dependencies which means the root dependency will resolve to the
same version instead of two different versions.

#### Specify that `node_modules` Sub-Directories Should Be Included as Destinations

Since `npm-pack-here` was designed to be used for testing two locally cloned npm projects with one
another, **by default** the script will detect a `node_modules` directory in the current working
directory and add the correct sub-directories of `node_modules` as destinations (using node's
[`require.resolve`
algorithm](https://nodejs.org/api/modules.html#modules_require_resolve_request_options)). If this
behavior is not desired it can be disabled by passing false to the
[`--updateRelativeNodeModulesDirectory`](#updaterelativenodemodulesdirectory-optional) argument.

### The Demo with Extra Details

Lets walk through the common workflow that the [Demo](#demo) above demonstrated. Imagine that you
have a `projectB` that has a dependency on a `projectA` and are using `yarn` as your dependency
management tool.

In the root directory of `projectB`, run:

```cmd
npm-pack-here --target [path-to-projectA]
```

> This will copy the 'packaged' version of `projectA` into `projectB`'s `./local_modules` and `./node_modules`
> directories. To prevent accidental check-in of `./local_modules`, consider adding the folder to `projectB`'s
> `.gitignore` file (or be sure to delete/revert the directory when you are done).

Next, add a file reference dependency. In the root directory of `projectB`, run:

```bash
yarn add file:./local_modules/[name-of-projectA]
```

> Replace `[name-of-projectA]` with your actual project name. This will set up `yarn` to use the local
> copy when resolving dependencies.

Often I find due to `yarn` not always checking transitive dependencies a follow up install command
is required.

```bash
yarn install --check-files
```

Work in `projectB` and `projectA` as usual. When you are ready to push new changes in `projectA` to
`projectB`, repeat the first step. In the root directory of `projectB` run:

```bash
npm-pack-here --target [path-to-projectA]
```

> Note: If you added or remove a dependency to `projectA`, run `yarn install --check-files` again to
> ensure the dependency tree in `projectB` is updated accordingly
>
> Note: If you do not want to run this command every time you want to push updates check out the
> [Running Continually](#running-continually) section below

### When Done Testing

When you are done testing locally and you want to get back to using the version of `projectA` in the
binary repository, revert the `projectB` line with the `file:` reference in your `package.json` and
re-run `yarn install --check-files`. This should result in your `yarn.lock` file being reverted and
your `node_modules` tree being repopulated with its original content. Also remember to delete the
copy of the packaged content in `projectB`'s `local_modules` directory. Note this is not required if
you added the `local_modules` directory to `projectB`'s `.gitignore`.

### Running Continually (Watch Mode)

The script supports a watch mode so that after performing the initial file copies it will
continually update the destination directories with changes as the packaged content in the target
directories are updated.

To use it run the same command with `watch` added before any other arguments

```cmd
npm-pack-here watch --target [path-to-projectA]
```

### CLI Options

#### Required Options

##### target (Required)

Directories containing npm projects to be packaged and copied to destination directories `[array] [required]`

If testing with multiple local projects, multiple targets may be passed in to bring all of their
packed content into the destination directories.

#### Optional Options

The defaults for these options should work in almost all standard cases, but there might be times
more flexibility is required.

##### destinations (Optional)

Directories to copy packaged content to `[array] [default: ["./local_modules"]]`

##### excludedDestinationPaths (Optional)

Globs for file and directory paths in the destination directory to exclude from being replaced
`[array] [default: ["node_modules"]]`

##### useGlobalCache (Optional)

Used instead of the `destinations` argument, currently experimental so defaults to being false. Will
place the packaged content in a global location instead of `./local_modules`. This is useful if you
want to locally test a multi-level diamond dependency graph, if every level depends on a locally
packaged version of their sub-dependencies then when you roll up to the top level you end up with
multiple versions of the same packages. Using a global location results in `yarn` or `npm` treating
them all as if they where the same dependency.

##### updateRelativeNodeModulesDirectory (Optional)

Defaults to `true`, if set will attempt to add the correct directories from the local `node_modules`
directory to the list of destinations. Uses node's [`require.resolve`
algorithm](https://nodejs.org/api/modules.html#modules_require_resolve_request_options) to ensure
the correct `node_modules` directories are updated. With this argument set, all locally specified
target dependencies are also packed into the working directory's `node_modules` directory.

## Support

If you encounter any surprising or unexpected behavior using this tool or have any questions, please
feel free to open an issue. This tool is [Community Supported](https://www.tableau.com/support/itsupport)
so Tableau Developers will periodically review any open issues.

If you would like to expand the capabilities of what npm-pack-here does, we are open to ideas that
will not be disruptive to the existing supported workflows. Be warned that we have no plans to grow
the problem space that this tool intends to solve. Also we do not want for this tool to become a
proxy for `yarn` or `npm`. We encourage anyone to build off of our work to solve other problems.

## Contributions

See [Contributing](contributing.md) for details.

## Prior Art

An existing project [`yalc`](https://www.npmjs.com/package/yalc) was part of the inspiration for
this one. It is attempting to solve the same problem in a more complex way. Due to the extra
complexity it did not work for us as we needed it to, so built this solution to be more focused on
the exact problem we needed solved.
