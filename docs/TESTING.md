# Testing

Testing is an integral part of creating new features and maintaining the software.

## Automated testing

A [few actions](https://github.com/Automattic/vip-service-boilerplate/blob/trunk/.github/workflows/ci.yml) are automatically run via Github Actions when a pull request is created or updated.

### Linting

TODO: Update this section as needed.

We run the following checks:

- linting
- format checking
- type checks

### Dependency checks

TODO: Update this section as needed.

We use the [dependaban action](https://github.com/Automattic/vip-actions/tree/trunk/dependaban) from [Automattic/vip-actions](https://github.com/Automattic/vip-actions/) to verify that no dependencies have install scripts.

### Unit tests

TODO: Update this section as needed.

Unit tests in [\_\_tests\_\_](https://github.com/Automattic/vip-service-boilerplate/tree/trunk/__tests__) are run. They are powered by [Jest](https://facebook.github.io/jest/) and report any failures, along with test coverage.

#### Adding new unit tests

Tests should be written for any major features or security sensitive functionality, as a minimum. Writing tests for new or updated [utility functions](https://github.com/Automattic/vip-service-boilerplate/tree/trunk/???) is recommended.

### TODO: Other checks?

TODO: Document other types of checks in a similar fashion to the above.

## Manual testing

### Running unit tests locally

[Install and set up the environment](SETUP.md#installation--setup-instructions), and then run:

TODO: Update this section as needed.

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
