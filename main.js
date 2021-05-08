const path = require('path');
const { homedir } = require('os');
const {
  readFileSync,
  // writeFile,
  readdirSync,
  mkdirSync,
} = require('fs');
const { writeFile } = require('fs').promises;
const pause = require('node-pause');

// Define a bunch of file paths
let logPath;
let dataDir;

const exportPath = path.join(homedir(), 'MTGABulkExport', Date.now().toString());

if (process.platform === 'win32') {
  // this on Windows
  logPath = path.join(homedir(), '\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log');
  dataDir = 'C:\\Program Files\\Wizards of the Coast\\MTGA\\MTGA_Data\\Downloads\\Data';
} else if (process.platform === 'darwin') {
  // this on Mac
  logPath = path.join(homedir(), '/Library/Logs/Wizards Of The Coast/MTGA/Player2.log');
  dataDir = path.join(homedir(), '/Library/Application Support/com.wizards.mtga/Downloads/Data');
} else {
  // what OS are you even on
  throw new Error('Unsupported platform');
}

const cardsFileName = readdirSync(dataDir)
  .find((e) => e.startsWith('data_cards') && e.endsWith('.mtga'));
if (cardsFileName === undefined) throw new Error('data_cards file not found');
const cardsPath = path.join(dataDir, cardsFileName);

const dataFileName = readdirSync(dataDir)
  .find((e) => e.startsWith('data_loc') && e.endsWith('.mtga'));
if (dataFileName === undefined) throw new Error('data_loc file not found');
const dataPath = path.join(dataDir, dataFileName);

// Open and parse the three files we need
let logFile;
try {
  logFile = readFileSync(logPath, { encoding: 'utf8' });
} catch (err) {
  if (err.code === 'ENOENT') throw new Error('data_loc file not found');
  else throw err;
}
const cardsFile = readFileSync(cardsPath, { encoding: 'utf8' });
const dataFile = readFileSync(dataPath, { encoding: 'utf8' });

const cardsObj = JSON.parse(cardsFile);
const dataObj = JSON.parse(dataFile)
  .find((lang) => lang.isoCode === 'en-US')
  .keys;

const line = logFile.split('\n')
  .filter((s) => s.startsWith('[UnityCrossThreadLogger]<== Deck.GetDeckListsV3 '))[0]
  .slice('[UnityCrossThreadLogger]<== Deck.GetDeckListsV3 '.length);
const deckObj = JSON.parse(line).payload;

// Parser functions we use below
function parseCard(grpid) {
  const card = cardsObj.find((e) => e.grpid === grpid);
  card.name = dataObj.find((e) => e.id === card.titleId).text;
  return card;
}

function parseArray(arr) {
  if (arr.length % 2 === 1) {
    throw new Error('Array is not in the correct format');
  }
  const pairs = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push([arr[i + 1], arr[i]]);
  }
  return pairs;
}

function printCard(qty, cardId) {
  const card = parseCard(cardId);
  return `${qty} ${card.name} (${card.set}) ${card.collectorNumber}\n`;
}

// We convert the decks into a more manageable form
const decks = deckObj.map((e) => {
  const deck = {
    name: e.name.replaceAll(/[/\\?*<>|]/g, '_'),
    main: parseArray(e.mainDeck),
    side: parseArray(e.sideboard),
    isCompanion: e.isCompanionValid,
  };
  if (deck.isCompanion) deck.companion = e.companionGRPId;
  return deck;
});

// We actually export the decks
mkdirSync(exportPath, { recursive: true });

Promise.all(decks.map(async (e) => {
  let out = '';
  if (e.isCompanion) {
    out += 'Companion\n';
    out += printCard(1, e.companion);
    out += '\n';
  }

  out += 'Deck\n';
  e.main.forEach((c) => {
    out += printCard(c[0], c[1]);
  });
  out += '\nSideboard\n';
  e.side.forEach((c) => {
    out += printCard(c[0], c[1]);
  });
  await writeFile(path.join(exportPath, `${e.name}.txt`), out);
  console.log(`Saved ${e.name}.txt`);
}))
  .then(() => pause('Press any key to exit'))
  .then(() => process.exit());
