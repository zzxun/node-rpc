/**
 * util common
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

/**
 * module dependencies
 */
const _ = require('lodash');

/**
 * trans params to array
 * @param {Array|*} params
 * @param {Function} check non-array params
 * @param {*} [defaultValue] if check false, return defaultValue, d
 */
function trans2Array(params, check, defaultValue) {
  // array
  if (_.isArray(params)) {
    return params;
  } else if (check(params)) {
    return [params];
  }
  return defaultValue || [];
}

/**
 * trans params to object
 * @param {Array|*} params
 * @param {Function} check non-array params
 * @param {*} [defaultValue] if check false, return defaultValue, d
 */
function trans2Obj(params, check, defaultValue) {
  // array
  if (_.isArray(params)) {
    return params;
  } else if (check(params)) {
    return [params];
  }
  return defaultValue || [];
}

/**
 * if param is a function, exe it
 * @param {Function} param
 */
function exec(param) {
  return _.isFunction(param) ? param() : param;
}

/**
 * get a random string
 * @param {Number} length of string
 * @returns {string}
 */
function randStr(length) {
  length = length || 2;
  return Math.random().toString(36).substring(2);
}

/**
 * exports
 */
module.exports = {
  trans2Array: trans2Array,
  exec       : exec,
  randStr    : randStr
};
