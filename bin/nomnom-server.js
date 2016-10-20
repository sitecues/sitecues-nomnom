#!/usr/bin/env node

'use strict';

// Crash and burn, die fast if a rejected promise is not caught.
process.on('unhandledRejection', function (err) {
  console.log(JSON.stringify(err));
  throw err;
});

require('../web/server.js');
