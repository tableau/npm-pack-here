# Contributing

## Sign the CLA

Code contributions and improvements by the community are welcomed!
See the [LICENSE](LICENSE) file for current open-source licensing and use information.
Before we can accept pull requests from contributors, we require a signed
[Contributor License Agreement (CLA)](http://tableau.github.io/contributing.html).

## Making Changes

### Initial Build From Source

1. Make sure you have at least node 9.x or better installed (and available on your path)
1. Make sure you have the latest version of yarn installed (and available on your path)
1. Clone this repository locally using git
1. Run `yarn run build` from the repository root

### Development Workflows

After performing the [Initial Build From Source](#initial-build-from-source) steps the following commands can be used:

`yarn run build-fast` can be used to perform the compile and test steps only (skipping the `yarn install` call)

`yarn run compile-watch` can be used to perform the compile step whenever the source or tests change

`yarn run test-watch` can be used to perform the compile and test steps whenever the source or tests change

`yarn run tslint-fix` can be used to fix all auto-fixable tslint errors (like any formatting issues)

These are the recommended commands to use as part of the developer workflow. The full list of available commands is listed in the [package.json scripts](package.json). Note, all commands starting with a colin (`:`) are intended to be internal and not used directly.

#### Wallaby JS Support

If you have a license to use [wallaby js](https://wallabyjs.com/) this project has the necessary configuration in the corresponding [wallaby.js](wallaby.js) file to work.

### Using the Built Version

From within the folder you desire to test from, run the following:

```unix
node <path-to-cloned-repository>/lib/src/cli.js
```

This should run your locally built version of npm-pack-here and if run with no arguments, it should output the help usage text. For usage instruction check out the [readme](readme.md#Demo).
