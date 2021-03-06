// @flow
import axios from "axios";

// Uncomment this and comment the following definition to test locally.
// export const POLITEIA_URL_TESTNET = "https://localhost:4443";

// Politeia doc source:
// https://github.com/Eacred/politeia/blob/master/politeiawww/api/www/v1/api.md

export const POLITEIA_URL_TESTNET = "https://test-proposals.eacred.org/api";
export const POLITEIA_URL_MAINNET = "https://proposals.eacred.org/api";

const CSRF_TOKEN_HEADER = "x-csrf-token"; // must always be lowercase

let CSRFPromise = null;

function ensureCSRF(piURL) {
  if (!CSRFPromise) {
    CSRFPromise = axios.get(piURL + "/");
  }
  return CSRFPromise;
}

function GET(piURL, path) {
  return ensureCSRF(piURL).then(() => axios.get(piURL + path));
}

function POST(piURL, path, payload) {
  return ensureCSRF(piURL).then(resp => {
    const cfg = {
      headers: {
        [CSRF_TOKEN_HEADER]: resp.headers[CSRF_TOKEN_HEADER]
      }
    };
    return axios.post(piURL + path, payload, cfg);
  });
}

export const getActiveVotes = (piURL) => GET(piURL, "/v1/proposals/activevote");
export const getVetted = (piURL) => GET(piURL, "/v1/proposals/vetted");
export const getVotesStatus = (piURL) => GET(piURL, "/v1/proposals/votestatus");
export const getProposal = (piURL, token) => GET(piURL, "/v1/proposals/" + token);
export const getProposalVotes = (piURL, token) => GET(piURL, "/v1/proposals/" + token + "/votes");
export const getProposalVoteStatus = (piURL, token) => GET(piURL, "/v1/proposals/" + token + "/votestatus");
export const getTokenInventory = (piURL) => GET(piURL, "/v1/proposals/tokeninventory");

// votes must be an array of Vote()-produced objects.
export const castVotes = (piURL, votes) => POST(piURL, "/v1/proposals/castvotes", { votes });

// tokens is an array of tokens to be fetched.
export const getProposalsBatch = (piURL, tokens) => POST(piURL, "/v1/proposals/batch", { tokens });
export const getProposalsVoteStatusBatch = (piURL, tokens) => POST(piURL, "/v1/proposals/batchvotesummary", { tokens });
