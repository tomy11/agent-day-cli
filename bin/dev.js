#!/usr/bin/env node

const path = require('node:path')
require('ts-node').register({
  transpileOnly: true,
  project: path.join(__dirname, '..', 'tsconfig.json'),
})

const {execute} = require('@oclif/core')

execute({
  development: true,
  dir: path.join(__dirname, '..'),
})
