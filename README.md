# Backend Services for Twilight Market

[![Test](https://github.com/aura-nw/twilight-backend/actions/workflows/test.yml/badge.svg?branch=develop)](https://github.com/aura-nw/twilight-backend/actions/workflows/test.yml)
[![Lint](https://github.com/aura-nw/twilight-backend/actions/workflows/lint.yml/badge.svg)](https://github.com/aura-nw/twilight-backend/actions/workflows/lint.yml)

## Development

In order to run _Twilight backend_ up in local enviroment, there are many ways. But i suggest you run all nesessary services to start up by create them in docker. We define all nesessary service in file [docker-compose](/docker/dev.docker-compose.yml), you can run only one command to start all of them:

```bash
$ yarn run up
```

When you already done, let's migrate database and run SQL query.

Migrate database:

```bash
$ yarn knex migrate:latest
```

Run SQL query:

```bash
$ yarn knex seed:run
```

### Software stack

|                      | Required                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `Blockchain network` | [aurad](https://github.com/aura-nw/aura)                         |
| `Database`           | [redis](https://redis.io/), [pgsql](https://www.postgresql.org/) |

### Development tools

- yarn
- docker & docker-compose

### Run development services

- `yarn`: install dependencies
- `yarn run up`: start containers
- `yarn knex migrate:latest`: migrates database
- `yarn run dev`: start services

### Test

Init test database:

```
yarn knex migrate:latest --env test
```

Test:

```
yarn test
```

Need `runInBand` option because blockchain interactions cannot happen in parallel.
