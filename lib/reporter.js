'use strict';

const fs = require('fs'),
  zlib = require('zlib'),
  es = require('event-stream'),
  path = require('path'),
  constants = require('./constants'),
  sessions = require('./sessions'),
  eventCounter = [],
  missingDays = [];

let config,
  numFilesCompleted = 0,
  logger;

function getReportModules(reports) {
  return reports.map((report) => {
    const reportModule = require('./reports/' + report);
    reportModule.init(config);
    return reportModule;
  });
}

function findLogFile(logFileName, logPath) {
  try {
    fs.accessSync(logPath);
    return Promise.resolve();
  }
  catch(ex) {
    logger('Log file not available: %s', logFileName);
    return Promise.reject();
  }
}

function getPseudoEvents(parsedEvent) {
  let pseudoEvents = parsedEvent.meta.pseudoEvents || [];
  const sessionEventCount = parsedEvent.sessionEventCount;

  // Create name like page-visited::supported
  pseudoEvents = pseudoEvents.map((pseudoEventName) => parsedEvent.name + '::' + pseudoEventName);

  // Handle sessions -- this is not done in date repair/cleaning/precompile
  if (sessionEventCount > 1) {
    // Second and later page visits are non-bounce visits
    if (parsedEvent.name === 'page-visited' && pseudoEvents.includes('operational')) {
      pseudoEvents = pseudoEvents.concat('page-visited::nonbounce');
    }

    // on event #2, generate an extra page-visited::nonbounce corresponding to the original page-visited event
    if (sessionEventCount === 2) {
      pseudoEvents = pseudoEvents.concat('page-visited::nonbounce')
    }
  }

  return pseudoEvents;
}

// Don't parse the outer part of the event -- we only care about the clientData field
function processLogFile(logFileName, logPath, dateIndex, reportModules) {
  function processReports(clientData) {
    reportModules.forEach((reportModule) => reportModule.onData(dateIndex, clientData));
  }

  return new Promise((resolve) => {

    logger('Begin processing ' + logFileName);

    sessions.init(dateIndex);

    fs.createReadStream(logPath)
      .pipe(zlib.createGunzip())
      .pipe(es.split())
      .pipe(es.map((event, callback) => {
        if (event) {
          eventCounter[dateIndex] = (eventCounter[dateIndex] || 0) + 1;
          if (eventCounter[dateIndex] % config.eventStep === 0 &&
            (!config.keepTopEvents || eventCounter[dateIndex] <= config.keepTopEvents)) {
            const parsedEvent = JSON.parse(event);
            parsedEvent.sessionEventCount = sessions.getSessionEventCount(dateIndex, parsedEvent);
            const pseudoEvents = getPseudoEvents(parsedEvent),
              events = [ parsedEvent.name ].concat(pseudoEvents || []);
            for (let event of events) {
              parsedEvent.name = event;
              processReports(parsedEvent);
            }
          }
        }
        callback();
      }))
      .on('end', () => {
        ++ numFilesCompleted;
        sessions.release(dateIndex);
        const percentCompleted = (100 * numFilesCompleted / config.numDates).toFixed(1);
        logger('Completed #%d [%d\% completed]: %s        Heap=%dk', dateIndex, percentCompleted, logFileName, Math.round(process.memoryUsage().heapUsed/1000));
        resolve();
      })
  });
}

// Go through in reverse so that we can draw from better domain to siteId map when fixing missing site ids
function finishAllReports(logFileNames, reportModules) {
  var MAX_POOLSIZE = 10,
    numLogFiles = logFileNames.length,
    poolSize = Math.min(numLogFiles, MAX_POOLSIZE),
    nextUp = logFileNames.length;

  return new Promise((resolve) => {
    function addToQueue() {
      if (-- nextUp >= 0) {
        // Add another to queue
        const logFileName = logFileNames[nextUp],
          logPath = path.join(config.cleanDataFolder, logFileName),
          nowUp = nextUp;
        findLogFile(logFileName, logPath)
          .then(() => processLogFile(logFileName, logPath, nowUp, reportModules))
          .catch(() => {
            missingDays.push(nowUp);
          })
          .then(addToQueue);
      }
      // Finished but didn't add ... poolSize decreases
      else if (-- poolSize === 0) {
        // None left in pool, we are finished
        resolve();
      }
    }

    // Init queue with poolSize jobs
    for (let count = 0; count < poolSize; count ++) {
      addToQueue();
    }
  });
}

function mkdir(dir) {
  try {
    fs.mkdirSync(dir); // Ensure data directory created
  }
  catch(ex) {
    // Directories already available
  }
}

function run(options) {

  config = require('./config')(options);

  console.log(JSON.stringify(config, null, 2));

  mkdir(config.dataFolder);
  mkdir(config.compiledDataFolder);

  const
    logFileNames = config.logFileNames,
    reportModules = getReportModules(config.reports);

  logger = config.quiet ? function() {} : console.log;
  logger('Begin processing ...');

  // ********* Memory leak debugging **********
  // const memwatch = require('memwatch-next'),
  //   heapdump = require('heapdump');
  // memwatch.on('leak', (info) => {
  //   logger('Leak: ' +JSON.stringify(info, null, 2));
  //   var file = '/code/alewife/nomnom-' + process.pid + '-' + Date.now() + '.heapsnapshot';
  //   heapdump.writeSnapshot(file, function(err){
  //     if (err) console.error(err);
  //     else console.error('Wrote snapshot: ' + file);
  //   });
  // });
  // *******************************************

  return finishAllReports(logFileNames, reportModules)
    .then(() => {
      logger('Processing complete ...');

      const results = {
        missingDays,
        compiledDataFolder: config.compiledDataFolder
      };
      reportModules.forEach((reportModule, index) => {
        const reportData = reportModule.finalize(),
          name = config.reports[index],
          report = reportData;

        results[name] = report;
      });

      logger(results.summary.timing);
      return results;
    });
}

module.exports = run;

