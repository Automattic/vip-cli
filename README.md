# vip [![Build Status](https://travis-ci.com/Automattic/vip.svg?token=xWx9qCRAJeRdHxEcWW83&branch=master)](https://travis-ci.com/Automattic/vip)

VIP CLI is your tool for interacting with and managing your VIP Go applications.

## Getting started

First, install the package:

```
npm install -g @automattic/vip
```

Then, launch the command and follow the prompts:

```
vip
```

If you need more information, check out our [VIP CLI documentation](https://vip.wordpress.com/documentation/vip-go/vip-cli/).

## Changelog

### 1.2.0

- We now display a preview of the `sync` feature with the backup time and the search/replace taking place in your database.
- We now display your mapped domain instead of the `vip-go.co` ones in `vip app` and `vip app list`.
- We now display a better message when an environment do not have non-production environments.
- We fixed a bug where the help menu was not showing until you're logged in

https://github.com/Automattic/vip/releases/tag/v1.2.0

### 1.1.0

- We now correctly report errors when `vip sync` fails. Previously, this would incorrectly report that a sync was run previously.
- We fixed permissions issues for some users with `admin` access for repos. They were unable to properly view and access applications.
- We now display more applications in `vip app list` (up to 100!) and have made it easier to browse through a large list thanks to (`$PAGER`|`less`) support. Previously you would only see the first 10 applications in your account.

https://github.com/Automattic/vip/releases/tag/v1.1.0

### 1.0.0

The first release!

- `vip app list`: view a list of all your applications.
- `vip app`: view details about one of your applications.
- `vip sync`: trigger [a data sync](https://vip.wordpress.com/2018/03/28/data-sync-on-vip-go/) to synchronize data from your production environment to non-production environments.

More details at:
- https://vip.wordpress.com/2018/06/21/a-command-line-interface-cli-for-your-vip-sites/
- https://github.com/Automattic/vip/releases/tag/v1.0.0
