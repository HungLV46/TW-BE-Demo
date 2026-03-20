'use strict';

const IPFS_URL_VALID_PREFIX = ['ipfs://', 'https://'];

/**
 * A workaround to test is-ipfs in jest
 * 
 * Dynamic import is needed to import is-ipfs, but that causes Segmentation fault when running test using Jest 
 *  (https://github.com/nodejs/node/issues/35889)
 * 
 * TODO import directly
 */
async function getIsIpfs() {
  return import('is-ipfs');
}

function ipfsURL2Path(isIpfs, ipfsUrlOrPath) {
  if(!ipfsUrlOrPath) return null;

  if (isIpfs.ipfsPath(ipfsUrlOrPath)) return ipfsUrlOrPath;

  const lowerCase = ipfsUrlOrPath.toLowerCase();

  for (let i = 0; i < IPFS_URL_VALID_PREFIX.length; i += 1) {
    const prefix = IPFS_URL_VALID_PREFIX[i];
    if (lowerCase.startsWith(prefix)) {
      return `/ipfs/${ipfsUrlOrPath.slice(prefix.length)}`;
    }
  }

  return null;
}

module.exports = { getIsIpfs, ipfsURL2Path };

