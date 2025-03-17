// scraper.js

const puppeteer = require('puppeteer');
const firebase = require('firebase-admin');
const serviceAccount = require('./firebase-service-account-key.json');

// Initialize Firebase Admin SDK
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: 'https://your-database-url.firebaseio.com'
});

const db = firebase.firestore();

async function scrapeAndUpload() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://uzmanpara.milliyet.com.tr/canli-borsa/bist-TUM-hisseleri/');

  const stocks = await page.evaluate(() => {
    const stockElements = document.querySelectorAll('tr.zebra');
    return Array.from(stockElements).map((row) => {
      const symbol = row.querySelector('td.currency b')?.textContent;
      const yuzde = row.querySelector('td[id^="h_td_yuzde_id_"]')?.textContent;
      const fiyat = row.querySelector('td[id^="h_td_fiyat_id_"]')?.textContent;
      return { symbol, yuzde, fiyat };
    });
  });

  await browser.close();

  // Upload scraped data to Firebase Firestore
  const groupedStocks = groupStocksByFirstLetter(stocks);
  for (const [letter, group] of Object.entries(groupedStocks)) {
    const stockData = group.reduce((acc, stock) => {
      acc[stock.symbol] = {
        fiyat: stock.fiyat,
        yuzde: stock.yuzde,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };
      return acc;
    }, {});

    await db.collection('stocks').doc(letter).set({ stocks: stockData });
  }

  console.log('Scraping and Firebase upload completed!');
}

function groupStocksByFirstLetter(stocks) {
  return stocks.reduce((acc, stock) => {
    const firstLetter = stock.symbol[0].toUpperCase();
    if (!acc[firstLetter]) acc[firstLetter] = [];
    acc[firstLetter].push(stock);
    return acc;
  }, {});
}

scrapeAndUpload();
