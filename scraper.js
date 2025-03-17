const puppeteer = require('puppeteer'); // Import Puppeteer
const firebase = require('firebase-admin'); // Import Firebase Admin SDK

// Initialize Firebase Admin SDK with your service account
firebase.initializeApp({
  credential: firebase.credential.applicationDefault(),
  databaseURL: "https://your-project-id.firebaseio.com" // Replace with your Firebase project URL
});

const db = firebase.firestore(); // Get Firestore instance

// Function to scrape stock data
async function scrapeAndUpload() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Navigate to the stock page
  await page.goto('https://uzmanpara.milliyet.com.tr/canli-borsa/bist-TUM-hisseleri/');

  // Scrape stock data
  const stocks = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr.zebra');
    const stockData = [];

    rows.forEach(row => {
      const symbol = row.querySelector('td.currency b')?.innerText;
      const yuzde = row.querySelector('td.yuzde')?.innerText;
      const fiyat = row.querySelector('td.fiyat')?.innerText;

      if (symbol && yuzde && fiyat) {
        stockData.push({
          symbol,
          yuzde,
          fiyat,
        });
      }
    });

    return stockData;
  });

  await browser.close();

  // Now, upload the scraped data to Firestore
  uploadStocksToFirebase(stocks);
}

// Function to upload stocks to Firestore
async function uploadStocksToFirebase(stocks) {
  const groupedStocks = groupStocksByFirstLetter(stocks);

  for (const [letter, group] of Object.entries(groupedStocks)) {
    const stockData = {};
    group.forEach(stock => {
      stockData[stock.symbol] = {
        fiyat: stock.fiyat,
        yuzde: stock.yuzde,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      };
    });

    try {
      await db.collection('stocks').doc(letter).set({
        stocks: stockData,
      });
      console.log(`Group ${letter} uploaded successfully`);
    } catch (error) {
      console.error(`Error uploading group ${letter}:`, error);
    }
  }
}

// Helper function to group stocks by their first letter
function groupStocksByFirstLetter(stocks) {
  const groupedStocks = {};

  stocks.forEach(stock => {
    const firstLetter = stock.symbol.charAt(0).toUpperCase();

    if (!groupedStocks[firstLetter]) {
      groupedStocks[firstLetter] = [];
    }
    groupedStocks[firstLetter].push(stock);
  });

  return groupedStocks;
}

// Run the scraper and upload function
scrapeAndUpload()
  .then(() => console.log('Scraping and upload complete!'))
  .catch(error => console.error('Error during scraping and upload:', error));
