# Testing

# Manual testing

## Local development

To test against a local instance of the WPVIP API, you can use the `API_HOST` environment variable. Unset the `VIP_PROXY` variable as well.

Examples:

```bash
VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip app

VIP_PROXY="" API_HOST=http://localhost:4000 node ./dist/bin/vip -- wp option get home
```
