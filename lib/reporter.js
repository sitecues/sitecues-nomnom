'use strict';

const fs = require('fs'),
  zlib = require('zlib'),
  es = require('event-stream'),
  path = require('path'),
  constants = require('./constants'),
  repairEvent = require('./repair/event'),
  fetchMissingData = require('./fetch-missing-data'),
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
    console.log('Attempting to fetch missing data %s', logFileName);
    return fetchMissingData(logFileName, logPath);
  }
}

// Don't parse the outer part of the event -- we only care about the clientData field
function getClientData(eventStr) {
  const CLIENT_DATA_PREFIX = '\"clientData\":{',
    startClientData = eventStr.indexOf(CLIENT_DATA_PREFIX);
  if (startClientData >= 0) {
    const clientDataPart = eventStr.substring(startClientData + CLIENT_DATA_PREFIX.length - 1, eventStr.length - 1);
    return JSON.parse(clientDataPart);
  }
}

function processLogFile(logFileName, logPath, dateIndex, reportModules) {
  function processReports(index, clientData) {
    reportModules.forEach((reportModule) => reportModule.onData(index, clientData));
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
            const clientData = getClientData(event);  // Other data doesn't seem helpful
            if (!clientData) {
              console.error('Error, illegal clientData at ' + logFileName + ':%d:\n%s', eventCounter[dateIndex], event);
            }
            else if (repairEvent(clientData)) {
              // Just skip these for now -- they are filling up the list of urls too much
              // Maybe we should track the events but not the urls -- make the location a static string
              if (!clientData.doIgnore) {
                clientData.metadata.sessionEventCount = sessions.getSessionEventCount(dateIndex, clientData);
                if (clientData.metadata.sessionEventCount === 2) {
                  // Create a nonbounce page visit to correspond to the original page-visited event
                  const makeUpPageVisitNonBounceEvent = Object.assign({}, clientData, { name: 'page-visited::nonbounce' });
                  processReports(dateIndex, makeUpPageVisitNonBounceEvent)
                }
                processReports(dateIndex, clientData);
              }
            }
          }
        }
        callback();
      }))
      .on('end', () => {
        ++ numFilesCompleted;
        // logger('Sessions = ' + sessions.getNumSessions(dateIndex) + '   Nonbounce = ' + sessions.getNumNonBounceSessions(dateIndex));
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
          logPath = path.join(constants.DEFAULT_DATA_FOLDER, logFileName),
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

function run(options) {

  config = require('./config')(options);

  console.log(JSON.stringify(config, null, 2));

  try {
    fs.mkdirSync(constants.DEFAULT_DATA_FOLDER); // Ensure data directory created
    fs.mkdirSync(path.join(constants.DEFAULT_DATA_FOLDER, 'compiled')); // Ensure data/compiled directory created
  }
  catch(ex) {
    // Directories already available
  }

  const
    logFileNames = config.logFileNames,
    reportModules = getReportModules(config.reports);

  logger = config.doLogDebugInfo ? console.log : function() {};
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
        missingDays
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

