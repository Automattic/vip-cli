# Testing

Testing is an integral part of creating new features and maintaining the software.

## Automated testing

A [few actions](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/) are automatically run via Github Actions when a pull request is created or updated.

### Linting

We [run](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/ci.yml) the following checks:

- linting
- format checking
- type checks

### Dependency checks

We [use](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/ci.yml) the [dependaban action](https://github.com/Automattic/vip-actions/tree/trunk/dependaban) from [Automattic/vip-actions](https://github.com/Automattic/vip-actions/) to verify that no dependencies have install scripts.

### Unit tests

Unit tests in [\_\_tests\_\_](https://github.com/Automattic/vip-cli/tree/trunk/__tests__) are [run](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/ci.yml). They are powered by [Jest](https://facebook.github.io/jest/) and report any failures, along with test coverage.

#### Adding new unit tests

Tests should be written for any major features or security sensitive functionality, as a minimum. Writing tests for new or updated [utility functions](https://github.com/Automattic/vip-cli/blob/trunk/src/lib/utils.ts) is recommended.

### E2E tests

E2E test are [run](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/devenv-e2e.yml). They can be found at [\_\_tests\_\_/devenv-e2e](https://github.com/Automattic/vip-cli/tree/trunk/__tests__/devenv-e2e).

### Windows tests

We run the above unit and E2E tests [on Windows as well](https://github.com/Automattic/vip-cli/blob/trunk/.github./workflows/windows-tests.yml).

### CodeQL analysis

CodeQL analysis is [started automatically](https://github.com/Automattic/vip-cli/blob/trunk/.github/workflows/codeql-analysis.yml).

## Manual testing

### Running unit tests locally

[Install and set up the environment](SETUP.md#installation--setup-instructions), and then run:

```bash
npm run test
```

### Local testing

To test against a local instance of the WPVIP API, you can use the `API_HOST` environment variable. Unset the `VIP_PROXY` variable as well.

Examples:

```bash
VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip app

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip -- wp option get home
```

## Final testing before releasing

TODO: How should final testing before releasing be done?
