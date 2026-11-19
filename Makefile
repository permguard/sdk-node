# Copyright (c) 2022 Nitro Agility S.r.l.
# SPDX-License-Identifier: Apache-2.0

# Every target runs the tools package.json pins, through npm: none fetches an unpinned package at
# run time (BUG-0070).

.DEFAULT_GOAL := build

install:
	npm ci

clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/

protoc:
	npm run generate-grpc

typecheck:
	npm run typecheck

test:
	npm test

# Coverage from Node's own test runner, which the suite runs on.
coverage:
	npm run build
	node --require ts-node/register --test --experimental-test-coverage tests/*.test.ts

build:
	npm run build

# disallow any parallelism (-j) for Make. This is necessary since some
# commands during the build process create temporary files that collide
# under parallel conditions.
.NOTPARALLEL:

.PHONY: install clean protoc typecheck test coverage build
