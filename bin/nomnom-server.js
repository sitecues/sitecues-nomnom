#!/usr/bin/env node

'use strict';

// Crash and burn, die fast if a rejected promise is not caught.
process.on('unhandledRejection', function (err) {
  console.log(JSON.stringify(err));
});

// Crash and burn, die fast if a rejected promise is not caught.
process.on('unhandledException', function (err) {
  console.log(JSON.stringify(err));
});

require('../web/server.js');
