/**
 * client
 *
 * @author zzxun <xtkml.g@gmail.com>
 */
'use strict';

const thrift = require('thrift');
const ThriftMsg = require('../gen-nodejs/Message'),
      ttypes    = require('../gen-nodejs/msg_types');

let conn   = thrift.createConnection('localhost', 9000),
    client = thrift.createClient(ThriftMsg, conn);


let cmsg = new ttypes.CMsg({
  base: new ttypes.Base({
    sender: 'me',
    msgID : 'test'
  }),
  call: new ttypes.Call({
    name  : '1',
    method: '2',
    params: JSON.stringify([1, 2])
  })
});

client.call(cmsg, function (err, rmsg) {
  console.log(err, rmsg);
});


client.call(cmsg, function (err, rmsg) {
  console.log(err, rmsg);
});

client.call(cmsg, function (err, rmsg) {
  console.log(err, rmsg);
});

conn.on('close', function () {
  console.log(client);
});