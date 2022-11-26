const fs = require('fs');
const crypto = require('crypto');
const { Buffer } = require('node:buffer');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const loaderOptions = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};
const packageDefinition = protoLoader.loadSync(
  [
    './lnd_grpc/proto/lightning.proto',
    './lnd_grpc/proto/invoices.proto',
    './lnd_grpc/proto/router.proto',
  ],
  loaderOptions,
);
require('dotenv').config();
const lnrpc = grpc.loadPackageDefinition(packageDefinition).lnrpc;
const invoicesrpc = grpc.loadPackageDefinition(packageDefinition).invoicesrpc;
const routerrpc = grpc.loadPackageDefinition(packageDefinition).routerrpc;
const macaroon = fs.readFileSync(process.env.LND_GRPC_MACAROON).toString('hex');
process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA';
const lndCert = fs.readFileSync(process.env.LND_GRPC_CERT);
const sslCreds = grpc.credentials.createSsl(lndCert);
const macaroonCreds = grpc.credentials.createFromMetadataGenerator(function (args, callback) {
  const metadata = new grpc.Metadata();
  metadata.add('macaroon', macaroon);
  callback(null, metadata);
});
const creds = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);
const lightning = new lnrpc.Lightning(
  `${process.env.LND_GRPC_ENDPOINT}:${process.env.LND_GRPC_PORT}`,
  creds,
);
const invoices = new invoicesrpc.Invoices(
  `${process.env.LND_GRPC_ENDPOINT}:${process.env.LND_GRPC_PORT}`,
  creds,
);
const router = new routerrpc.Router(
  `${process.env.LND_GRPC_ENDPOINT}:${process.env.LND_GRPC_PORT}`,
  creds,
);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const lndService = {
  getInfo() {
    const request = {};
    return new Promise((resolve, reject) => {
      lightning.getInfo(request, (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      });
    });
  },
  decodePayReq(pay_req) {
    const request = {
      pay_req,
    };
    return new Promise((resolve, reject) => {
      lightning.decodePayReq(request, (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      });
    });
  },
  queryRoutes(pub_key, amt, final_cltv_delta, route_hints) {
    const request = {
      pub_key,
      amt,
      final_cltv_delta,
      use_mission_control: false,
      route_hints,
    };
    return new Promise((resolve, reject) => {
      lightning.queryRoutes(request, (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      });
    });
  },
  sendToRouteV2(payment_hash, route, final_cltv_delta) {
    const request = {
      payment_hash,
      route,
      final_cltv_delta,
    };
    return new Promise((resolve, reject) => {
      router.sendToRouteV2(request, (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      });
    });
  },
  sendPaymentV2(payment_request) {
    const request = {
      payment_request,
      timeout_seconds: 30,
    };
    const call = router.sendPaymentV2(request);
    console.log('dispatchPayment');
    call.on('data', function (response) {
      // A response was received from the server.
      console.log(response);
    });
    call.on('end', function () {
      // The server has closed the stream.
      console.log('The server has closed the stream. [sendPaymentV2]');
    });
  },
  keysend(dest, amt, id) {
    const secret = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256').update(secret).digest();
    const dest_custom_records = [];
    dest_custom_records[5482373484] = secret;
    const request = {
      dest: Buffer.from(dest, 'hex'),
      amt: amt,
      payment_hash: Buffer.from(hash, 'hex'),
      dest_custom_records,
      timeout_seconds: 10,
      fee_limit_sat: 100000,
      allow_self_payment: true,
      no_inflight_updates: true,
    };

    const call = router.sendPaymentV2(request);

    call.on('data', async function (response) {
      // A response was received from the server.
      //console.log(response);
      if (response.status == 'FAILED') {
        try {
          await prisma.payment.update({
            data: {
              status: 'failed',
              paymentIndex: parseInt(response.payment_index),
              failureReason: response.failure_reason,
              updatedAt: new Date(),
            },
            where: { id: id },
          });
        } catch (err) {
          console.log(err);
        }
      } else if (response.status == 'SUCCEEDED') {
        try {
          await prisma.payment.update({
            data: {
              status: 'paid',
              paymentIndex: parseInt(response.payment_index),
              updatedAt: new Date(),
            },
            where: { id: id },
          });
        } catch (err) {
          console.log(err);
        }
      } else {
        console.log(response.status);
      }
    });
    call.on('end', function () {
      // The server has closed the stream.
      console.log('The server has closed the stream. [sendPaymentV2]');
    });
  },
  async prePayProbe(pub_key, amount, final_cltv_delta, payment_hash, route_hints) {
    const MAX_ROUTES_TO_REQUEST = 3;
    const all_routes = [];
    let num_requested_routes = 0;
    while (true) {
      //console.log(route_hints);
      let routes = await lndService.queryRoutes(pub_key, amount, final_cltv_delta, route_hints);
      routes = routes.routes;
      //console.log(routes[0])
      if (routes == undefined) {
        console.log('Could not find any suitable route ${pub_key}');
        break;
      } else {
        num_requested_routes += 1;
        if (!all_routes.includes(routes[0])) {
          all_routes.push(routes[0]);
          const response = await lndService.sendToRouteV2(payment_hash, routes[0]);
          console.log(response.route.hops);
          // 1 : INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS
          // 15: TEMPORARY_CHANNEL_FAILURE
          if (response.failure.code == 'INCORRECT_OR_UNKNOWN_PAYMENT_DETAILS') {
            console.log(response.failure.code);
            console.log('SUCCESS');
            return routes[0];
          } else {
            console.log(response.failure.code);
          }
        }
      }

      if (num_requested_routes >= MAX_ROUTES_TO_REQUEST) {
        console.log('Max probing request attemped');
        break;
      }
    }
  },
};

module.exports = lndService;
