#!/bin/sh

set -e

yarn knex migrate:latest
yarn start
