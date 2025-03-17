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
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,  // Use the environment variable for Chromium path
      headless: true, // Run in headless mode
    });
    console.log('Browser launched successfully.');

    const page = await browser.newPage();
    
    console.log('Navigating to URL...');
await page.goto('https://uzmanpara.milliyet.com.tr/canli-borsa/bist-TUM-hisseleri/', {
  waitUntil: 'load', // Wait until the page is fully loaded
  timeout: 120000,
});

    console.log('Page loaded.');

    console.log('Waiting for table rows...');
    await page.waitForSelector('tr.zebra', { timeout: 60000 }); // Wait for the specific element to load
    console.log('Table rows loaded.');

    const stocks = await page.evaluate(() => {
      console.log('Extracting stock data...');
      const stockElements = document.querySelectorAll('tr.zebra');
      return Array.from(stockElements).map((row) => {
        const symbol = row.querySelector('td.currency b')?.textContent;
        const yuzde = row.querySelector('td[id^="h_td_yuzde_id_"]')?.textContent;
        const fiyat = row.querySelector('td[id^="h_td_fiyat_id_"]')?.textContent;
        const zaman = row.querySelector('td[id^="h_td_zaman_id_"]')?.textContent;
        return { symbol, yuzde, fiyat, zaman };
      });
    });
    console.log(`Extracted ${stocks.length} stocks.`);

    // Upload scraped data to Firebase Firestore
    const groupedStocks = groupStocksByFirstLetter(stocks);
    console.log('Grouping stocks by first letter...');
    for (const [letter, group] of Object.entries(groupedStocks)) {
      console.log(`Uploading data for group: ${letter}`);
      const stockData = group.reduce((acc, stock) => {
        acc[stock.symbol] = {
          fiyat: stock.fiyat,
          yuzde: stock.yuzde,
          zaman: stock.zaman
        };
        return acc;
      }, {});

      await db.collection('stocks').doc(letter).set({ stocks: stockData });
      console.log(`Uploaded data for group: ${letter}`);
    }

    console.log('Scraping and Firebase upload completed!');
  } catch (error) {
    console.error('Error during scraping or uploading data:', error);
  } finally {
    if (browser) {
      console.log('Closing browser...');
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
