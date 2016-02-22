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
const os = require('os');
const net = require('net');
const Promises = require('bluebird');

/**
 * redis cache key
 * @type {Function}
 * @private
 */
const _REDIS_KEY = _.template('__M:_THRIFT_HANDLER__<%= alias %>__<%= id %>');
exports.REDIS_KEY = _REDIS_KEY;
// 1 minite
exports.REDIS_TTL = 60;

/**
 * eth0 for linux, en0 for osx
 */
const _NETWORK_KEYS = ['eth0', 'en0'];

/**
 * emit events
 */
exports.EVENT = {
  ERROR    : 'error',
  LOG      : 'log',
  LISTENING: 'listening'
};

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

exports.trans2Array = trans2Array;

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

exports.trans2Obj = trans2Obj;

/**
 * if param is a function, exe it
 * @param {Function} param
 */
function exec(param) {
  return _.isFunction(param) ? param() : param;
}

exports.exec = exec;

/**
 * get a random string
 * @returns {string}
 */
function randStr() {
  return Math.random().toString(36).substring(10);
}

exports.randStr = randStr;

/**
 * get local ipv4 ip address, using eth0 (linux) en0 (osx)
 */
function getLocalIPv4() {
  let nets = os.networkInterfaces(),
      ip   = '127.0.0.1';
  for (let key in nets) {
    if (nets.hasOwnProperty(key) && _.includes(_NETWORK_KEYS, key)) {
      nets[key].forEach((net) => {
        if (net.family === 'IPv4' && net.internal === false) {
          ip = net.address;
        }
      });
    }
  }

  return ip;
}

exports.getLocalIPv4 = getLocalIPv4;

/**
 * check port in use
 *
 * @param {Number} port
 * @param {Function} callback
 */
function isPortInUse(port, callback) {
  let server = net.createServer((socket) => {
    socket.write('Echo server\r\n');
    socket.pipe(socket);
  });

  server.listen(port, '127.0.0.1');
  server.on('error', () => {
    callback(true);
  });
  server.on('listening', () => {
    server.close();
    callback(false);
  });
}

exports.isPortInUse = isPortInUse;

/**
 * get an unused port
 * @param {Number} port default start from 7007, or from use given
 */
function getUnusedPort(port) {
  return new Promises((resolve) => {
    isPortInUse(port, (isUsed) => {
      if (isUsed) {
        return resolve(getUnusedPort(++port));
      }
      return resolve(port);
    });
  });

}

exports.getUnusedPort = getUnusedPort;

