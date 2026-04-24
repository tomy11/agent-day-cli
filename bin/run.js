#!/usr/bin/env node

const path = require('node:path')
const {execute} = require('@oclif/core')

execute({
  dir: path.join(__dirname, '..'),
})
