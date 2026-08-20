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

Then, launch the command and follow the prompts:

```bash
vip
```

If you need more information, check out our [VIP-CLI documentation](https://docs.wpvip.com/vip-cli/).

### Installation for developers

The section below is intended for developers.

<summary><details>

#### Version manager

We recommend to use a version manager like [nvm](https://github.com/nvm-sh/nvm) or [nodenv](https://github.com/nodenv/nodenv) to automatically configure the version of Node required by this software package. The [.nvmrc](https://github.com/Automattic/vip-cli/blob/trunk/.nvmrc) file gives these tools the necessary hints for what version to use.

#### Install and setup of API

This software relies on an [API offered by WPVIP](ARCHITECTURE.md#communicating-with-wpvip-api). You may need to have a local instance of that set up for [local testing](TESTING.md#local-testing). Follow internal instructions to set it up locally.

#### Fetching & installing

This will fetch the package and install all dependencies:

```bash
git clone git@github.com:Automattic/vip-cli.git && \
cd vip-cli && npm install
```

#### Building

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

If you need more information, check out our [VIP-CLI documentation](https://docs.wpvip.com/vip-cli/).

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

TODO: Update description of the variables.

- `API_HOST`: HTTP endpoint to use rather than the default. [For internal VIP use](TESTING.md#local-testing).
- `DEBUG API_HOST`:
- `DOCKER_CERT_PATH`:
- `DOCKER_CLIENT_TIMEOUT`:
- `DOCKER_HOST`:
- `DOCKER_TLS_VERIFY`:
- `DO_NOT_TRACK`: [To disable tracking](SETUP.md#analytics).
- `SOCKS_PROXY`:
- `HTTP_PROXY`:
- `NO_PROXY`:
- `VIP_PROXY`: [For internal VIP use](TESTING.md#local-testing).
- `VIP_USE_SYSTEM_PROXY`:
- `WPVIP_DEPLOY_TOKEN`: For use with `vip app deploy` on sites that have custom deploys enabled.

### Configuration files

TODO: List main configuration files and their purpose. How to update.

## Updating dependencies

### NPM packages

Dependencies generally should be updated by merging [pull requests from dependabot](https://github.com/Automattic/vip-cli/pulls/app%2Fdependabot). However, great care should be taken before merging as updating dependencies can cause fatal errors with the `vip-cli` application, or make it unstable or misbehave. There can also be effects to the release process. This can happen silently.

### Upgrading Node Version

To upgrade Node, follow these steps:

1. Update [.nvmrc](https://github.com/Automattic/vip-cli/blob/trunk/.nvmrc) to the new version and open a pull request.
1. Use the same pull request to update `engines.node` in [package.json](https://github.com/Automattic/vip-cli/blob/trunk/package.json).
1. Address any test failures.
1. Update the Node.js version locally and test before merging into the repository.

Upgrading Node should be considered high-risk.

### Before merging

Consider removing the dependency, if it is an NPM package. Can the functionality needed from the dependency be implemented directly into `vip-cli` or our own common libraries? If not, evaluate the following:

1. If the dependency is one of the [development dependencies](https://github.com/Automattic/vip-cli/blob/trunk/package.json) (`devDependencies`), and/or only used by one of those, the likelihood of customer-impacting failure is low.
1. Is the package used in the [release process](RELEASING.md#releasing-a-new-version)? If it is, evaluate if any failure is likely to be silent. If that seems not to be the case, the risk of customer-impacting failure is low.

#### Low risk dependencies

If the risk of merging is low, you can go a head and merge without doing anything further (given that all tests succeed).

#### Higher risk dependencies

For higher risk dependencies, the routes/utilities using the dependency [will have to be tested locally](TESTING.md) and the results verified. If the main application is using the dependency, you will have to [launch it locally](SETUP.md#starting-up-locally) and verify that it runs normally.

### After merging

No special considerations.
