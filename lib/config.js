// Run bin/nomnom-cli to see options

'use strict';

const constants = require('./constants'),
  globFs = require('glob-fs'),
  DEFAULT_VIEW = 'json';

function getReports(reports) {
  if (reports) {
    return reports.split(',');
  }
}

function getLogFileNames(datesArray) {
  return datesArray.map((dateVal) => 'metrics-' + dateVal + '.log.gz');
}

// dateVal is a number like 20160212
function getDateAsString(dateVal) {
  if (dateVal) {
    var dateAsYYYYMMDD = dateVal.toString(),
      year = dateAsYYYYMMDD.substr(2, 2),
      month = dateAsYYYYMMDD.substr(4, 2),
      day = dateAsYYYYMMDD.substr(6, 2);

    return month + '/' + day + '/' + year;
  }
}

// date is a Date object
function getDateAsNumber(date) {
  var year = date.getFullYear(),
    month = date.getMonth() + 1, // getMonth() is zero-based
    day = date.getDate(),
    asString = '' + year + (month > 9 ? '': 0) + month + (day > 9 ? '': 0) + day;
  return parseInt(asString);
}

function getYesterday() {
  var date = new Date();
  date.setDate(date.getDate() - 1);
  return date;
}

function getDatesArray(startDate, endDate, dayStep) {
  var start = new Date(getDateAsString(startDate || constants.BEGINNING_OF_TIME)),
    end = endDate ? new Date(getDateAsString(endDate)) : getYesterday(),
    curr = start,
    result = [];

  while (true) {
    if (curr > end) {
      break;
    }
    result.push(getDateAsNumber(curr));
    curr.setDate(curr.getDate() + dayStep);
  }

  return result;
}

function getAllReports() {
  // Use all reports (contents of reports/*.js)
  const glob = globFs({ gitignore: true}),
    files = glob.readdirSync('lib/reports/*.js');

  return files ? files.map(fileName => fileName.split('reports/')[1].split('.js')[0]) : [];
}

function init(options) {
  const reports = getReports(options.reports) || getAllReports(),
    dates = getDatesArray(options.startDate, options.endDate, options.dayStep || 1),
    logFileNames = getLogFileNames(dates);

  return {
    reports,
    logFileNames,
    dates,
    numDates: logFileNames.length,
    eventStep: options.eventStep || 1,
    keepTopEvents: options.keepTopEvents,
    doLogDebugInfo : options.doLogDebugInfo,
    view: options.view || DEFAULT_VIEW
  };
}

module.exports = init;
