# [Unreleased]

## Breaking changes

- Move `settings.json` to the `settings` directory and deprecate loading
  `settings.json` from the root. The deprecation warning means this isn't breaking
  yet, but **this will break eventually**.

## New features

- Custom level types (#1)
- Support for SMM1 level codes (#1)
- Level code resolvers (#1)

## Bug fixes

- Fix founders not being counted as subscribers (#25)

## Other changes

- Moved source files to a `src` subdirectory (#21)
- Reset lurker status more often (#22)
- Add support for command aliases (#24)
- Modify Dockerfile and docker-compose.yml to better support publishing on
  Docker Hub (#36)
- Allow for migration of customCodes.json from the data directory for migration
  from the old Docker container (demize/quesoqueue) (#36)
