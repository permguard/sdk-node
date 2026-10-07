# Copyright (c) 2022 Nitro Agility S.r.l.
# SPDX-License-Identifier: Apache-2.0

.DEFAULT_GOAL := build

brew:
	brew install node@20

install:
	npm install

install-dev:
	npm install --save-dev @protobuf-ts/plugin ts-node typescript tsup

clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -f coverage.out
	rm -f result.json

init-dependency:
	npm install @grpc/grpc-js @protobuf-ts/grpc-transport @protobuf-ts/runtime-rpc lodash

protoc:
	npm run generate-grpc

check:
	staticcheck  ./...

test:
	npx jest

teste2e:
	export E2E="TRUE" && npx jest --config=e2e/jest.config.js

coverage:
	npx jest --coverage
	rm -f coverage.out

coverage-plugin:
	npx jest --coverage --testPathPattern=plugin
	rm -f coverage.out

coverage-json:
	npx jest --coverage --json > result.json

build:
	npx tsup

# disallow any parallelism (-j) for Make. This is necessary since some
# commands during the build process create temporary files that collide
# under parallel conditions.
.NOTPARALLEL:

.PHONY: clean protoc test teste2e coverage coverage-json coverage-plugin build
