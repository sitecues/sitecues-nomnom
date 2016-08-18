#!/usr/bin/env node

'use strict';

const path = require('path');

// Crash and burn, die fast if a rejected promise is not caught.
process.on('unhandledRejection', function (err) {
  throw err;
});

const
  options = require('yargs').usage('Usage: $0 <command> [options]')
    .describe('reports', 'Comma-separated lists of reports from lib/reports/ folder (default = all)')
    .string('reports')
    .describe('start', 'Start either as a filename, or a date in the format YYYYMMDD')
    .string('start')
    .describe('end', 'End either as a filename, or a date in the format YYYYMMDD')
    .string('end')
    .describe('dataFolder', 'Location of data')
    .string('dataFolder')
    .describe('keepTopEvents', 'Sample n top events from each day -- very fast but does not provide truly representative sample.')
    .number('keepTopEvents')
    .describe('eventStep', 'Sample every nth item')
    .number('eventStep')
    .describe('daysStep', 'Sample every nth day')
    .number('dayStep')
    .describe('dryRun', 'Don\'t actually save results')
    .boolean('dryRun')
    .describe('quiet', 'Silence debug info?')
    .default('quiet', false)
    .boolean('quiet')
    .help('h')
    .alias('h', 'help')
    .argv,
  reporter = require('../lib/reporter.js');

reporter(options)
  .then(function (result) {
    if (!options.dryRun) {
      const fileName = path.join(result.compiledDataFolder, 'all.json');
      console.log('Writing to ' + fileName);
      require('fs').writeFileSync(fileName, JSON.stringify(result));
    }
  });
