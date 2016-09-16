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

function stringifyByPiece(obj, writeFn) {
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    writeFn(JSON.stringify(obj));
    return;
  }
  writeFn('{');
  var
    keys = Object.keys(obj)
      .filter((key) => {
        // Remove undefined values
        return typeof obj[key] !== 'undefined';
      }),
    lastCommaIndex = keys.length - 1;
  
  keys.forEach((key, index) => {
      writeFn('' + JSON.stringify(key) + ':');
      stringifyByPiece(obj[key], writeFn);
      if (index < lastCommaIndex) {
        writeFn(',');
      }
    });
  writeFn('}');
}

function finalize(result) {
  if (options.dryRun) {
    return;
  }

  const fileName = path.join(result.compiledDataFolder, 'all.json'),
    fs = require('fs'),
    stream = fs.createWriteStream(fileName, { flags: 'w' });

  function writeMore(str) {
    stream.write(str, function() {
      // Now the data has been written.
    });
  }

  stream.once('open', () => {
    console.log('Writing to ' + fileName);
    stringifyByPiece(result, writeMore);
    stream.end();
  });

}

reporter(options)
  .then(finalize);

