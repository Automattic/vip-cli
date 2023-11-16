# Setup

## Language & requirements

- Implemented in JavaScript and TypeScript.
- Requirements are:
  - Node, see version in [package.json](https://github.com/Automattic/vip-cli/blob/trunk/package.json)
  - A number of NPM packages are needed, those are listed in the same file.
  - No special hardware requirements.
  - Network access.

## Installation & setup instructions

### Installation for end-users

First, install the package:

```bash
npm install -g @automattic/vip
```

The above command may fail in Linux if you do not have `make` and `g++` installed. In that case, install them first:

```bash
sudo apt install make g++
```

Then, launch the command and follow the prompts:

```bash
vip
```

If you need more information, check out our [VIP-CLI documentation](https://docs.wpvip.com/technical-references/vip-cli/).

### Installation for developers

The section below is intended for developers.

<summary><details>

#### Version manager

We recommend to use a version manager like [nvm](https://github.com/nvm-sh/nvm) or [nodenv](https://github.com/nodenv/nodenv) to automatically configure the version of Node required by this software package. The [.nvmrc](https://github.com/Automattic/vip-cli/blob/trunk/.nvmrc) file gives these tools the necessary hints for what version to use.

#### Install and setup ...

TODO: Does this software rely on other software? Link to setup instructions for that.

To be able to function, [??](https://github.com/Automattic/???) (???), has to be [installed, set up and running](https://github.com/Automattic/???/tree/trunk/docs/SETUP.md) before this package is started. Please ensure to complete this step before attempting to install and run the package.

### Fetching & installing

This will fetch the package and install all dependencies:

```bash
git clone git@github.com:Automattic/vip-cli.git && \
cd vip-cli && npm install
```

### Building

This will build all TypeScript files so they can be executed:

```bash
cd vip-cli && \
npm run build
```

</details></summary>

## Usage

The software runs as standalone CLI and relies on environmental variables for configuration and a few configuration files.

### Starting up locally

To start the software locally, run:

```bash
vip
```

If you need more information, check out our [VIP-CLI documentation](https://docs.wpvip.com/technical-references/vip-cli/).

### Analytics

By default, we record information about the usage of this tool using an in-house analytics sytem. If you would prefer to opt-out of this data collection, you can do so via the `DO_NOT_TRACK` environment variable. You may either export it in your shell configuration or specify it on the command line (e.g. `DO_NOT_TRACK=1 vip app list`).

### Local application

#### Configuring access token

Install the software locally, run and follow the instructions to configure the access token.

### Environmental variables

#### Configuring environmental variables

Environmental variables are configured in the shell. Use normal shell commands to set them.

#### List of environmental variables

This application uses environmental variables for vital configuration information. Find a partial list below.

TODO:

- `A`: Used to ...
- `B`: Used to ...

## Updating dependencies

### NPM packages

Dependencies generally should be updated by merging [pull requests from dependabot](https://github.com/Automattic/vip-cli/pulls/app%2Fdependabot). However, great care should be taken before merging as updating dependencies can cause fatal errors with the `vip-cli` application, or make it unstable or misbehave. There can also be effects to the deployment process. This can happen silently.

### Upgrading Node Version

To upgrade Node, follow these steps:

1. Update [.nvmrc](https://github.com/Automattic/vip-cli/blob/trunk/.nvmrc) to the new version and open a pull request.
1. Address any test failures.
1. Update the Node.js version locally and test before merging into the repository.

Upgrading Node should be considered high-risk.

### Before merging

Consider removing the dependency, if it is an NPM package. Can the functionality needed from the dependency be implemented directly into `vip-cli` or our own common libraries? If not, evaluate the following:

1. If the dependency is one of the [development dependencies](https://github.com/Automattic/vip-cli/blob/trunk/package.json) (`devDependencies`), and/or only used by one of those, the likelihood of customer-impacting failure is low.
1. Is the package used in the [deployment pipeline](RELEASING.md#deployments-to-production)? If it is, evaluate if any failure is likely to be silent. If that seems not to be the case, the risk of customer-impacting failure is low.

#### Low risk dependencies

If the risk of merging is low, you can go a head and merge without doing anything further (given that all tests succeed).

#### Higher risk dependencies

For higher risk dependencies, the routes/utilities using the dependency [will have to be tested locally](TESTING.md) and the results verified. If the main application is using the dependency, you will have to [launch it locally](SETUP.md#starting-up-locally) and verify that it runs normally.

### After merging

No special considerations.
