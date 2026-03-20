'use strict';

const { CID } = require('multiformats/cid');

const pathPattern = /^\/(ip[fn]s)\/([^/?#]+)/

function ipfsPath (input) {
  const match = input.match(pathPattern)
  if (match == null) {
    return false
  }

  if (match[1] !== 'ipfs') {
    return false
  }

  let hash = match[2]

  return Boolean(CID.parse(hash));
}

async function getIsIpfs() {
  return { ipfsPath };
}

module.exports = { ...jest.requireActual('../is_ipfs_getter.js'), getIsIpfs };
