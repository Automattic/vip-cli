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
TODO
```

TODO: Instructions for re-starting the application in case of changes.

#### Errors while running

TODO: Note any potential issues with start up here and solutions to them.

### Local application

#### Generating token (locally)

To generate a token that can be used for development, [start the software locally](#starting-up-locally), and then locally run:

```bash
...
```

For information on testing individual API endpoints using tokens, see [TESTING.md](TESTING.md).

### Environmental variables

Environmental variables are configured in the repository.

TODO: Update and adjust the following sections.

#### Configuring environmental variables

Configuring environmental variables in production and locally takes place in the repository via the [docker-compose.yml file](https://github.com/Automattic/vip-cli/blob/trunk/docker-compose.yml) under the `environment` key.

```YAML
  environment:
    API_URL: http://localhost:4000
    DB_NAME: api
    DB_PASS:
    ...
    NEW_ENV_VAR: 'value'
```

#### Adding/editing

To add/edit a new environmental variable, you can use any editor. Some variable values require special encoding (see below). Be careful not to violate the YML syntax.

#### List of environmental variables

This application uses environmental variables for vital configuration information. Find a partial list below.

- `A`: Used to ...
- `B`: Used to ...

#### Overriding locally

You can override any environmental variables locally by adding/editing keys/values in the [.env](https://github.com/Automattic/vip-cli/blob/trunk/.env) file. Be mindful **not** to commit any changes intended for production here.

## Updating dependencies

### NPM packages

Dependencies generally should be updated by merging [pull requests from dependabot](https://github.com/Automattic/vip-cli/pulls/app%2Fdependabot). However, great care should be taken before merging as updating dependencies can cause fatal errors with the `vip-cli` application, or make it unstable or misbehave. There can also be effects to the deployment process. This can happen silently.

### Upgrading Node Version

To upgrade Node, follow these steps:

1. Update [.nvmrc](https://github.com/Automattic/vip-cli/blob/trunk/.nvmrc) to the new version and open a pull request.
1. Address any test failures.
1. [Update the Node.js version](https://docs.wpvip.com/technical-references/software-management/#h-node-js) of the staging environment and test.
1. Update the Node.js version of the production environment.

Upgrading Node should be considered high-risk.

**Node:** Because we deploy new Node versions one container at a time, the API needs to work on the currently deployed Node version as well as the next Node version simultaneously.

### Before merging

Consider removing the dependency, if it is an NPM package. Can the functionality needed from the dependency be implemented directly into `vip-cli` or our own common libraries? If not, evaluate the following:

1. If the dependency is one of the [development dependencies](https://github.com/Automattic/vip-cli/blob/trunk/package.json) (`devDependencies`), and/or only used by one of those, the likelihood of customer-impacting failure is low.
1. Is the package used in the [deployment pipeline](RELEASING.md#deployments-to-production)? If it is, evaluate if any failure is likely to be silent. If that seems not to be the case, the risk of customer-impacting failure is low.

#### Low risk dependencies

If the risk of merging is low, you can go a head and merge without doing anything further (given that all tests succeed).

#### Higher risk dependencies

For higher risk dependencies, the routes/utilities using the dependency [will have to be tested locally](TESTING.md) and the results verified. If the main application is using the dependency, you will have to [launch it locally](SETUP.md#starting-up-locally) and verify that it runs normally.

### After merging

You should monitor the application after deploying, as noted in [RELEASING.md](RELEASING.md#monitoring-post-release).
