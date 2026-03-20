// we will parse the launchpad data from csv file and store it to database

require('module-alias/register');
const fs = require('fs');
const csvParser = require('csv-parser');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

const knex = require('../config/database');
const Launchpad = require('../app/models/launchpad');

const parseDriveUrl = (url) => {
  // we will change the url for direct view image
  // from: 'https://drive.google.com/open?id=1-z4xLjmd1c4747ddG2Erh7m3GN6Sa86S'
  // to: https://drive.google.com/uc?id=1gyq9nGmahePz4PLCodqbmQ9bJmIJJEwm

  const regex = /https:\/\/drive\.google\.com\/open\?id=(.*)/;
  if (regex.test(url)) {
    const id = url.match(regex)[1];
    return `https://drive.google.com/uc?id=${id}`;
  }
  throw new Error('Invalid url');
}

// take filename as input and parse the data
const parseLaunchpad = (filename) => {
  const result = [];

  fs.createReadStream(filename).pipe(csvParser())
    .on("data", async (data) => {
      // sample
      //  Timestamp: '07/03/2023 15:32:27',
      // "1. Collection's name": 'Doodles',
      // '2. Symbol': 'Doodles',
      // '3. Creator wallet address': 'aura1mp5x2ftagq543v7uz9ml64r77ydlsh6mefe4sn',
      // '4. Royalties (%)': '5',
      // '5. Logo image': 'https://drive.google.com/open?id=1fPbzY7DgKJaXQUgyE2uqtJpvKgcqHuyO',
      // '6. Features image': 'https://drive.google.com/open?id=1CLP-bwOjuvn4YzzVMADQZyz-YH2aP8vA',
      // '7.  Banner image': 'https://drive.google.com/open?id=1Fe8DkPBFGzkY3m1DbRS4KYxRPElwJpxS',
      // '8. Category': 'Art',
      // '9. Description': 'A community-driven collectibles project featuring art by Burnt Toast. Doodles come in a joyful range of colors, traits and sizes with a collection size of 10,000. Each Doodle allows its owner to vote for experiences and activations paid for by the Doodles Community Treasury.',
      // '10. Website': 'https://doodles.app/',
      // '11. Twitter': 'https://twitter.com/doodles',
      // '12. Telegram': 'https://web.telegram.org/z/#2125515583',
      // '13. Discord': 'https://discord.com/invite/doodles',
      // '14.1 Other titles': 'whitepaper',
      // '14.2 Other links': 'https://etherscan.io/address/0x8a90cab2b38dba80c64b7734e58ee1db38b8992e',
      // 'Arts - Launchpad banner': 'https://drive.google.com/open?id=1skxf3qPNX_n4O9Vi3qPZgU80_RzXvnLd',
      // 'Arts - Top featured art': 'https://drive.google.com/open?id=1On8g_PEmjTmjh7YNWSGE0TgixrxgDW-U',
      // 'Arts - Featured arts 1': 'https://drive.google.com/open?id=1CD_SDrtGTUyFjRYa44A4fC5qyc3z2S0T',
      // 'Arts - Featured arts 2': 'https://drive.google.com/open?id=1BC95NpOULUkutX1TnTI86TY13tz2LZ_A',
      // 'Arts - Featured arts 3': 'https://drive.google.com/open?id=1j8CXcNvBGifrh50FHJI6jP7PJX45qBNh',
      // 'Arts - Featured arts 4': 'https://drive.google.com/open?id=10C3SahFvIpatBI_nktjmoFwSBtlpWmXd',
      // 'Arts - Featured arts 5': 'https://drive.google.com/open?id=15_0DMZNLJQ7OWiVGyRb2ala1gOpRbXDe',
      // 'Total NFTs': '10000',
      // build object base on data
      const launchpad = {
        // name: data["1. Collection's name"],
        status: 'draft',
        standard_contract_id: 1,
        contract_address: null,
        collection_information: {
          name: data["1. Collection's name"],
          symbol: data["2. Symbol"],
          royalty_percentage: parseInt(data["4. Royalties (%)"], 10),
          royalty_payment_address: data["3. Creator wallet address"],
          max_supply: parseInt(data['Total NFTs'], 10),
          uri_prefix: '',
          uri_suffix: '',
          creator: data["3. Creator wallet address"],
          logo: parseDriveUrl(data["5. Logo image"]),
          feature: parseDriveUrl(data["6. Features image"]),
          banner: parseDriveUrl(data["7.  Banner image"]),
          category: data["8. Category"],
          description: data["9. Description"],
          website: data["10. Website"],
          twitter: data["11. Twitter"],
          telegram: data["12. Telegram"],
          discord: data["13. Discord"],
        },
        project_information: {
          launchpad_banner_art: parseDriveUrl(data["Arts - Launchpad banner"]),
          external_links: {
            other_title: data["14.1 Other titles"],
            other_link: data["14.2 Other links"],
          },
          top_featured_art: parseDriveUrl(data["Arts - Top featured art"]),
          featured_arts: [],
          members: [],
        },
        mintPhases: []
      }

      for (let i = 1; i <= 5; i++) {
        // we just check if the key exists and process
        // 'Arts - Featured arts 1': 'https://drive.google.com/open?id=1CD_SDrtGTUyFjRYa44A4fC5qyc3z2S0T',
        if (data[`Arts - Featured arts ${i}`]) {
          launchpad.project_information.featured_arts.push(parseDriveUrl(data[`Arts - Featured arts ${i}`]));
        }
      }

      // set members to project_information
      for (let i = 1; i <= 10; i++) {
        // we just check if the key exists and process
        // 'Member 1 - Name': 'Dave Broome',
        // 'Member 1 - Title': 'Co-founder and CEO, Orange Comet',
        // 'Member 1 - Introduction': 'Dave Broome has been in the Hollywood scene for nearly 25 years as a mainstream TV/Film producer. In 2002, he launched 25/7 Productions, bringing to life projects like NBC’s The Biggest Loser, Netflix’s Ultimate Beastmaster, and Halftime, a Jennifer Lopez documentary.',
        // 'Member 1 - Linkedin': 'https://twitter.com/OrangeCometNFT',
        // 'Member 1 - Twitter': 'https://twitter.com/OrangeCometNFT',
        // 'Member 1 - Avatar': 'https://drive.google.com/open?id=1AJ_OgdGNVCfz88YGqOfgB0uisHShhu8b',
        if (data[`Member ${i} - Name`]) {
          launchpad.project_information.members.push({
            name: data[`Member ${i} - Name`],
            title: data[`Member ${i} - Title`],
            introduction: data[`Member ${i} - Introduction`],
            linkedin: data[`Member ${i} - Linkedin`],
            twitter: data[`Member ${i} - Twitter`],
            avatar: parseDriveUrl(data[`Member ${i} - Avatar`]),
          });
        }
      }

      const mintPhases = [];
      for (let i = 1; i <= 10; i++) {
        // add first mint phase
        // 'Phase 1 - Name': 'Whitelist OG',
        // 'Phase 1 - Type': 'Whitelist',
        // 'Phase 1 - Wallet quantity in whitelist': '1000',
        // 'Phase 1 - Total NFTs minted': '1000',
        // 'Phase 1 - Price ($AURA)': '3',
        // 'Phase 1 - Start time': '08/03/2023 10:00:00',
        // 'Phase 1 - End time': '10/03/2023 04:56:00',
        // 'Phase 1 - Max NFTs minted per address': '3',
        if (data[`Phase ${i} - Name`]) {
          const start = dayjs(data[`Phase ${i} - Start time`], 'DD/MM/YYYY HH:mm:ss');
          const end = dayjs(data[`Phase ${i} - End time`], 'DD/MM/YYYY HH:mm:ss');
          if (!start.isValid() || !end.isValid()) {
            console.log('Invalid date', data[`Phase ${i} - Start time`], data[`Phase ${i} - End time`]);
            throw new Error(`Invalid date format for phase ${i}`);
          }
          mintPhases.push({
            name: data[`Phase ${i} - Name`],
            type: data[`Phase ${i} - Type`].toLowerCase(),
            starts_at: start,
            ends_at: end,
            config: {
              // to nanoseconds
              start_time: `${start.unix()}000000000`,
              end_time: `${end.unix()}000000000`,
              max_supply: parseInt(data[`Phase ${i} - Total NFTs minted`], 10),
              price: { amount: (Math.floor(Number(data[`Phase ${i} - Price ($AURA)`]) * 1000000)).toString(), denom: 'uaura' },
              is_public: data[`Phase ${i} - Type`] === 'Whitelist' ? false : true,
              max_nfts_per_address: parseInt(data[`Phase ${i} - Max NFTs minted per address`], 10),
              wallet_quantity_in_whitelist: parseInt(data[`Phase ${i} - Wallet quantity in whitelist`], 10), // this field will not be updated to blockchain
            }
          })
        }
      }
      launchpad.mintPhases = mintPhases;
      console.log(launchpad);

      await Launchpad.query().insertGraph(launchpad);
    })
    .on("end", (err) => {
      if (err) {
        console.log(err);
      }
    })

}

// './scripts/launchpad-1.csv'
parseLaunchpad(process.argv[2]);
