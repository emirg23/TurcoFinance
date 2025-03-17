const puppeteer = require('puppeteer');
const firebase = require('firebase-admin');

// Get Firebase credentials from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

// Initialize Firebase Admin SDK
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
});

const db = firebase.firestore();

async function scrapeAndUpload() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',  // Ensure the Chromium path is set for CI/CD environments
      headless: true, // Run in headless mode
    });

    const page = await browser.newPage();
    
    // Wait for the specific table rows to appear before continuing
    await page.goto('https://uzmanpara.milliyet.com.tr/canli-borsa/bist-TUM-hisseleri/', {
      timeout: 60000, // Increase timeout to 60 seconds
    });
    await page.waitForSelector('tr.zebra', { timeout: 60000 }); // Wait for the specific element to load

    const stocks = await page.evaluate(() => {
      const stockElements = document.querySelectorAll('tr.zebra');
      return Array.from(stockElements).map((row) => {
        const symbol = row.querySelector('td.currency b')?.textContent;
        const yuzde = row.querySelector('td[id^="h_td_yuzde_id_"]')?.textContent;
        const fiyat = row.querySelector('td[id^="h_td_fiyat_id_"]')?.textContent;
        return { symbol, yuzde, fiyat };
      });
    });

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
  } catch (error) {
    console.error('Error during scraping or uploading data:', error);
  } finally {
    if (browser) {
      await browser.close(); // Ensure the browser is closed in case of error
    }
  }
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
