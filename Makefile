.PHONY: build test clean format install

build:
	npm run build

test:
	npm test

clean:
	rm -rf dist

format:
	npm run format

install: build
	npm install -g .
