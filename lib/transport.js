/**
 * Copyright (c) 2016 MeiWanBang, All rights reserved.
 * http://www.bigertech.com/
 * @author zzxun
 * @date  16/2/29
 * @description
 *
 */
'use strict';

/**
 * module exports
 *
 * @type {exports|module.exports}
 */
const _ = require('lodash');
const Promises = require('bluebird');
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types'),
      utils     = require('./util');

const ThriftCallingException = ttypes.ThriftCallingException;
const RMsg = ttypes.RMsg;

exports.Processor = ThriftMsg;

/**
 * call handler
 *
 * @param cmsg
 * @param service
 * @param callback
 */
function callHandler(cmsg, service, callback) {

  // get params
  let base   = cmsg.base,
      caller = cmsg.call;
  // caller.
  if (service && service.origin[caller.action]) {
    // check permission
    if (service.actions && !service.actions[caller.action]) {
      callback(new ThriftCallingException({err: 'action error', message: 'aciton forbidden'}), null);
    }
    let median = service.origin[caller.action].apply(null, JSON.parse(caller.params));
    // maybe promise
    if (_.isFunction(median.then) && _.isFunction(median.catch)) {
      median.then((result) => {
          let rmsg = new RMsg({
            base: base,
            res : JSON.stringify({
              result: result
            })
          });
          callback(null, rmsg);
        })
        .catch((err) => {
          callback(new ThriftCallingException({err: err, message: err.message}), null);
        });
    }
    // sync
    else {
      callback(null, new RMsg({
        base: base,
        res : JSON.stringify({
          result: median
        })
      }));
    }
  } else {
    // no handler
    callback(new ThriftCallingException({
      err    : 'action error',
      message: 'cannot find service ' + caller.name + ' or action ' + caller.action
    }), null);
  }

}

exports.callingHandler = callHandler;

/**
 * client call remote service
 * 1. sender, ThriftClient._id
 * 2. client, thrift.createClient
 * 3. alias, action, params
 *
 * @returns {bluebird|exports|module.exports}
 */
function doCall() {
  let sender = arguments[0],
      client = arguments[1],
      alias  = arguments[2],
      action = arguments[3],
      params = arguments[4];

  // msg
  let cmsg = new ttypes.CMsg({
    base: new ttypes.Base({sender: sender, id: utils.randStr()}),
    call: new ttypes.Call({name: alias, action: action, params: JSON.stringify(params)})
  });

  return new Promises((resolve, reject) => {
    client.call(cmsg, function (err, rmsg) {
      if (err) {
        return reject(err);
      }
      return resolve(rmsg);
    });
  });
}

exports.doCall = doCall;

