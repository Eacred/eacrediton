// @flow
import axios from "axios";

export const DCRDATA_URL_TESTNET = "https://testnet.eacred.org/api";
export const DCRDATA_URL_MAINNET = "https://eacrdata.eacred.org/api";

const GET = (path) => {
  return axios.get(path);
};

export const getTreasuryInfo = (daURL, treasuryAddress) => GET(daURL + "/address/" + treasuryAddress + "/totals");
