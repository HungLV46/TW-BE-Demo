const fs = require('fs');
const { create } = require('ipfs-http-client');

const cliProgress = require('cli-progress');
const colors = require('ansi-colors');

require('module-alias/register');
const Launchpad = require('../app/models/launchpad');

// read command arguments
const IPFS_URL = process.argv[2];
const LOCAL_DIRECTORY = process.argv[3];
const LAUNCHPAD_ID = process.argv[4];

const ipfs = create({ url: IPFS_URL });

function createProcessBar(barname, total) {
  const pbar = new cliProgress.SingleBar(
    {
      format: `${colors.cyan(`${barname}`)} | ${colors.cyan('{bar}')} | {percentage}% || {value}/{total} Chunks`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );
  pbar.start(total, 0);
  return pbar;
}

async function makeIPFSDir(dirName) {
  return ipfs.files.mkdir(`/${dirName}`).catch((error) => {
    if (error.toString() !== 'HTTPError: file already exists') throw error;
  });
}

async function uploadFileToIPFSFolder(localDirPath, filename, ipfsDirName) {
  const filedata = fs.readFileSync(`${localDirPath}/${filename}`);
  await ipfs.files.write(`/${ipfsDirName}/${filename}`, filedata, { create: true });
}

// WSL path to Window folder: e.g. /mnt/c/Users/.../Downloads/export_11/images
async function uploadFolder(localDirPath, ipfsDirName) {
  const filenames = fs.readdirSync(localDirPath);
  filenames.sort();
  const numberOfFile = filenames.length;

  console.log(`\nNumber of file:\t\t${numberOfFile}`);
  console.log(`First filename:\t\t${filenames[0]}`);

  const jump = 100;
  // create pbar
  const pbar = createProcessBar('upload files', numberOfFile / jump);
  for (let i = 0; i < numberOfFile; i += jump) {
    const uploadPromisses = filenames
      .slice(i, i + jump)
      .map((filename) =>
        uploadFileToIPFSFolder(localDirPath, filename, ipfsDirName));
    await Promise.all(uploadPromisses);
    pbar.increment();
  }

  const uploadResponse = await ipfs.files.stat(`/${ipfsDirName}`);
  uploadResponse.cid = uploadResponse.cid.toString();
  // verify that all files are uploaded
  if (uploadResponse.blocks !== numberOfFile) {
    console.log(`\nUpload response: ${JSON.stringify(uploadResponse, null, 2)}`);
    throw new Error(`Not all file uploaded. Only ${uploadResponse.blocks}/${numberOfFile} files uploaded`);
  }

  console.log(`\nSuccessfully uploaded to ${ipfsDirName} (cid: "${uploadResponse.cid}")\n`);
  return { folder_cid: uploadResponse.cid, uploaded_file_names: filenames };
}

async function replaceImageURI(uploadImagesResponse, metadataDir) {
  const imageFilenames = uploadImagesResponse.uploaded_file_names;

  const metadataFilenames = fs.readdirSync(metadataDir);
  if (imageFilenames.length !== metadataFilenames.length) {
    throw new Error(
      `Number of image (${imageFilenames.length}) is not equal to number of metadata files (${metadataFilenames.length})`,
    );
  }

  const pbar = createProcessBar('Update metadata', imageFilenames.length);
  for (let i = 0; i < imageFilenames.length; i += 1) {
    const imageFilename = imageFilenames[i];
    const metadataFilePath = `${metadataDir}/${metadataFilenames[i]}`;
    const metadata = JSON.parse(fs.readFileSync(metadataFilePath));
    metadata.image = `ipfs://${uploadImagesResponse.folder_cid}/${imageFilename}`; // update image URI
    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata));
    pbar.increment();
  }
  console.log('\nUpdated metadata URI\n');
}

async function exportImages() {
  const launchpad = await Launchpad.query().findById(LAUNCHPAD_ID);
  const ipfsDirPrefix = `${launchpad.collection_information.name}-${launchpad.id}`;

  // upload image to IPFS
  const imageDirName = 'images';
  const imagesDir = `${LOCAL_DIRECTORY}/${imageDirName}`;
  const imageIPFSDirName = `${ipfsDirPrefix}-${imageDirName}`;
  await makeIPFSDir(imageIPFSDirName);
  let uploadImagesResponse = await uploadFolder(imagesDir, imageIPFSDirName);

  // save response to file
  // const uploadImageResponseFilePath = `${imageDirName}_response.json`;
  // fs.writeFileSync(uploadImageResponseFilePath, JSON.stringify(uploadImagesResponse));
  // uploadImagesResponse = JSON.parse(fs.readFileSync(uploadImageResponseFilePath));

  // update metadata image URI
  const metadataDirName = 'metadata';
  const metadataDir = `${LOCAL_DIRECTORY}/${metadataDirName}`;
  await replaceImageURI(uploadImagesResponse, metadataDir);

  // upload metadata to IPFS
  const metadataIPFSDirName = `${ipfsDirPrefix}-${metadataDirName}`;
  await makeIPFSDir(metadataIPFSDirName);
  let uploadMetadataResponse = await uploadFolder(metadataDir, metadataIPFSDirName);

  // update launchpad prefix
  await launchpad.$query().patch({
      collection_information: {
        ...launchpad.collection_information,
        uri_prefix: `ipfs://${uploadMetadataResponse.folder_cid}/`,
        uri_suffix: '.json',
      },
    })
    .returning('*');
  console.log(launchpad);
}

// node <link-to-script> <url-to-ipfs-gateway> <path-to-local-export-folder> <launchpad-id>
// node ./scripts/ipfs_upload_folder.js http://localhost:5001 /mnt/c/Users/hunglv46/Downloads/export_11 1
exportImages();
