import { eacrwalletCfg, getWalletPath, getExecutablePath, eacrdCfg, getAppDataDirectory, getEcrdRpcCert, getEcrdPath } from "./paths";
import { getWalletCfg, readEcrdConfig } from "config";
import { createLogger, AddToEcrdLog, AddToEacrwalletLog, AddToDcrlndLog, GetEcrdLogs,
  GetEacrwalletLogs, lastErrorLine, lastPanicLine, ClearEacrwalletLogs, CheckDaemonLogs } from "./logging";
import parseArgs from "minimist";
import { OPTIONS } from "constants";
import os from "os";
import fs from "fs-extra";
import util from "util";
import { spawn } from "child_process";
import isRunning from "is-running";
import stringArgv from "string-argv";
import { concat, isString } from "../fp";
import * as ln from "wallet/ln";
import webSocket from "ws";
import path from "path";

const argv = parseArgs(process.argv.slice(1), OPTIONS);
const debug = argv.debug || process.env.NODE_ENV === "development";
const logger = createLogger(debug);

let eacrdPID, dcrwPID, dcrlndPID;

// windows-only stuff
let dcrwPipeRx, dcrwPipeTx, eacrdPipeRx, dcrwTxStream;

let dcrwPort;
let rpcuser, rpcpass, rpccert, rpchost, rpcport;
let dcrlndCreds;

let eacrdSocket = null;

function closeClis() {
  // shutdown daemon and wallet.
  // Don't try to close if not running.
  if(eacrdPID && eacrdPID !== -1)
    closeDCRD();
  if(dcrwPID && dcrwPID !== -1)
    closeDCRW();
  if(dcrlndPID && dcrlndPID !== -1)
    closeDcrlnd();
}

export function closeDCRD() {
  if (eacrdPID === -1) {
    // process is not started by eacrediton
    return true;
  }
  if (isRunning(eacrdPID) && os.platform() != "win32") {
    logger.log("info", "Sending SIGINT to eacrd at pid:" + eacrdPID);
    process.kill(eacrdPID, "SIGINT");
    eacrdPID = null;
  } else if (require("is-running")(eacrdPID)) {
    try {
      const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
      win32ipc.closePipe(eacrdPipeRx);
      eacrdPID = null;
    } catch (e) {
      logger.log("error", "Error closing eacrd piperx: " + e);
      return false;
    }
  }
  return true;
}

export const closeDCRW = () => {
  if (dcrwPID === -1) {
    // process is not started by eacrediton
    return true;
  }
  try {
    if (isRunning(dcrwPID) && os.platform() != "win32") {
      logger.log("info", "Sending SIGINT to eacrwallet at pid:" + dcrwPID);
      process.kill(dcrwPID, "SIGINT");
    } else if (isRunning(dcrwPID)) {
      try {
        const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
        dcrwTxStream.close();
        win32ipc.closePipe(dcrwPipeTx);
        win32ipc.closePipe(dcrwPipeRx);
      } catch (e) {
        logger.log("error", "Error closing eacrwallet piperx: " + e);
      }
    }
    dcrwPID = null;
    return true;
  } catch (e) {
    logger.log("error", "error closing wallet: " + e);
    return false;
  }
};

// Send a shutdown request to the dcrlnd daemon. Only used in windows while
// we don't have piperx/pipetx to command it.
const rpcStopDcrlnd = async (creds) => {
  logger.log("info", "Stopping dcrlnd daemon via RPC call");
  let lnClient = await ln.getLightningClient(creds.address, creds.port, creds.certPath, creds. macaroonPath);
  await ln.stopDaemon(lnClient);
};

export const closeDcrlnd = () => {
  if (dcrlndPID === -1) {
    // process is not started by eacrediton
    return true;
  }
  if (isRunning(dcrlndPID) && os.platform() != "win32") {
    logger.log("info", "Sending SIGINT to dcrlnd at pid:" + dcrlndPID);
    process.kill(dcrlndPID, "SIGINT");
    dcrlndPID = null;
    dcrlndCreds = null;
  } else if (require("is-running")(dcrlndPID)) {
    // TODO: needs piperx (and ideally pipetx) in dcrlnd
    // For the moment we'll use the StopDaemon() rpc call in dcrlnd.
    /*
    try {
      const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
      win32ipc.closePipe(dcrlndPipeRx);
      dcrlndPID = null;
      dcrlndCreds = null;
    } catch (e) {
      logger.log("error", "Error closing dcrlnd piperx: " + e);
      return false;
    }
    */
    rpcStopDcrlnd(dcrlndCreds);
    dcrlndPID = null;
    dcrlndCreds = null;
  }
  return true;
};

export async function cleanShutdown(mainWindow, app) {
  // Attempt a clean shutdown.
  return new Promise(resolve => {
    const cliShutDownPause = 2; // in seconds.
    const shutDownPause = 3; // in seconds.
    closeClis();
    // Sent shutdown message again as we have seen it missed in the past if they
    // are still running.
    setTimeout(function () { closeClis(); }, cliShutDownPause * 1000);
    logger.log("info", "Closing eacrediton.");

    let shutdownTimer = setInterval(function () {
      const stillRunning = eacrdPID !== -1 && (isRunning(eacrdPID) && os.platform() != "win32");

      if (!stillRunning) {
        logger.log("info", "Final shutdown pause. Quitting app.");
        clearInterval(shutdownTimer);
        if (mainWindow) {
          mainWindow.webContents.send("daemon-stopped");
          setTimeout(() => { mainWindow.close(); app.quit(); }, 1000);
        } else {
          app.quit();
        }
        resolve(true);
      }
      logger.log("info", "Daemon still running in final shutdown pause. Waiting.");

    }, shutDownPause * 1000);
  });
}

export const launchDCRD = (params, testnet, reactIPC) => new Promise((resolve,reject) => {
  let rpcCreds, appdata;

  rpcCreds = params && params.rpcCreds;
  appdata = params && params.appdata;

  if (rpcCreds) {
    rpcuser = rpcCreds.rpc_user;
    rpcpass = rpcCreds.rpc_pass;
    rpccert = rpcCreds.rpc_cert;
    rpchost = rpcCreds.rpc_host;
    rpcport = rpcCreds.rpc_port;
    eacrdPID = -1;
    AddToEcrdLog(process.stdout, "eacrd is connected as remote", debug);
    return resolve(rpcCreds);
  }
  if (eacrdPID === -1) {
    const creds = {
      rpc_user: rpcuser,
      rpc_pass: rpcpass,
      rpc_cert: rpccert,
      rpc_host: rpchost,
      rpc_port: rpcport
    };
    return resolve(creds);
  }

  if (!appdata) appdata = getEcrdPath();

  let args = [ "--nolisten" ];
  const newConfig = readEcrdConfig(testnet);

  args.push(`--configfile=${eacrdCfg(getAppDataDirectory())}`);
  args.push(`--appdata=${appdata}`);

  if (testnet) {
    args.push("--testnet");
  }


  rpcuser = newConfig.rpc_user;
  rpcpass = newConfig.rpc_pass;
  newConfig.rpc_cert = getEcrdRpcCert(appdata);
  rpccert = newConfig.rpc_cert;
  rpchost = newConfig.rpc_host;
  rpcport = newConfig.rpc_port;

  const eacrdExe = getExecutablePath("eacrd", argv.custombinpath);
  if (!fs.existsSync(eacrdExe)) {
    logger.log("error", "The eacrd executable does not exist. Expected to find it at " + eacrdExe);
    return;
  }

  if (os.platform() == "win32") {
    try {
      const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
      eacrdPipeRx = win32ipc.createPipe("out");
      args.push(util.format("--piperx=%d", eacrdPipeRx.readEnd));
    } catch (e) {
      logger.log("error", "can't find proper module to launch eacrd: " + e);
    }
  }

  logger.log("info", `Starting ${eacrdExe} with ${args}`);

  const eacrd = spawn(eacrdExe, args, {
    detached: os.platform() === "win32",
    stdio: [ "ignore", "pipe", "pipe" ]
  });

  eacrd.on("error", function (err) {
    reject(err);
  });

  eacrd.on("close", (code) => {
    if (code !== 0) {
      let lastEcrdErr = lastErrorLine(GetEcrdLogs());
      if (!lastEcrdErr || lastEcrdErr === "") {
        lastEcrdErr = lastPanicLine(GetEcrdLogs());
      }
      logger.log("error", "eacrd closed due to an error: ", lastEcrdErr);
      return reject(lastEcrdErr);
    }

    logger.log("info", `eacrd exited with code ${code}`);
  });

  eacrd.stdout.on("data", (data) => {
    AddToEcrdLog(process.stdout, data, debug);
    if (CheckDaemonLogs(data.toString("utf-8"))) {
      reactIPC.send("warning-received", true, data.toString("utf-8"));
    }
    resolve(data.toString("utf-8"));
  });

  eacrd.stderr.on("data", (data) => {
    AddToEcrdLog(process.stderr, data, debug);
    reject(data.toString("utf-8"));
  });

  newConfig.pid = eacrd.pid;
  eacrdPID = eacrd.pid;
  logger.log("info", "eacrd started with pid:" + newConfig.pid);

  eacrd.unref();
  return resolve(newConfig);
});

// DecodeDaemonIPCData decodes messages from an IPC message received from eacrd/
// eacrwallet using their internal IPC protocol.
// NOTE: very simple impl for the moment, will break if messages get split
// between data calls.
const DecodeDaemonIPCData = (data, cb) => {
  let i = 0;
  while (i < data.length) {
    if (data[i++] !== 0x01) throw "Wrong protocol version when decoding IPC data";
    const mtypelen = data[i++];
    const mtype = data.slice(i, i+mtypelen).toString("utf-8");
    i += mtypelen;
    const psize = data.readUInt32LE(i);
    i += 4;
    const payload = data.slice(i, i+psize);
    i += psize;
    cb(mtype, payload);
  }
};

export const launchDCRWallet = (mainWindow, daemonIsAdvanced, walletPath, testnet, reactIPC) => {
  let args = [ "--configfile=" + eacrwalletCfg(getWalletPath(testnet, walletPath)) ];

  const cfg = getWalletCfg(testnet, walletPath);

  args.push("--gaplimit=" + cfg.get("gaplimit"));

  const dcrwExe = getExecutablePath("eacrwallet", argv.custombinpath);
  if (!fs.existsSync(dcrwExe)) {
    logger.log("error", "The eacrwallet executable does not exist. Expected to find it at " + dcrwExe);
    return;
  }

  const notifyGrpcPort = (port) => {
    dcrwPort = port;
    logger.log("info", "wallet grpc running on port", port);
    mainWindow.webContents.send("eacrwallet-port", port);
  };

  const decodeDcrwIPC = data => DecodeDaemonIPCData(data, (mtype, payload) => {
    if (mtype === "grpclistener") {
      const intf = payload.toString("utf-8");
      const matches = intf.match(/^.+:(\d+)$/);
      if (matches) {
        notifyGrpcPort(matches[1]);
      } else {
        logger.log("error", "GRPC port not found on IPC channel to eacrwallet: " + intf);
      }
    }
  });

  if (os.platform() == "win32") {
    try {
      const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
      dcrwPipeRx = win32ipc.createPipe("out");
      args.push(util.format("--piperx=%d", dcrwPipeRx.readEnd));

      dcrwPipeTx = win32ipc.createPipe("in");
      args.push(util.format("--pipetx=%d", dcrwPipeTx.writeEnd));
      args.push("--rpclistenerevents");
      const pipeTxReadFd = win32ipc.getPipeEndFd(dcrwPipeTx.readEnd);
      dcrwPipeTx.readEnd = -1; // -1 == INVALID_HANDLE_VALUE

      dcrwTxStream = fs.createReadStream("", { fd: pipeTxReadFd });
      dcrwTxStream.on("data", decodeDcrwIPC);
      dcrwTxStream.on("error", (e) => e && e.code && e.code != "EOF" && logger.log("error", "tx stream error", e));
      dcrwTxStream.on("close", () => logger.log("info", "eacrwallet tx stream closed"));
    } catch (e) {
      logger.log("error", "can't find proper module to launch eacrwallet: " + e);
    }
  } else {
    args.push("--rpclistenerevents");
    args.push("--pipetx=4");
  }

  // Add any extra args if defined.
  if (argv.extrawalletargs !== undefined && isString(argv.extrawalletargs)) {
    args = concat(args, stringArgv(argv.extrawalletargs));
  }

  logger.log("info", `Starting ${dcrwExe} with ${args}`);

  const eacrwallet = spawn(dcrwExe, args, {
    detached: os.platform() == "win32",
    stdio: [ "ignore", "pipe", "pipe", "ignore", "pipe" ]
  });

  if (os.platform() !== "win32") {
    eacrwallet.stdio[4].on("data", decodeDcrwIPC);
  }

  eacrwallet.on("error", function (err) {
    logger.log("error", "Error running eacrwallet.  Check logs and restart! " + err);
    mainWindow.webContents.executeJavaScript("alert(\"Error running eacrwallet.  Check logs and restart! " + err + "\");");
    mainWindow.webContents.executeJavaScript("window.close();");
  });

  eacrwallet.on("close", (code) => {
    if (daemonIsAdvanced)
      return;
    if (code !== 0) {
      var lastEacrwalletErr = lastErrorLine(GetEacrwalletLogs());
      if (!lastEacrwalletErr || lastEacrwalletErr == "") {
        lastEacrwalletErr = lastPanicLine(GetEacrwalletLogs());
      }
      logger.log("error", "eacrwallet closed due to an error: ", lastEacrwalletErr);
      reactIPC.send("error-received", false, lastEacrwalletErr);
    } else {
      logger.log("info", `eacrwallet exited with code ${code}`);
    }
    ClearEacrwalletLogs();
  });

  const addStdoutToLogListener = (data) => AddToEacrwalletLog(process.stdout, data, debug);

  eacrwallet.stdout.on("data", addStdoutToLogListener);
  eacrwallet.stderr.on("data", (data) => {
    AddToEacrwalletLog(process.stderr, data, debug);
  });

  dcrwPID = eacrwallet.pid;
  logger.log("info", "eacrwallet started with pid:" + dcrwPID);

  eacrwallet.unref();
  return dcrwPID;
};

export const launchDCRLnd = (walletAccount, walletPort, rpcCreds, walletPath,
  testnet, autopilotEnabled) => new Promise((resolve,reject) => {

  if (dcrlndPID === -1) {
    resolve();
  }

  let dcrlndRoot = path.join(walletPath, "dcrlnd");
  let tlsCertPath = path.join(dcrlndRoot, "tls.cert");
  let adminMacaroonPath = path.join(dcrlndRoot, "admin.macaroon");

  let args = [
    "--nolisten",
    "--logdir="+path.join(dcrlndRoot, "logs"),
    "--datadir="+path.join(dcrlndRoot, "data"),
    "--tlscertpath="+tlsCertPath,
    "--tlskeypath="+path.join(dcrlndRoot, "tls.key"),
    "--configfile="+path.join(dcrlndRoot,"dcrlnd.conf"),
    "--adminmacaroonpath="+adminMacaroonPath,
    "--eacred.node=eacrd",
    "--eacrd.rpchost="+rpcCreds.rpc_host+":"+rpcCreds.rpc_port,
    "--eacrd.rpcuser="+rpcCreds.rpc_user,
    "--eacrd.rpcpass="+rpcCreds.rpc_pass,
    "--eacrwallet.grpchost=localhost:"+walletPort,
    "--eacrwallet.certpath="+path.join(walletPath, "rpc.cert"),
    "--eacrwallet.accountnumber="+walletAccount
  ];

  if (testnet) {
    args.push("--eacred.testnet");
  } else {
    args.push("--eacred.mainnet");
  }

  if (autopilotEnabled) {
    args.push("--autopilot.active");
  }

  const dcrlndExe = getExecutablePath("dcrlnd", argv.custombinpath);
  if (!fs.existsSync(dcrlndExe)) {
    logger.log("error", "The dcrlnd executable does not exist. Expected to find it at " + dcrlndExe);
    reject("The dcrlnd executable does not exist at " + dcrlndExe);
  }

  /*
  if (os.platform() == "win32") {
    try {
      const win32ipc = require("../node_modules/win32ipc/build/Release/win32ipc.node");
      eacrdPipeRx = win32ipc.createPipe("out");
      args.push(util.format("--piperx=%d", eacrdPipeRx.readEnd));
    } catch (e) {
      logger.log("error", "can't find proper module to launch eacrd: " + e);
    }
  }
  */

  const fullArgs = args.join(" ");
  logger.log("info", `Starting ${dcrlndExe} with ${fullArgs}`);

  const dcrlnd = spawn(dcrlndExe, args, {
    detached: os.platform() === "win32",
    stdio: [ "ignore", "pipe", "pipe" ]
  });

  dcrlnd.on("error", function (err) {
    reject(err);
  });

  dcrlnd.on("close", (code) => {
    /*
    if (code !== 0) {
      let lastEcrdErr = lastErrorLine(GetEcrdLogs());
      if (!lastEcrdErr || lastEcrdErr === "") {
        lastEcrdErr = lastPanicLine(GetEcrdLogs());
      }
      logger.log("error", "eacrd closed due to an error: ", lastEcrdErr);
      return reject(lastEcrdErr);
    }
    */

    logger.log("info", `dcrlnd exited with code ${code}`);
  });

  dcrlnd.stdout.on("data", (data) => {
    AddToDcrlndLog(process.stdout, data, debug);
    resolve(data.toString("utf-8"));
  });

  dcrlnd.stderr.on("data", (data) => {
    AddToDcrlndLog(process.stderr, data, debug);
    reject(data.toString("utf-8"));
  });

  dcrlndPID = dcrlnd.pid;
  logger.log("info", "dcrlnd started with pid:" + dcrlndPID);

  dcrlnd.unref();

  dcrlndCreds = {
    address: "localhost",
    port: 10009,
    certPath: tlsCertPath,
    macaroonPath: adminMacaroonPath
  };
  return resolve(dcrlndCreds);
});


export const GetDcrwPort = () => dcrwPort;

export const GetEcrdPID = () => eacrdPID;

export const GetDcrwPID = () => dcrwPID;

export const GetDcrlndPID = () => dcrlndPID;
export const GetDcrlndCreds = () => dcrlndCreds;

export const readExesVersion = (app, grpcVersions) => {
  let args = [ "--version" ];
  let exes = [ "eacrd", "eacrwallet", "dcrctl" ];
  let versions = {
    grpc: grpcVersions,
    eacrediton: app.getVersion()
  };

  for (let exe of exes) {
    let exePath = getExecutablePath("eacrd", argv.custombinpath);
    if (!fs.existsSync(exePath)) {
      logger.log("error", "The eacrd executable does not exist. Expected to find it at " + exePath);
    }

    let proc = spawn(exePath, args, { encoding: "utf8" });
    if (proc.error) {
      logger.log("error", `Error trying to read version of ${exe}: ${proc.error}`);
      continue;
    }

    let versionLine = proc.stdout.toString();
    if (!versionLine) {
      logger.log("error", `Empty version line when reading version of ${exe}`);
      continue;
    }

    let decodedLine = versionLine.match(/\w+ version ([^\s]+)/);
    if (decodedLine !== null) {
      versions[exe] = decodedLine[1];
    } else {
      logger.log("error", `Unable to decode version line ${versionLine}`);
    }
  }

  return versions;
};

// connectDaemon starts a new rpc connection to eacrd
export const connectRpcDaemon = async (mainWindow, rpcCreds) => {
  const rpc_host = rpcCreds ? rpcCreds.rpc_host : rpchost;
  const rpc_port = rpcCreds ? rpcCreds.rpc_port : rpcport;
  const rpc_user = rpcCreds ? rpcCreds.rpc_user : rpcuser;
  const rpc_pass = rpcCreds ? rpcCreds.rpc_pass : rpcpass;
  const rpc_cert = rpcCreds ? rpcCreds.rpc_cert : rpccert;

  // During the first startup, the rpc.cert file might not exist for a few
  // seconds. In that case, we wait up to 30s before failing this call.
  let tries = 0;
  let sleep = ms => new Promise(ok => setTimeout(ok, ms));
  while (tries++ < 30 && !fs.existsSync(rpc_cert)) await sleep(1000);
  if (!fs.existsSync(rpc_cert)) {
    return mainWindow.webContents.send("connectRpcDaemon-response", { error: new Error("rpc cert '"+rpc_cert+"' does not exist") });
  }

  var cert = fs.readFileSync(rpc_cert);
  const url = `${rpc_host}:${rpc_port}`;
  if (eacrdSocket && eacrdSocket.readyState === eacrdSocket.OPEN) {
    return mainWindow.webContents.send("connectRpcDaemon-response", { connected: true });
  }
  eacrdSocket = new webSocket(`wss://${url}/ws`, {
    headers: {
      "Authorization": "Basic "+Buffer.from(rpc_user+":"+rpc_pass).toString("base64")
    },
    cert: cert,
    ecdhCurve: "secp521r1",
    ca: [ cert ]
  });
  eacrdSocket.on("open", function() {
    logger.log("info","eacrediton has connected to eacrd instance");
    return mainWindow.webContents.send("connectRpcDaemon-response", { connected: true });
  });
  eacrdSocket.on("error", function(error) {
    logger.log("error",`Error: ${error}`);
    return mainWindow.webContents.send("connectRpcDaemon-response", { connected: false, error });
  });
  eacrdSocket.on("message", function(data) {
    const parsedData = JSON.parse(data);
    const id = parsedData ? parsedData.id : "";
    switch (id) {
    case "getinfo":
      mainWindow.webContents.send("check-getinfo-response", parsedData.result );
      break;
    case "getblockchaininfo": {
      const dataResults = parsedData.result || {};
      const blockCount = dataResults.blocks;
      const syncHeight = dataResults.syncheight;
      mainWindow.webContents.send("check-daemon-response", { blockCount, syncHeight });
      break;
    }
    }
  });
  eacrdSocket.on("close", () => {
    logger.log("info","eacrediton has disconnected to eacrd instance");
  });
};

export const getDaemonInfo = () => eacrdSocket.send("{\"jsonrpc\":\"1.0\",\"id\":\"getinfo\",\"method\":\"getinfo\",\"params\":[]}");

export const getBlockChainInfo = () => new Promise((resolve) => {
  if (eacrdSocket && eacrdSocket.readyState === eacrdSocket.CLOSED) {
    return resolve({});
  }
  eacrdSocket.send("{\"jsonrpc\":\"1.0\",\"id\":\"getblockchaininfo\",\"method\":\"getblockchaininfo\",\"params\":[]}");
});
