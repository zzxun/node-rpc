/**
 * server
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

const _ = require('lodash');
const thrift = require('thrift');
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types');

/**
 * manage all thrift service
 */
class ThriftServer {

  /**
   * config options
   * @param {Object} options config include:
   *   {
   *
   *   }
   */
  constructor(options) {
    this.options = options;
    this.services = {};
  }

  /**
   * add service or services
   * @param {Array|Object} services array - services, object - service, in each service:
   *   {
   *     1. {String} [alias] // unique, if null, use the service.name or service.identity
   *     2. {Object|String} service // service name for global, or service object
   *     3. {Array|String} [method] // method permission, if null, allow all service method
   *   }
   */
  add(services) {

  }

  /**
   * remove service or services
   * @param {Array|String} aliases array - aliases, string - alias
   */
  remove(aliases) {

  }

  start() {
    this.server = thrift.createServer(ThriftMsg, {
      call: function (cmsg, callback) {
        let base   = cmsg.base,
            caller = cmsg.call;

        let rmsg = new ttypes.RMsg({
          base: base,
          res : new ttypes.Res({
            err   : 'fuck',
            result: JSON.stringify(caller)
          })
        });
        callback(null, rmsg);
      }
    }, {});

    this.server.listen(9000);
  }


}

new ThriftServer({});
