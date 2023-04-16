[![Node.js CI](https://github.com/fluid-queue/fluid-queue/actions/workflows/node.js.yml/badge.svg)](https://github.com/fluid-queue/fluid-queue/actions/workflows/node.js.yml) [![Docker Cloud Automated build](https://img.shields.io/docker/cloud/automated/fluidqueue/fluid-queue?style=flat)](https://hub.docker.com/r/fluidqueue/fluid-queue) [![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/fluid-queue/fluid-queue)](https://github.com/fluid-queue/fluid-queue/releases)

[![Discord](https://img.shields.io/discord/1040941309877301268?label=discord)](https://discord.gg/GCM98NKHbF) [![Documentation on fluid-queue.dev](https://img.shields.io/badge/documentation-on%20fluid--queue.dev-purple)](https://fluid-queue.dev)

# fluid-queue

A queue system for Super Mario Maker 2 levels.

This project is based on Queso Queue Plus, which was originally developed by Shoujo (<https://github.com/ToransuShoujo/quesoqueue_plus/>) and diceguyd30 (<https://github.com/diceguyd30/queso_to_go_template>).

To get started with the bot, check out the [setup instructions](https://fluid-queue.dev/setup) on our site. If you have any issues, let us know by [opening an issue](https://github.com/fluid-queue/fluid-queue/issues/new) on Github or joining our [Discord server](https://discord.gg/GCM98NKHbF)!

## Docker Tags

| Tag                                                               | Rule                                                 | Description                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| fluidqueue/fluid-queue:latest                                     | Every push to `main`                                 | The latest stable updates.                                                                                          |
| fluidqueue/fluid-queue:develop                                    | Every push to `develop`                              | The bleeding-edge. May not be as stable, but will always be up to date.                                             |
| fluidqueue/fluid-queue:release-\*                                 | Every manually tagged stable release (`v1.2.3`, etc) | Specific stable versions.                                                                                           |
| fluidqueue/fluid-queue:2.0.0-beta.1<br>(and similar version tags) | Every manually tagged prerelease.                    | Specific alpha/beta/prerelease versions. Tagged on git as just the version number, rather than with a prefixed `v`. |

## Contributing

Most of our contributing guidelines can be found in [CONTRIBUTING.md](https://github.com/fluid-queue/fluid-queue/blob/main/CONTRIBUTING.md). Once you've read that, continue below!

### Building the bot

Since we develop in Typescript, in order to run the bot, you need to build the bot. You should be able to do this fairly easily, as long as you have `git` and Node.JS installed:

```sh
$ git clone https://github.com/fluid-queue/fluid-queue.git
$ cd fluid-queue
$ git checkout develop # Only necessary if you're working on the develop branch
$ npm install
$ npm run build
$ npm run clean # If you need to clean up the build directory
```

### Testing

To run tests:

```sh
$ npm test
```

If you get `TypeError: Converting circular structure to JSON`, try:

```sh
$ npm test -- --detectOpenHandles
```

To run tests without log output:

```sh
$ npm test -- --silent
```

To run a single test:

```sh
$ npm test -- -t custom-levels-v2.1-to-v2.2
```
