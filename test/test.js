/**
 * test server and client, use zookeeper as default
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';


require('should');
const _ = require('lodash');
const cloud = require('../index');

/**
 * server and client
 */
const ThriftServer = cloud.ThriftServer;
const ThriftClient = cloud.ThriftClient;

describe('Test thrift services', () => {

  let server,
      client;

  it('should init all', (done) => {
    server = new ThriftServer({
      services: {
        alias  : 'lodash',
        service: _,
        actions: ['isString', 'no_such_action']
      }
    });

    // server.on('log', console.log);
    server.on('error', console.error);
    server.on('ready', () => {

      client = new ThriftClient();

      client.on('log', console.log);
      client.on('error', console.error);
      client.on('ready', () => {
        done();
      });
    });
  });


  describe('#Test with zookeeper', () => {
    it('should be ok with true', (done) => {
      client.call('lodash', 'isString', ['a'])
        .then((data) => {
          data.should.be.eql(true);
          done();
        });
    });

    it('should be ok with false', (done) => {
      client.call('lodash', 'isString', [1])
        .then((data) => {
          data.should.be.eql(false);
          done();
        });
    });

    it('should be rejected', () => {
      client.call('lodash', 'isNumber', [1]).should.be.rejected();
    });

    it('should be rejected', () => {
      return client.call('lodash', 'no_such_action', []).should.be.rejected();
    });
  });


});